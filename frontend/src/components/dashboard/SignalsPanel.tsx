import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  getDemandColor, getDemandBgColor, getDemandLabel,
  getPeriodLabel, cn,
} from '@/lib/utils';
import { WeatherIcon } from '@/components/ui/weather-icon';
import { Clock, Thermometer, Users, MapPin, Music, AlertCircle, CalendarDays, Star } from 'lucide-react';

interface SignalSnapshot {
  id: string;
  capturedAt: string;
  timeOfDay: string;
  dayOfWeek: string;
  isPublicHoliday: boolean;
  weatherCondition: string;
  temperatureC: string;
  precipitationMm: string;
  period: string;
  nearbyEvents: Array<{
    id: string;
    name: string;
    category: string;
    attendance?: number;
    distanceMetres: number;
    endsAt?: string;
    startsAt?: string;
  }>;
  nearbyVenuesOpen: Array<{
    id: string;
    name: string;
    type: string;
    isOpen: boolean;
    closesAt?: string;
    closesInMinutes?: number;
    priceLevel?: number;
  }>;
  occupancyPct: number;
  demandScore: number;
  staleSignals?: string[];
}

interface SignalsPanelProps {
  signals: SignalSnapshot | null;
  venueName: string;
  capacity: number;
}

function EventCountdown({ endsAt }: { endsAt: string }) {
  const [remaining, setRemaining] = useState('');

  useEffect(() => {
    const update = () => {
      const diff = new Date(endsAt).getTime() - Date.now();
      if (diff <= 0) { setRemaining('Ended'); return; }
      const mins = Math.floor(diff / 60000);
      if (mins < 60) setRemaining(`ends in ${mins}m`);
      else setRemaining(`ends in ${Math.floor(mins / 60)}h ${mins % 60}m`);
    };
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [endsAt]);

  return <span className="text-amber-400 text-xs">{remaining}</span>;
}

export function SignalsPanel({ signals, venueName, capacity }: SignalsPanelProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!signals) {
    return (
      <div className="space-y-4">
        <Card className="border-border/50">
          <CardContent className="pt-6">
            <div className="text-center text-muted-foreground py-8">
              <AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">Collecting signals...</p>
              <p className="text-xs mt-1 opacity-60">First signal in ~30 seconds</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const demandScore = signals.demandScore;
  const tempC = parseFloat(String(signals.temperatureC));
  const precip = parseFloat(String(signals.precipitationMm));
  const closingSoon = signals.nearbyVenuesOpen.filter(
    (v) => v.closesInMinutes !== undefined && v.closesInMinutes >= 0 && v.closesInMinutes <= 30
  );

  return (
    <div className="space-y-4">
      {/* Time + Period */}
      <Card className="border-border/50">
        <CardHeader className="pb-3 pt-4 px-4">
          <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
            Live Signals
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-4">
          {/* Time */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="font-mono text-lg font-semibold">
                {time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            </div>
            <div className="flex gap-2">
              <Badge variant="secondary" className="text-xs">
                {getPeriodLabel(signals.period)}
              </Badge>
              {signals.isPublicHoliday && (
                <Badge variant="warning" className="text-xs">Bank Holiday</Badge>
              )}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {signals.dayOfWeek} · {new Date(signals.capturedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} last update
          </div>

          {/* Demand Score */}
          <div className={cn('rounded-lg border p-4', getDemandBgColor(demandScore))}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Demand Score
              </span>
              <Badge variant="outline" className={cn('text-xs', getDemandColor(demandScore))}>
                {getDemandLabel(demandScore)}
              </Badge>
            </div>
            <div className={cn('text-5xl font-bold', getDemandColor(demandScore))}>
              {demandScore}
            </div>
            <Progress value={demandScore} className="mt-3 h-1.5" />
          </div>

          {/* Weather */}
          <div className="flex items-center justify-between py-2 border-b border-border/30">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-secondary/60 border border-border/40 flex items-center justify-center shrink-0">
                <WeatherIcon condition={signals.weatherCondition} className="h-5 w-5 text-blue-400" />
              </div>
              <div>
                <div className="text-sm font-medium capitalize">
                  {signals.weatherCondition.replace('_', ' ')}
                </div>
                <div className="text-xs text-muted-foreground">
                  {precip > 0 ? `${precip}mm precipitation` : 'No precipitation'}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1 text-sm font-semibold">
              <Thermometer className="h-4 w-4 text-muted-foreground" />
              {tempC.toFixed(1)}°C
            </div>
          </div>

          {/* Occupancy */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-sm">
                <Users className="h-4 w-4 text-muted-foreground" />
                <span>Occupancy</span>
              </div>
              <span className="text-sm font-semibold">{signals.occupancyPct}%</span>
            </div>
            <div className="relative h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-500',
                  signals.occupancyPct >= 80 ? 'bg-green-500' :
                  signals.occupancyPct >= 50 ? 'bg-amber-500' : 'bg-red-500'
                )}
                style={{ width: `${signals.occupancyPct}%` }}
              />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {Math.round(signals.occupancyPct / 100 * capacity)} of {capacity} capacity
            </div>
          </div>

          {/* Stale signals warning */}
          {signals.staleSignals && signals.staleSignals.length > 0 && (
            <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-md p-2">
              <AlertCircle className="h-3.5 w-3.5 text-amber-400 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-400">
                Stale data: {signals.staleSignals.join(', ')} — using cached values
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Nearby Events */}
      {signals.nearbyEvents.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
              <Music className="h-3.5 w-3.5" />
              Nearby Events ({signals.nearbyEvents.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            {signals.nearbyEvents.slice(0, 5).map((event) => {
              const impact = event.attendance && event.attendance > 5000 ? 'high' :
                            event.attendance && event.attendance > 500 ? 'med' : 'low';
              return (
                <div key={event.id} className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{event.name}</div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <span className="capitalize">{event.category}</span>
                      {event.attendance && (
                        <span>· {event.attendance.toLocaleString()} attending</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">
                        {event.distanceMetres}m away
                      </span>
                      {event.endsAt && <EventCountdown endsAt={event.endsAt} />}
                    </div>
                  </div>
                  <Badge
                    variant={impact === 'high' ? 'success' : impact === 'med' ? 'warning' : 'secondary'}
                    className="text-xs shrink-0"
                  >
                    {impact}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Nearby Venues */}
      {signals.nearbyVenuesOpen.length > 0 && (
        <Card className="border-border/50">
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5" />
              Nearby Venues
              {closingSoon.length > 0 && (
                <Badge variant="warning" className="text-xs">{closingSoon.length} closing soon</Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {signals.nearbyVenuesOpen.slice(0, 8).map((venue) => (
              <div key={venue.id} className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className="text-sm truncate">{venue.name}</span>
                  {venue.priceLevel && (
                    <span className="text-xs text-muted-foreground ml-1">
                      {'£'.repeat(venue.priceLevel)}
                    </span>
                  )}
                </div>
                <div className="shrink-0">
                  {!venue.isOpen ? (
                    <Badge variant="secondary" className="text-xs">Closed</Badge>
                  ) : venue.closesInMinutes !== undefined && venue.closesInMinutes <= 30 ? (
                    <Badge variant="warning" className="text-xs">
                      Closing in {venue.closesInMinutes}m
                    </Badge>
                  ) : (
                    <Badge variant="success" className="text-xs">Open</Badge>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
