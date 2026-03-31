import { useMemo, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useAuthStore } from '@/store/authStore';
import { useVenueStore } from '@/store/venueStore';
import { useInventoryStore } from '@/store/inventoryStore';
import { cn } from '@/lib/utils';
import {
  ComposedChart, AreaChart, BarChart, LineChart,
  PieChart, RadarChart,
  Area, Bar, Line, Pie, Cell, Radar,
  PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, ArrowUpRight, ArrowDownRight,
  Minus, DollarSign, CalendarDays, Activity,
  Package, Zap, ChevronRight,
} from 'lucide-react';

// ── Design tokens (aligned with app warm-orange theme) ─────────────────────

const C = {
  primary: '#D25F2A',   // warm orange
  rose:    '#F43F5E',   // rose / alert
  muted:   '#9A9189',   // muted warm grey
  warm2:   '#7C6355',   // dark brown — secondary chart series
  warm3:   '#C4A882',   // tan — tertiary chart series
  warm4:   '#E8956D',   // light orange — quaternary
};

const GRID   = '#f1ece6';   // warm light grid line
const TICK   = '#a89280';   // muted warm axis text
const CHART_H = { main: 280, mid: 220, small: 200 };

// ── Deterministic seeded pseudo-random ────────────────────────────────────

function sr(n: number): number {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ── 30-day dataset (deterministic) ────────────────────────────────────────

const TODAY_STR = '2026-03-19';
const DATA_30 = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(TODAY_STR);
  d.setDate(d.getDate() - (29 - i));
  const dow     = d.getDay();
  const isFri   = dow === 5;
  const isWknd  = dow === 0 || dow === 6;
  const isMon   = dow === 1;
  const trend   = 1 + i * 0.0035;

  const revenue  = Math.round(((isFri ? 5300 : isWknd ? 4500 : isMon ? 2100 : 2750) + (sr(i)      - 0.5) * 720) * trend);
  const bookings = Math.max(6, Math.round(((isFri ? 46 : isWknd ? 40 : 20)           + (sr(i+30)  - 0.5) * 9)  * trend));
  const occupancy= Math.min(97, Math.max(32, Math.round(((isFri ? 88 : isWknd ? 78 : 56) + (sr(i+60) - 0.5) * 11) * trend)));
  const priceIdx = parseFloat((1.03 + occupancy * 0.0028 + (sr(i+90) - 0.5) * 0.038).toFixed(2));
  const label    = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

  return { date: label, fullDate: d, revenue, bookings, occupancy, priceIdx, dow };
});

const DATA_7  = DATA_30.slice(23);
const DATA_14 = DATA_30.slice(16);

// Normalised multi-metric (0-100) for overlay trend chart
const MAX_REV  = Math.max(...DATA_14.map(d => d.revenue));
const MAX_BOOK = Math.max(...DATA_14.map(d => d.bookings));
const TREND_14 = DATA_14.map(d => ({
  date:      d.date,
  revenue:   Math.round(d.revenue   / MAX_REV  * 100),
  bookings:  Math.round(d.bookings  / MAX_BOOK * 100),
  occupancy: d.occupancy,
}));

// 24-hour daily pattern
const HOURS_24 = Array.from({ length: 24 }, (_, h) => {
  const isPeak = (h >= 12 && h <= 14) || (h >= 18 && h <= 22);
  const isMid  = (h >= 10 && h <= 11) || (h >= 15 && h <= 17);
  const base   = isPeak ? 76 : isMid ? 46 : h < 9 ? 0 : 18;
  const covers = Math.max(0, Math.round((isPeak ? 31 : isMid ? 16 : h < 9 ? 0 : 7) + (sr(h+200) - 0.5) * 6));
  return {
    hour:      `${String(h).padStart(2,'0')}:00`,
    shortHour: h % 3 === 0 ? `${String(h).padStart(2,'0')}h` : '',
    occupancy: Math.max(0, base + Math.round((sr(h+300) - 0.5) * 10)),
    covers,
  };
});

// Category revenue split
const CAT_REVENUE = [
  { name: 'Bar',          value: 38, color: C.warm2   },
  { name: 'Hot Kitchen',  value: 28, color: C.primary },
  { name: 'Cold Kitchen', value: 14, color: C.muted   },
  { name: 'Desserts',     value: 11, color: C.warm3   },
  { name: 'Prep',         value:  9, color: C.warm4   },
];

// Radar dimensions
const RADAR_DATA = [
  { metric: 'Revenue',    A: 82 },
  { metric: 'Occupancy',  A: 74 },
  { metric: 'Pricing',    A: 88 },
  { metric: 'Inventory',  A: 61 },
  { metric: 'Bookings',   A: 79 },
];

// ── Trends datasets (deterministic) ──────────────────────────────────────

// Hourly: revenue estimate per hour based on occupancy profile
const TREND_HOURLY = HOURS_24.map((h, i) => ({
  label:    h.hour,
  revenue:  Math.round(h.occupancy * 18 + (sr(i + 400) - 0.5) * 80),
  bookings: h.covers,
  occupancy: h.occupancy,
}));

// Weekly: last 12 weeks
const TREND_WEEKLY = Array.from({ length: 12 }, (_, i) => {
  const weekIdx = 11 - i;
  const trend   = 1 + i * 0.012;
  const revenue = Math.round((18200 + (sr(i + 700) - 0.5) * 3200) * trend);
  const bookings= Math.round((148  + (sr(i + 720) - 0.5) * 24)  * trend);
  const occ     = Math.min(94, Math.round((62 + (sr(i + 740) - 0.5) * 12) * trend));
  const weekStart = new Date('2026-03-19');
  weekStart.setDate(weekStart.getDate() - weekIdx * 7);
  return {
    label:     `W${weekStart.toLocaleDateString('en-GB', { day:'numeric', month:'short' })}`,
    revenue, bookings, occupancy: occ,
  };
});

// Monthly: last 12 months
const TREND_MONTHLY = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(2026, 2, 1); // March 2026
  d.setMonth(d.getMonth() - (11 - i));
  const isSummer = d.getMonth() >= 5 && d.getMonth() <= 8;
  const isWinter = d.getMonth() === 11 || d.getMonth() <= 1;
  const base = isSummer ? 92000 : isWinter ? 68000 : 78000;
  const trend = 1 + i * 0.008;
  return {
    label:     d.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }),
    revenue:   Math.round((base  + (sr(i + 800) - 0.5) * 9000) * trend),
    bookings:  Math.round((610   + (sr(i + 820) - 0.5) * 80)   * trend),
    occupancy: Math.min(96, Math.round((65 + (sr(i + 840) - 0.5) * 10) * trend)),
  };
});

// Yearly: last 5 years
const TREND_YEARLY = [2022, 2023, 2024, 2025, 2026].map((yr, i) => ({
  label:    String(yr),
  revenue:  Math.round(720000 * (1 + i * 0.14) + (sr(i + 900) - 0.5) * 40000),
  bookings: Math.round(5800   * (1 + i * 0.11) + (sr(i + 920) - 0.5) * 300),
  occupancy:Math.min(94, Math.round(58 + i * 3.8 + (sr(i + 940) - 0.5) * 4)),
}));

// ── Formatters ────────────────────────────────────────────────────────────

const fmtGBP  = (v: number) => v >= 1000 ? `£${(v/1000).toFixed(1)}k` : `£${v}`;
const fmtFull = (v: number) => `£${v.toLocaleString('en-GB')}`;
const fmtPct  = (v: number) => `${v}%`;

// ── Custom Tooltip ─────────────────────────────────────────────────────────

interface TPayload { color: string; name: string; value: number | string; dataKey?: string }

function ChartTip({
  active, payload, label,
  fmt,
}: {
  active?: boolean;
  payload?: TPayload[];
  label?: string;
  fmt?: (v: number, name: string) => string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-[#E2DDD4] rounded-xl shadow-lg px-3.5 py-3 text-xs min-w-[130px]">
      {label && <p className="text-[11px] font-semibold text-[#1C1916] mb-2">{label}</p>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 mb-1 last:mb-0">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
          <span className="text-[#756C64] truncate">{p.name}</span>
          <span className="font-semibold text-[#1C1916] ml-auto tabular-nums">
            {fmt ? fmt(Number(p.value), p.name) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Chart card shell ───────────────────────────────────────────────────────

function ChartCard({
  title, subtitle, badge, badgeColor = 'text-emerald-700 bg-emerald-50 border-emerald-200',
  children, className,
}: {
  title: string; subtitle?: string; badge?: string; badgeColor?: string;
  children: React.ReactNode; className?: string;
}) {
  return (
    <div className={cn('bg-white rounded-2xl border border-[#E2DDD4] shadow-sm p-5 flex flex-col', className)}>
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-[13px] font-bold text-[#1C1916] tracking-tight">{title}</h3>
          {subtitle && <p className="text-[11px] text-[#756C64] mt-0.5">{subtitle}</p>}
        </div>
        {badge && (
          <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border', badgeColor)}>
            {badge}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

// ── KPI stat card ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, change, changeLabel = 'vs last week',
  color, icon: Icon, sparkData,
}: {
  label: string; value: string; change: number; changeLabel?: string;
  color: string; icon: React.ComponentType<{ className?: string }>; sparkData: { v: number }[];
}) {
  const up = change > 0;
  const neutral = change === 0;
  return (
    <div className="bg-white rounded-2xl border border-[#E2DDD4] shadow-sm px-4 py-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}18`, color }}>
          <Icon className="h-4 w-4" />
        </div>
        <div className={cn(
          'flex items-center gap-0.5 text-[10px] font-semibold rounded-full px-2 py-0.5',
          neutral ? 'text-[#756C64] bg-[#EDE9E1]' :
          up ? 'text-[#D25F2A] bg-orange-50' : 'text-[#F43F5E] bg-red-50',
        )}>
          {neutral ? <Minus className="h-2.5 w-2.5" /> : up ? <ArrowUpRight className="h-2.5 w-2.5" /> : <ArrowDownRight className="h-2.5 w-2.5" />}
          {Math.abs(change)}{typeof change === 'number' && !label.includes('Index') ? '%' : ''}
        </div>
      </div>

      <div>
        <p className="text-2xl font-bold text-[#1C1916] tracking-tight tabular-nums">{value}</p>
        <p className="text-[11px] text-[#756C64] mt-0.5">{label}</p>
      </div>

      {/* Sparkline */}
      <div className="h-10 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={sparkData}>
            <Line
              type="monotone" dataKey="v" dot={false} strokeWidth={1.5}
              stroke={color} strokeOpacity={0.8}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <p className="text-[10px] text-[#a89280]">{changeLabel}</p>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const { user }    = useAuthStore();
  const { selectedVenueId, venues } = useVenueStore();
  const { items }   = useInventoryStore();
  const venue       = venues.find((v) => v.id === selectedVenueId);
  const firstName   = user?.name?.split(' ')[0] ?? 'there';

  const [range, setRange] = useState<'7d' | '14d' | '30d'>('30d');
  const chartData = range === '7d' ? DATA_7 : range === '14d' ? DATA_14 : DATA_30;

  // ── KPI computations ──────────────────────────────────────────────────
  const thisWeek = DATA_30.slice(23);
  const lastWeek = DATA_30.slice(16, 23);
  const weekRev  = thisWeek.reduce((s, d) => s + d.revenue,  0);
  const prevRev  = lastWeek.reduce((s, d) => s + d.revenue,  0);
  const weekBook = thisWeek.reduce((s, d) => s + d.bookings, 0);
  const prevBook = lastWeek.reduce((s, d) => s + d.bookings, 0);
  const avgOcc   = Math.round(thisWeek.reduce((s, d) => s + d.occupancy, 0) / 7);
  const prevOcc  = Math.round(lastWeek.reduce((s, d) => s + d.occupancy, 0) / 7);
  const avgPrice = parseFloat((thisWeek.reduce((s, d) => s + d.priceIdx, 0) / 7).toFixed(2));
  const prevPrice= parseFloat((lastWeek.reduce((s, d) => s + d.priceIdx, 0) / 7).toFixed(2));
  const lowCount = items.filter(i => i.status === 'low').length;

  const [trendPeriod, setTrendPeriod] = useState<'hourly' | 'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');

  // Inventory by category
  const invByCategory = useMemo(() => {
    const map: Record<string, { onHand: number; parLevel: number; low: number }> = {};
    for (const item of items) {
      if (!map[item.category]) map[item.category] = { onHand: 0, parLevel: 0, low: 0 };
      map[item.category].onHand    += item.onHand;
      map[item.category].parLevel  += item.parLevel;
      if (item.status === 'low') map[item.category].low++;
    }
    return Object.entries(map).map(([cat, d]) => ({
      name:     cat.replace(' Kitchen', ' Kit.'),
      onHand:   d.onHand,
      parLevel: d.parLevel,
      gap:      Math.max(0, d.parLevel - d.onHand),
      pct:      Math.round(d.onHand / d.parLevel * 100),
      alerts:   d.low,
    }));
  }, [items]);

  const KPI_CARDS = [
    {
      label: 'Weekly revenue', value: fmtGBP(weekRev),
      change: Math.round(((weekRev - prevRev) / prevRev) * 100),
      color: C.primary, icon: DollarSign,
      sparkData: DATA_30.map(d => ({ v: d.revenue })),
    },
    {
      label: 'Weekly bookings', value: String(weekBook),
      change: Math.round(((weekBook - prevBook) / prevBook) * 100),
      color: C.primary, icon: CalendarDays,
      sparkData: DATA_30.map(d => ({ v: d.bookings })),
    },
    {
      label: 'Avg occupancy', value: `${avgOcc}%`,
      change: avgOcc - prevOcc, changeLabel: 'pp vs last week',
      color: C.muted, icon: Activity,
      sparkData: DATA_30.map(d => ({ v: d.occupancy })),
    },
    {
      label: 'Avg price index', value: `×${avgPrice}`,
      change: parseFloat(((avgPrice - prevPrice) / prevPrice * 100).toFixed(1)),
      color: C.primary, icon: Zap,
      sparkData: DATA_30.map(d => ({ v: d.priceIdx })),
    },
    {
      label: 'Stock alerts', value: String(lowCount),
      change: -2, changeLabel: '2 resolved this week',
      color: lowCount > 0 ? C.rose : C.primary, icon: Package,
      sparkData: Array.from({ length: 30 }, (_, i) => ({ v: Math.max(0, lowCount + Math.round((sr(i+500) - 0.5) * 3)) })),
    },
  ];

  const now = new Date();
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <AppLayout>
      <div className="min-h-0 flex-1 overflow-y-auto bg-[#FAF9F6]">
        <div className="max-w-[1400px] mx-auto px-6 py-6 space-y-5">

          {/* ── Header ──────────────────────────────────────────────── */}
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-[22px] font-bold text-[#1C1916] tracking-tight">
                {greeting}, {firstName}
              </h1>
              <p className="text-sm text-[#756C64] mt-0.5">
                {dateLabel}{venue ? ` · ${venue.name}` : ''} · Business overview
              </p>
            </div>

            {/* Range selector */}
            <div className="flex items-center gap-1 bg-white border border-[#E2DDD4] rounded-xl p-1 shadow-sm">
              {(['7d', '14d', '30d'] as const).map((r) => (
                <button
                  key={r}
                  onClick={() => setRange(r)}
                  className={cn(
                    'h-7 px-3.5 rounded-lg text-xs font-semibold transition-colors',
                    range === r
                      ? 'bg-[#D25F2A] text-white shadow-sm'
                      : 'text-[#756C64] hover:text-[#1C1916]',
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* ── KPI cards ─────────────────────────────────────────── */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
            {KPI_CARDS.map((k) => (
              <KpiCard key={k.label} {...k} />
            ))}
          </div>

          {/* ── Row 2: Main composite + Hourly ──────────────────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

            {/* Revenue + Price Index (2/3 width) */}
            <ChartCard
              title="Revenue & Dynamic Pricing"
              subtitle={`${range === '7d' ? '7' : range === '14d' ? '14' : '30'} days · Engine correlation`}
              badge={`×${(chartData.reduce((s,d) => s + d.priceIdx, 0) / chartData.length).toFixed(2)} avg`}
              badgeColor="text-[#D25F2A] bg-orange-50 border-orange-200"
              className="xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height={CHART_H.main}>
                <ComposedChart data={chartData} margin={{ top: 4, right: 50, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={C.primary} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false}
                    interval={range === '7d' ? 0 : range === '14d' ? 1 : 4} />
                  <YAxis yAxisId="left" tickFormatter={fmtGBP} tick={{ fill: TICK, fontSize: 10 }}
                    tickLine={false} axisLine={false} width={44} />
                  <YAxis yAxisId="right" orientation="right" domain={[0.9, 1.5]}
                    tickFormatter={v => `×${v}`} tick={{ fill: TICK, fontSize: 10 }}
                    tickLine={false} axisLine={false} width={36} />
                  <Tooltip
                    content={(p) => (
                      <ChartTip
                        active={p.active} payload={p.payload as TPayload[]} label={String(p.label)}
                        fmt={(v, name) => name === 'Price Index' ? `×${v}` : fmtFull(v)}
                      />
                    )}
                  />
                  <Area
                    yAxisId="left" type="monotone" dataKey="revenue" name="Revenue"
                    stroke={C.primary} strokeWidth={2} fill="url(#gradRev)"
                    dot={false} activeDot={{ r: 4, stroke: 'white', strokeWidth: 2, fill: C.primary }}
                  />
                  <Line
                    yAxisId="right" type="monotone" dataKey="priceIdx" name="Price Index"
                    stroke={C.warm3} strokeWidth={1.5} dot={false} strokeDasharray="4 3"
                    activeDot={{ r: 3, fill: C.warm3, stroke: 'white', strokeWidth: 2 }}
                  />
                  <Legend
                    iconType="circle" iconSize={7}
                    formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Peak Hours (1/3 width) */}
            <ChartCard
              title="Today's Peak Hours"
              subtitle="Covers & occupancy · 24h profile"
              badge="Live pattern"
              badgeColor="text-[#D25F2A] bg-orange-50 border-orange-200"
            >
              <ResponsiveContainer width="100%" height={CHART_H.main}>
                <AreaChart data={HOURS_24} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="gradOcc" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={C.primary} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.01} />
                    </linearGradient>
                    <linearGradient id="gradCovers" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={C.muted} stopOpacity={0.2} />
                      <stop offset="100%" stopColor={C.muted} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="shortHour" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as TPayload[]} label={String(p.label)} />} />
                  <Area type="monotone" dataKey="occupancy" name="Occupancy %" stroke={C.primary}
                    strokeWidth={2} fill="url(#gradOcc)" dot={false} />
                  <Area type="monotone" dataKey="covers" name="Covers" stroke={C.muted}
                    strokeWidth={1.5} fill="url(#gradCovers)" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row 3: Bookings · Category pie · Weekly trend ─────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* Bookings bar chart */}
            <ChartCard
              title="Daily Bookings"
              subtitle={`Last ${range === '7d' ? 7 : range === '14d' ? 14 : 14} days · Covers per day`}
              badge={`${weekBook} this week`}
              badgeColor="text-[#D25F2A] bg-orange-50 border-orange-200"
            >
              <ResponsiveContainer width="100%" height={CHART_H.mid}>
                <BarChart
                  data={range === '7d' ? DATA_7 : DATA_14}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barSize={range === '7d' ? 22 : 14}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} interval={range === '7d' ? 0 : 1} />
                  <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as TPayload[]} label={String(p.label)} />} />
                  <Bar dataKey="bookings" name="Bookings" radius={[4, 4, 0, 0]}>
                    {(range === '7d' ? DATA_7 : DATA_14).map((entry, i) => (
                      <Cell
                        key={i}
                        fill={entry.dow === 5 || entry.dow === 6 || entry.dow === 0 ? C.primary : C.warm2}
                        opacity={0.85}
                      />
                    ))}
                  </Bar>
                  <ReferenceLine y={weekBook / 7} stroke={C.muted} strokeDasharray="4 3" strokeWidth={1} />
                </BarChart>
              </ResponsiveContainer>
              <p className="text-[10px] text-[#a89280] mt-1">
                <span style={{ color: C.primary }}>■</span> Fri/Sat/Sun &nbsp;
                <span style={{ color: C.warm2 }}>■</span> Weekdays &nbsp;
                <span style={{ color: C.muted }}>—</span> Daily avg
              </p>
            </ChartCard>

            {/* Category revenue donut */}
            <ChartCard
              title="Revenue by Category"
              subtitle="Share of total this week"
            >
              <div className="flex items-center gap-2 flex-1">
                <ResponsiveContainer width="55%" height={CHART_H.mid}>
                  <PieChart>
                    <Pie
                      data={CAT_REVENUE} cx="50%" cy="50%"
                      innerRadius="52%" outerRadius="80%"
                      paddingAngle={3} dataKey="value" stroke="none"
                    >
                      {CAT_REVENUE.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      content={(p) => (
                        <ChartTip
                          active={p.active} payload={p.payload as TPayload[]}
                          fmt={(v) => `${v}%`}
                        />
                      )}
                    />
                  </PieChart>
                </ResponsiveContainer>

                <div className="flex-1 space-y-2 py-2">
                  {CAT_REVENUE.map((c) => (
                    <div key={c.name} className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: c.color }} />
                      <span className="text-[11px] text-[#756C64] truncate flex-1">{c.name}</span>
                      <span className="text-[11px] font-semibold text-[#1C1916] tabular-nums">{c.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </ChartCard>

            {/* Normalised multi-metric weekly trend */}
            <ChartCard
              title="Trend Correlation"
              subtitle="Revenue · Bookings · Occupancy (normalised)"
            >
              <ResponsiveContainer width="100%" height={CHART_H.mid}>
                <LineChart data={TREND_14} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="date" tick={{ fill: TICK, fontSize: 9 }} tickLine={false} axisLine={false} interval={2} />
                  <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={24}
                    domain={[0, 100]} tickFormatter={v => `${v}`} />
                  <Tooltip
                    content={(p) => (
                      <ChartTip
                        active={p.active} payload={p.payload as TPayload[]} label={String(p.label)}
                        fmt={(v) => `${v}%`}
                      />
                    )}
                  />
                  <Line type="monotone" dataKey="revenue"   name="Revenue"    stroke={C.primary} strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="bookings"  name="Bookings"   stroke={C.warm2}   strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Line type="monotone" dataKey="occupancy" name="Occupancy"  stroke={C.muted}   strokeWidth={2} dot={false} activeDot={{ r: 3 }} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row 4: Inventory bar + Scatter correlation ──────────── */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

            {/* Inventory vs Par grouped bar */}
            <ChartCard
              title="Inventory vs Par Level"
              subtitle="On-hand stock by category · Click to drill down"
              badge={`${lowCount} below par`}
              badgeColor={lowCount > 0 ? 'text-[#F43F5E] bg-red-50 border-red-100' : 'text-[#D25F2A] bg-orange-50 border-orange-200'}
            >
              <ResponsiveContainer width="100%" height={CHART_H.small}>
                <BarChart data={invByCategory} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={3}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="name" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as TPayload[]} label={String(p.label)} />} />
                  <Bar dataKey="parLevel" name="Par level" fill={GRID} radius={[3, 3, 0, 0]} barSize={20} />
                  <Bar dataKey="onHand"   name="On hand"   radius={[3, 3, 0, 0]} barSize={20}>
                    {invByCategory.map((entry, i) => (
                      <Cell key={i}
                        fill={entry.pct < 80 ? C.rose : entry.pct > 120 ? C.muted : C.primary}
                        opacity={0.9}
                      />
                    ))}
                  </Bar>
                  <Legend iconType="circle" iconSize={7}
                    formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>} />
                </BarChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1.5">
                {[{ c: C.rose, l: 'Below par' }, { c: C.primary, l: 'Healthy' }, { c: C.muted, l: 'Overstocked' }].map(({ c, l }) => (
                  <span key={l} className="flex items-center gap-1 text-[10px] text-[#a89280]">
                    <span className="w-2 h-2 rounded-full" style={{ background: c }} />
                    {l}
                  </span>
                ))}
              </div>
            </ChartCard>

            {/* Trends */}
            <ChartCard
              title="Trends"
              subtitle="Revenue · Bookings · Occupancy across time periods"
            >
              {/* Period selector */}
              <div className="flex items-center gap-1 bg-[#FAF9F6] border border-[#E2DDD4] rounded-xl p-0.5 mb-4 w-fit">
                {(['hourly', 'daily', 'weekly', 'monthly', 'yearly'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setTrendPeriod(p)}
                    className={cn(
                      'h-6 px-3 rounded-lg text-[11px] font-semibold capitalize transition-colors',
                      trendPeriod === p
                        ? 'bg-[#D25F2A] text-white shadow-sm'
                        : 'text-[#756C64] hover:text-[#1C1916]',
                    )}
                  >
                    {p}
                  </button>
                ))}
              </div>

              <ResponsiveContainer width="100%" height={CHART_H.small}>
                <ComposedChart
                  data={
                    trendPeriod === 'hourly'  ? TREND_HOURLY  :
                    trendPeriod === 'daily'   ? DATA_14       :
                    trendPeriod === 'weekly'  ? TREND_WEEKLY  :
                    trendPeriod === 'monthly' ? TREND_MONTHLY :
                    TREND_YEARLY
                  }
                  margin={{ top: 4, right: 48, left: 0, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="gradTrend" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={C.primary} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={C.primary} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis
                    dataKey="label"
                    tick={{ fill: TICK, fontSize: 10 }}
                    tickLine={false} axisLine={false}
                    interval={trendPeriod === 'hourly' ? 2 : trendPeriod === 'daily' ? 1 : 0}
                  />
                  <YAxis
                    yAxisId="left" tickFormatter={fmtGBP}
                    tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={44}
                  />
                  <YAxis
                    yAxisId="right" orientation="right" domain={[0, 110]}
                    tickFormatter={fmtPct}
                    tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={32}
                  />
                  <Tooltip
                    content={(p) => (
                      <ChartTip
                        active={p.active} payload={p.payload as TPayload[]} label={String(p.label)}
                        fmt={(v, name) => name === 'Occupancy %' ? `${v}%` : name === 'Bookings' ? String(v) : fmtFull(v)}
                      />
                    )}
                  />
                  <Area
                    yAxisId="left" type="monotone" dataKey="revenue" name="Revenue"
                    stroke={C.primary} strokeWidth={2} fill="url(#gradTrend)"
                    dot={false} activeDot={{ r: 4, stroke: 'white', strokeWidth: 2, fill: C.primary }}
                  />
                  <Bar
                    yAxisId="left" dataKey="bookings" name="Bookings"
                    fill={C.warm2} opacity={0.4} radius={[2, 2, 0, 0]}
                    barSize={trendPeriod === 'yearly' ? 28 : trendPeriod === 'monthly' ? 14 : 8}
                  />
                  <Line
                    yAxisId="right" type="monotone" dataKey="occupancy" name="Occupancy %"
                    stroke={C.muted} strokeWidth={1.5} dot={false} strokeDasharray="4 3"
                    activeDot={{ r: 3, fill: C.muted, stroke: 'white', strokeWidth: 2 }}
                  />
                  <Legend iconType="circle" iconSize={7}
                    formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row 5: Radar + Stacked occupancy area ───────────────── */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            {/* Business health radar */}
            <ChartCard title="Business Health" subtitle="5-dimension performance score">
              <ResponsiveContainer width="100%" height={CHART_H.mid + 20}>
                <RadarChart cx="50%" cy="50%" outerRadius="72%" data={RADAR_DATA}>
                  <PolarGrid stroke={GRID} />
                  <PolarAngleAxis dataKey="metric" tick={{ fill: TICK, fontSize: 10 }} />
                  <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: TICK, fontSize: 9 }}
                    tickCount={5} axisLine={false} />
                  <Radar name="Score" dataKey="A" stroke={C.primary} strokeWidth={2}
                    fill={C.primary} fillOpacity={0.15}
                    dot={{ fill: C.primary, r: 3 }}
                  />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as TPayload[]} label={String(p.label)} fmt={(v) => `${v}/100`} />} />
                </RadarChart>
              </ResponsiveContainer>
              <div className="grid grid-cols-5 gap-1 mt-1">
                {RADAR_DATA.map(({ metric, A }) => (
                  <div key={metric} className="text-center">
                    <p className="text-[11px] font-bold tabular-nums" style={{ color: A >= 75 ? C.primary : A >= 60 ? C.muted : C.rose }}>{A}</p>
                    <p className="text-[9px] text-[#a89280] mt-0.5 leading-tight">{metric}</p>
                  </div>
                ))}
              </div>
            </ChartCard>

            {/* Stacked revenue week-over-week */}
            <ChartCard
              title="Week-over-Week Revenue"
              subtitle="Last 3 weeks · Daily breakdown"
              className="xl:col-span-2"
            >
              <ResponsiveContainer width="100%" height={CHART_H.mid + 20}>
                <BarChart
                  data={['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((day, i) => {
                    const w0 = DATA_30.filter(d => d.dow === (i + 1) % 7).slice(-1)[0];
                    const w1 = DATA_30.filter(d => d.dow === (i + 1) % 7).slice(-2, -1)[0];
                    const w2 = DATA_30.filter(d => d.dow === (i + 1) % 7).slice(-3, -2)[0];
                    return {
                      day,
                      'This week':  w0?.revenue  ?? 0,
                      'Last week':  w1?.revenue  ?? 0,
                      '2 weeks ago':w2?.revenue  ?? 0,
                    };
                  })}
                  margin={{ top: 4, right: 4, left: 0, bottom: 0 }}
                  barCategoryGap="28%"
                >
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                  <XAxis dataKey="day" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} />
                  <YAxis tickFormatter={fmtGBP} tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={44} />
                  <Tooltip content={(p) => <ChartTip active={p.active} payload={p.payload as TPayload[]} label={String(p.label)} fmt={(v) => fmtFull(v)} />} />
                  <Legend iconType="circle" iconSize={7}
                    formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>} />
                  <Bar dataKey="This week"   fill={C.primary}         radius={[3,3,0,0]} />
                  <Bar dataKey="Last week"   fill={`${C.primary}70`}  radius={[3,3,0,0]} />
                  <Bar dataKey="2 weeks ago" fill={`${C.primary}35`}  radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>

          {/* ── Row 6: Occupancy stacked area (full width) ──────────── */}
          <ChartCard
            title="30-Day Occupancy & Booking Volume"
            subtitle="Rolling view · Identify weekly and trend patterns"
          >
            <ResponsiveContainer width="100%" height={CHART_H.small + 20}>
              <ComposedChart data={DATA_30} margin={{ top: 4, right: 50, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradOccFull" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%"   stopColor={C.primary} stopOpacity={0.2} />
                    <stop offset="100%" stopColor={C.primary} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="date" tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis yAxisId="left" domain={[0, 110]} tickFormatter={fmtPct}
                  tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={36} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 60]}
                  tick={{ fill: TICK, fontSize: 10 }} tickLine={false} axisLine={false} width={28} />
                <Tooltip content={(p) => (
                  <ChartTip
                    active={p.active} payload={p.payload as TPayload[]} label={String(p.label)}
                    fmt={(v, name) => name === 'Occupancy %' ? `${v}%` : String(v)}
                  />
                )} />
                <ReferenceLine yAxisId="left" y={80} stroke={C.rose} strokeDasharray="4 3" strokeWidth={1}
                  label={{ value: '80% cap', fill: C.rose, fontSize: 9, position: 'insideTopRight' }} />
                <Area yAxisId="left" type="monotone" dataKey="occupancy" name="Occupancy %"
                  stroke={C.primary} strokeWidth={2} fill="url(#gradOccFull)" dot={false} />
                <Bar yAxisId="right" dataKey="bookings" name="Bookings" fill={C.muted}
                  opacity={0.4} radius={[2, 2, 0, 0]} barSize={6} />
                <Legend iconType="circle" iconSize={7}
                  formatter={(v) => <span style={{ fontSize: 10, color: TICK }}>{v}</span>} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Footer spacer ─────────────────────────────────────────── */}
          <div className="h-2" />
        </div>
      </div>
    </AppLayout>
  );
}
