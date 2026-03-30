import axios from 'axios';
import { getDb, schema } from '../db';
import { cacheGet, cacheSet } from '../lib/redis';
import { eq } from 'drizzle-orm';
import type {
  NearbyEvent,
  NearbyVenue,
  WeatherCondition,
  TimePeriod,
} from '@pricepulse/shared';

// ─── Weather Code Mapping ─────────────────────────────────────────────────────

function mapWeatherCode(code: number): WeatherCondition {
  if ([0].includes(code)) return 'clear';
  if ([1, 2, 3].includes(code)) return 'cloudy';
  if ([45, 48].includes(code)) return 'fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'drizzle';
  if ([61, 63, 80, 81].includes(code)) return 'rain';
  if ([65, 82].includes(code)) return 'heavy_rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  if ([95, 96, 99].includes(code)) return 'heavy_rain';
  return 'cloudy';
}

// ─── Time Period ──────────────────────────────────────────────────────────────

function getTimePeriod(hour: number): TimePeriod {
  if (hour >= 0 && hour < 6) return 'early_morning';
  if (hour >= 6 && hour < 11) return 'breakfast';
  if (hour >= 11 && hour < 14) return 'lunch';
  if (hour >= 14 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'dinner';
  return 'late_night';
}

const PERIOD_LABELS: Record<TimePeriod, string> = {
  early_morning: 'Early Morning',
  breakfast: 'Breakfast',
  lunch: 'Lunch Rush',
  afternoon: 'Afternoon',
  dinner: 'Dinner Rush',
  late_night: 'Late Night',
};

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// ─── UK Bank Holidays ─────────────────────────────────────────────────────────

interface BankHolidayData {
  'england-and-wales': { events: Array<{ date: string }> };
}

async function isUKBankHoliday(date: Date): Promise<boolean> {
  const cacheKey = 'bank_holidays_uk';
  let data = await cacheGet<BankHolidayData>(cacheKey);

  if (!data) {
    try {
      const resp = await axios.get<BankHolidayData>(
        'https://www.gov.uk/bank-holidays.json',
        { timeout: 5000 }
      );
      data = resp.data;
      await cacheSet(cacheKey, data, 86400); // cache 24h
    } catch (err) {
      console.warn('[Signals] Bank holidays fetch failed:', (err as Error).message);
      return false;
    }
  }

  const dateStr = date.toISOString().split('T')[0];
  return data['england-and-wales'].events.some((e) => e.date === dateStr);
}

// ─── Weather via Open-Meteo ───────────────────────────────────────────────────

interface WeatherResult {
  condition: WeatherCondition;
  temperatureC: number;
  precipitationMm: number;
  windspeedKmh: number;
  raw: unknown;
}

async function fetchWeather(lat: number, lng: number): Promise<WeatherResult> {
  const cacheKey = `weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = await cacheGet<WeatherResult>(cacheKey);
  if (cached) return cached;

  const base = process.env.OPEN_METEO_BASE_URL || 'https://api.open-meteo.com';
  const resp = await axios.get(`${base}/v1/forecast`, {
    params: {
      latitude: lat,
      longitude: lng,
      current: 'temperature_2m,precipitation,weathercode,windspeed_10m',
      timezone: 'Europe/London',
    },
    timeout: 8000,
  });

  const cur = resp.data.current;
  const result: WeatherResult = {
    condition: mapWeatherCode(cur.weathercode),
    temperatureC: cur.temperature_2m,
    precipitationMm: cur.precipitation,
    windspeedKmh: cur.windspeed_10m,
    raw: resp.data,
  };

  await cacheSet(cacheKey, result, 60);
  return result;
}

// ─── Nearby Events via PredictHQ ─────────────────────────────────────────────

async function fetchNearbyEvents(lat: number, lng: number): Promise<NearbyEvent[]> {
  const apiKey = process.env.PREDICTHQ_API_KEY;
  if (!apiKey) return [];

  const cacheKey = `events:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = await cacheGet<NearbyEvent[]>(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get('https://api.predicthq.com/v1/events/', {
      headers: { Authorization: `Bearer ${apiKey}` },
      params: {
        within: `1km@${lat},${lng}`,
        'active.gte': new Date().toISOString(),
        limit: 10,
        sort: 'rank',
        category: 'concerts,sports,festivals,conferences,community',
        fields: 'id,title,category,phq_attendance,predicted_end,start,location',
      },
      timeout: 8000,
    });

    const events: NearbyEvent[] = (resp.data.results || []).map((e: Record<string, unknown>) => ({
      id: e.id as string,
      name: e.title as string,
      category: e.category as string,
      attendance: e.phq_attendance as number | undefined,
      distanceMetres: 500, // approximation within 1km radius
      startsAt: e.start as string | undefined,
      endsAt: e.predicted_end as string | undefined,
      location: Array.isArray(e.location)
        ? `${(e.location as number[])[1]},${(e.location as number[])[0]}`
        : undefined,
    }));

    await cacheSet(cacheKey, events, 60);
    return events;
  } catch (err) {
    console.warn('[Signals] PredictHQ fetch failed:', (err as Error).message);
    return [];
  }
}

// ─── Nearby Venues via Google Places ─────────────────────────────────────────

async function fetchNearbyVenues(lat: number, lng: number): Promise<NearbyVenue[]> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) return [];

  const cacheKey = `nearby_venues:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = await cacheGet<NearbyVenue[]>(cacheKey);
  if (cached) return cached;

  try {
    const resp = await axios.get(
      'https://maps.googleapis.com/maps/api/place/nearbysearch/json',
      {
        params: {
          location: `${lat},${lng}`,
          radius: 500,
          type: 'bar|night_club|pub',
          key: apiKey,
        },
        timeout: 8000,
      }
    );

    const now = new Date();
    const venues: NearbyVenue[] = (resp.data.results || []).slice(0, 10).map(
      (p: Record<string, unknown>) => {
        const periods = (p.opening_hours as Record<string, unknown> | undefined)?.periods;
        let closesAt: string | undefined;
        let closesInMinutes: number | undefined;

        if (Array.isArray(periods)) {
          const todayPeriod = (periods as Array<{ close?: { day: number; time: string } }>).find(
            (period) => period.close && period.close.day === now.getDay()
          );
          if (todayPeriod?.close) {
            const closeHour = parseInt(todayPeriod.close.time.substring(0, 2));
            const closeMin = parseInt(todayPeriod.close.time.substring(2, 4));
            const closeTime = new Date();
            closeTime.setHours(closeHour, closeMin, 0, 0);
            closesAt = closeTime.toISOString();
            closesInMinutes = Math.round((closeTime.getTime() - now.getTime()) / 60000);
          }
        }

        return {
          id: p.place_id as string,
          name: p.name as string,
          type: ((p.types as string[]) || [])[0] || 'bar',
          isOpen: (p.opening_hours as Record<string, boolean> | undefined)?.open_now ?? true,
          closesAt,
          closesInMinutes,
          priceLevel: p.price_level as number | undefined,
          rating: p.rating as number | undefined,
        };
      }
    );

    await cacheSet(cacheKey, venues, 120);
    return venues;
  } catch (err) {
    console.warn('[Signals] Google Places fetch failed:', (err as Error).message);
    return [];
  }
}

// ─── Demand Score Computation ─────────────────────────────────────────────────

function computeDemandScore(params: {
  period: TimePeriod;
  dayOfWeek: string;
  isPublicHoliday: boolean;
  weatherCondition: WeatherCondition;
  precipitationMm: number;
  nearbyEvents: NearbyEvent[];
  nearbyVenues: NearbyVenue[];
  occupancyPct: number | null;
}): number {
  let score = 50;

  // Time premium: late night Fri/Sat = +15, Mon lunch = 0
  const isWeekend = ['Friday', 'Saturday'].includes(params.dayOfWeek);
  const isSunday = params.dayOfWeek === 'Sunday';

  if (params.period === 'late_night' && isWeekend) score += 15;
  else if (params.period === 'late_night' && isSunday) score += 8;
  else if (params.period === 'late_night') score += 5;
  else if (params.period === 'dinner' && isWeekend) score += 10;
  else if (params.period === 'dinner') score += 6;
  else if (params.period === 'lunch' && isWeekend) score += 4;
  else if (params.period === 'lunch') score += 3;
  else if (params.period === 'afternoon') score += 1;
  else if (params.period === 'breakfast') score -= 5;
  else if (params.period === 'early_morning') score -= 10;

  if (params.isPublicHoliday) score += 8;

  // Weather: rain indoors = +5 to +10, storms keep people home = -10
  if (['rain', 'drizzle'].includes(params.weatherCondition)) score += 7;
  if (params.weatherCondition === 'heavy_rain') {
    if (params.precipitationMm > 5) score -= 5; // very heavy = people stay home
    else score += 3;
  }
  if (params.weatherCondition === 'snow') score -= 8;
  if (params.weatherCondition === 'fog') score -= 3;
  if (params.weatherCondition === 'clear' && ['dinner', 'late_night'].includes(params.period)) score += 3;

  // Nearby events
  for (const event of params.nearbyEvents) {
    const att = event.attendance || 100;
    const eventScore = Math.min(20, Math.floor(att / 100));
    score += eventScore;
  }

  // Nearby venues closing soon (crowd displacement)
  const closingSoon = params.nearbyVenues.filter(
    (v) => v.closesInMinutes !== undefined && v.closesInMinutes >= 0 && v.closesInMinutes <= 30
  );
  score += Math.min(10, closingSoon.length * 4);

  // Occupancy — only factor in if the venue is actively tracking it (non-null, non-zero)
  // A value of 0 or null means "not configured", not "empty venue"
  const occ = params.occupancyPct;
  if (occ !== null && occ > 0) {
    if (occ >= 90) score += 10;
    else if (occ >= 70) score += 5;
    else if (occ < 30) score -= 10;
  }

  return Math.max(0, Math.min(100, score));
}

// ─── Main Signal Collector ────────────────────────────────────────────────────

export async function collectSignals(venueId: string): Promise<typeof schema.signalSnapshots.$inferInsert> {
  const db = getDb();
  const venue = await db.query.venues.findFirst({ where: eq(schema.venues.id, venueId) });
  if (!venue) throw new Error(`Venue ${venueId} not found`);

  const now = new Date();
  const hour = now.getHours();
  const timeOfDay = `${String(hour).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const dayOfWeek = DAY_NAMES[now.getDay()];
  const period = getTimePeriod(hour);
  const lat = parseFloat(String(venue.lat));
  const lng = parseFloat(String(venue.lng));

  const staleSignals: string[] = [];

  // Collect all signals, never failing on individual source
  const [isPublicHoliday, weather, nearbyEvents, nearbyVenues] = await Promise.all([
    isUKBankHoliday(now).catch((e) => {
      console.warn('[Signals] Bank holiday check failed:', e.message);
      staleSignals.push('bank_holidays');
      return false;
    }),
    fetchWeather(lat, lng).catch((e) => {
      console.warn('[Signals] Weather fetch failed:', e.message);
      staleSignals.push('weather');
      return { condition: 'clear' as WeatherCondition, temperatureC: 15, precipitationMm: 0, windspeedKmh: 0, raw: null };
    }),
    fetchNearbyEvents(lat, lng).catch((e) => {
      console.warn('[Signals] Events fetch failed:', e.message);
      staleSignals.push('nearby_events');
      return [] as NearbyEvent[];
    }),
    fetchNearbyVenues(lat, lng).catch((e) => {
      console.warn('[Signals] Venues fetch failed:', e.message);
      staleSignals.push('nearby_venues');
      return [] as NearbyVenue[];
    }),
  ]);

  const occupancyPct = venue.currentOccupancyPct;

  const demandScore = computeDemandScore({
    period,
    dayOfWeek,
    isPublicHoliday,
    weatherCondition: weather.condition,
    precipitationMm: weather.precipitationMm,
    nearbyEvents,
    nearbyVenues,
    occupancyPct,
  });

  const snapshot: typeof schema.signalSnapshots.$inferInsert = {
    venueId,
    capturedAt: now,
    timeOfDay,
    dayOfWeek,
    isPublicHoliday,
    weatherCondition: weather.condition,
    temperatureC: String(weather.temperatureC),
    precipitationMm: String(weather.precipitationMm),
    period,
    nearbyEvents,
    nearbyVenuesOpen: nearbyVenues,
    occupancyPct,
    demandScore,
    rawWeatherData: weather.raw,
    staleSignals,
  };

  const [saved] = await db.insert(schema.signalSnapshots).values(snapshot).returning();
  console.log(`[Signals] Venue ${venue.name} — demand score: ${demandScore}, period: ${PERIOD_LABELS[period]}`);

  return saved;
}

export { getTimePeriod, PERIOD_LABELS, computeDemandScore, mapWeatherCode };
