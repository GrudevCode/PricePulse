import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  ArrowLeft, Target, TrendingUp, TrendingDown, Minus,
  Search, ChevronDown, ChevronUp, RotateCcw,
  CheckCircle, XCircle, Clock, Zap, Edit3, Tag, Star,
  Info, LineChart as LineChartIcon, List, GitBranch, Expand,
} from 'lucide-react';

// ─── Palette (matches ForecastDemand) ────────────────────────────────────────

const P = {
  primary: '#D25F2A',
  rose:    '#F43F5E',
  muted:   '#9A9189',
  border:  '#E2DDD4',
  bg:      '#FAF9F6',
};

function sr(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

// ─── Products ─────────────────────────────────────────────────────────────────

interface TrackedProduct {
  id: string; name: string; category: string;
  min: number; ref: number; max: number;
  color: string;
}

// Warm earth tones — coherent palette, chart only
const TRACKED: TrackedProduct[] = [
  { id: 'm1',  name: 'Beef Burger',    category: 'Mains',    min: 12.00, ref: 14.50, max: 17.00, color: '#D25F2A' },
  { id: 'm4',  name: '8oz Beef Steak', category: 'Mains',    min: 22.00, ref: 27.00, max: 32.00, color: '#F43F5E' },
  { id: 'm2',  name: 'Fish & Chips',   category: 'Mains',    min: 13.00, ref: 15.50, max: 18.50, color: '#9A9189' },
  { id: 's2',  name: 'Caesar Salad',   category: 'Starters', min: 7.50,  ref: 9.00,  max: 11.00, color: '#7C6355' },
  { id: 'dr3', name: 'Cocktail',       category: 'Drinks',   min: 9.00,  ref: 11.00, max: 13.50, color: '#C4A882' },
];

// ─── Chart data ───────────────────────────────────────────────────────────────

type Range = '7d' | '30d' | '90d';
const RANGE_DAYS: Record<Range, number> = { '7d': 7, '30d': 30, '90d': 90 };
const DOW_WEIGHT = [0.58, 0.62, 0.78, 0.83, 1.0, 1.18, 0.88];

function calcPrice(demand: number, min: number, ref: number, max: number) {
  const raw = demand <= 50 ? min + (demand / 50) * (ref - min) : ref + ((demand - 50) / 50) * (max - ref);
  return Math.round(raw * 100) / 100;
}

function buildChartData(range: Range, visibleIds: Set<string>) {
  const days  = RANGE_DAYS[range];
  const today = new Date('2026-03-20');
  const step  = range === '90d' ? 3 : 1;
  const rows: Record<string, string | number>[] = [];

  for (let i = -days; i <= 0; i += step) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
    const dateStr = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const row: Record<string, string | number> = { date: dateStr };
    TRACKED.forEach((p, pi) => {
      if (!visibleIds.has(p.id)) return;
      const noise  = 0.85 + sr(i * 13 + pi * 7) * 0.30;
      const spike  = sr(i * 3 + pi * 11) > 0.88 ? 0.25 : 0;
      const demand = Math.min(100, Math.round(DOW_WEIGHT[dow] * 75 * noise + spike * 30));
      row[p.id] = calcPrice(demand, p.min, p.ref, p.max);
    });
    rows.push(row);
  }
  return rows;
}

// ─── History data ─────────────────────────────────────────────────────────────

type Source   = 'Dynamic Pricing' | 'Manual Override' | 'Seasonal' | 'Promotion' | 'Event Boost';
type HStatus  = 'applied' | 'reverted' | 'scheduled';

interface PriceEvent {
  id: string; date: string; time: string;
  productId: string; productName: string; category: string;
  oldPrice: number; newPrice: number;
  source: Source; appliedBy: string;
  status: HStatus; demandLevel?: string; note?: string;
}

const HISTORY: PriceEvent[] = [
  { id: 'e01', date: '2026-03-20', time: '09:12', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 14.50, newPrice: 16.40, source: 'Dynamic Pricing',  appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e02', date: '2026-03-20', time: '09:12', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.00, newPrice: 30.20, source: 'Dynamic Pricing',  appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e03', date: '2026-03-20', time: '09:12', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 15.50, newPrice: 17.30, source: 'Dynamic Pricing',  appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e04', date: '2026-03-20', time: '09:12', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 12.50, source: 'Dynamic Pricing',  appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e05', date: '2026-03-18', time: '14:30', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.00, newPrice: 27.00, source: 'Manual Override',   appliedBy: 'Dev',    status: 'applied',   note: 'Reset to reference for midweek' },
  { id: 'e06', date: '2026-03-17', time: '08:45', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 13.80, newPrice: 14.50, source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'Spring pricing uplift' },
  { id: 'e07', date: '2026-03-15', time: '11:00', productId: 's2',  productName: 'Caesar Salad',   category: 'Starters', oldPrice: 9.00,  newPrice: 10.20, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: "St. Patrick's Day weekend" },
  { id: 'e08', date: '2026-03-15', time: '11:00', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 13.00, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: "St. Patrick's Day weekend" },
  { id: 'e09', date: '2026-03-14', time: '16:22', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 16.80, newPrice: 15.50, source: 'Manual Override',   appliedBy: 'Dev',    status: 'applied',   note: 'Reduced back — competitor check' },
  { id: 'e10', date: '2026-03-12', time: '09:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 15.20, newPrice: 13.80, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'LOW'    },
  { id: 'e11', date: '2026-03-12', time: '09:00', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 15.50, newPrice: 16.80, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e12', date: '2026-03-08', time: '10:15', productId: 's2',  productName: 'Caesar Salad',   category: 'Starters', oldPrice: 10.40, newPrice: 9.00,  source: 'Manual Override',   appliedBy: 'Dev',    status: 'reverted',  note: 'Too high for Sunday lunch crowd' },
  { id: 'e13', date: '2026-03-07', time: '08:30', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.00, newPrice: 31.00, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e14', date: '2026-03-07', time: '08:30', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 12.80, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e15', date: '2026-03-05', time: '15:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 13.20, newPrice: 15.20, source: 'Promotion',         appliedBy: 'Dev',    status: 'applied',   note: 'End of promo — price restored' },
  { id: 'e16', date: '2026-03-01', time: '09:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 14.50, newPrice: 13.20, source: 'Promotion',         appliedBy: 'Dev',    status: 'applied',   note: 'March lunch promo -10%' },
  { id: 'e17', date: '2026-02-28', time: '08:45', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 29.50, newPrice: 27.00, source: 'Manual Override',   appliedBy: 'Dev',    status: 'applied',   note: 'Reset to reference — month end' },
  { id: 'e18', date: '2026-02-22', time: '10:00', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 15.50, newPrice: 17.20, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e19', date: '2026-02-21', time: '09:30', productId: 's2',  productName: 'Caesar Salad',   category: 'Starters', oldPrice: 9.00,  newPrice: 10.40, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: "Valentine's extended weekend" },
  { id: 'e20', date: '2026-02-21', time: '09:30', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 13.20, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: "Valentine's extended weekend" },
  { id: 'e21', date: '2026-02-16', time: '14:00', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.00, newPrice: 29.50, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e22', date: '2026-02-14', time: '08:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 13.50, newPrice: 14.50, source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'Q1 reference price update' },
  { id: 'e23', date: '2026-02-09', time: '09:15', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 15.50, newPrice: 14.20, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'LOW'    },
  { id: 'e24', date: '2026-02-02', time: '11:00', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 11.00, source: 'Manual Override',   appliedBy: 'Dev',    status: 'applied',   note: 'No change — confirmed reference' },
  { id: 'e25', date: '2026-01-31', time: '09:00', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 26.00, newPrice: 27.00, source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'New year reference price update' },
  { id: 'e26', date: '2026-01-26', time: '08:30', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 14.80, newPrice: 13.50, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'LOW'    },
  { id: 'e27', date: '2026-01-24', time: '10:30', productId: 's2',  productName: 'Caesar Salad',   category: 'Starters', oldPrice: 9.00,  newPrice: 8.40,  source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'LOW'    },
  { id: 'e28', date: '2026-01-17', time: '09:00', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 14.50, newPrice: 15.50, source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'Winter menu pricing' },
  { id: 'e29', date: '2026-01-10', time: '08:45', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.20, newPrice: 26.00, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'LOW'    },
  { id: 'e30', date: '2026-01-03', time: '09:00', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 12.50, newPrice: 11.00, source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'Post-Christmas reset' },
  { id: 'e31', date: '2025-12-27', time: '11:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 14.50, newPrice: 14.80, source: 'Event Boost',       appliedBy: 'Dev',    status: 'reverted',  note: 'Reverted — Christmas covers lower than expected' },
  { id: 'e32', date: '2025-12-24', time: '08:00', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 27.00, newPrice: 31.50, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: 'Christmas Eve' },
  { id: 'e33', date: '2025-12-24', time: '08:00', productId: 'dr3', productName: 'Cocktail',       category: 'Drinks',   oldPrice: 11.00, newPrice: 13.50, source: 'Event Boost',       appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH',  note: 'Christmas Eve' },
  { id: 'e34', date: '2025-12-20', time: '10:00', productId: 'm2',  productName: 'Fish & Chips',   category: 'Mains',    oldPrice: 15.50, newPrice: 17.80, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'applied',   demandLevel: 'HIGH'   },
  { id: 'e35', date: '2025-12-15', time: '09:00', productId: 's2',  productName: 'Caesar Salad',   category: 'Starters', oldPrice: 8.50,  newPrice: 9.00,  source: 'Seasonal',          appliedBy: 'System', status: 'applied',   note: 'Christmas season pricing' },
  { id: 'e36', date: '2026-03-25', time: '08:00', productId: 'm1',  productName: 'Beef Burger',    category: 'Mains',    oldPrice: 16.40, newPrice: 17.00, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'scheduled', demandLevel: 'HIGH',  note: 'Scheduled for Fri 27 Mar weekend' },
  { id: 'e37', date: '2026-03-25', time: '08:00', productId: 'm4',  productName: '8oz Beef Steak', category: 'Mains',    oldPrice: 30.20, newPrice: 32.00, source: 'Dynamic Pricing',   appliedBy: 'Dev',    status: 'scheduled', demandLevel: 'HIGH',  note: 'Scheduled for Fri 27 Mar weekend' },
];

// ─── Source icon map ──────────────────────────────────────────────────────────

const SOURCE_ICON: Record<Source, React.ComponentType<{ className?: string }>> = {
  'Dynamic Pricing': Zap,
  'Manual Override': Edit3,
  'Seasonal':        Star,
  'Promotion':       Tag,
  'Event Boost':     TrendingUp,
};

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function ChartTip({ active, payload, label }: {
  active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow px-3 py-2 text-xs min-w-[140px]">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.filter(p => p.value != null).map((p, i) => (
        <div key={i} className="flex items-center justify-between gap-4 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: p.color }} />
            {p.name}
          </span>
          <span className="font-bold tabular-nums text-foreground">£{p.value?.toFixed(2)}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PriceHistory() {
  const navigate = useNavigate();

  const [showBanner, setShowBanner] = useState(false);
  const [range,      setRange]      = useState<Range>('30d');
  const [visible,    setVisible]    = useState<Set<string>>(new Set(TRACKED.map(p => p.id)));
  const [search,     setSearch]     = useState('');
  const [filterSrc,  setFilterSrc]  = useState<Source | 'All'>('All');
  const [filterStat, setFilterStat] = useState<HStatus | 'All'>('All');
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  const toggleProduct = (id: string) =>
    setVisible(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const chartData = useMemo(() => buildChartData(range, visible), [range, visible]);

  const filteredHistory = useMemo(() => {
    const cutoff = new Date('2026-03-20');
    cutoff.setDate(cutoff.getDate() - RANGE_DAYS[range]);

    return HISTORY
      .filter(e => {
        if (new Date(e.date) < cutoff) return false;
        if (search && !e.productName.toLowerCase().includes(search.toLowerCase()) &&
            !e.source.toLowerCase().includes(search.toLowerCase())) return false;
        if (filterSrc  !== 'All' && e.source !== filterSrc)  return false;
        if (filterStat !== 'All' && e.status !== filterStat) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.time.localeCompare(a.time));
  }, [range, search, filterSrc, filterStat]);

  const totalChanges = filteredHistory.filter(e => Math.abs(e.newPrice - e.oldPrice) > 0.001).length;
  const avgIncrease  = (() => {
    const ups = filteredHistory.filter(e => e.newPrice > e.oldPrice);
    return ups.length ? ups.reduce((s, e) => s + ((e.newPrice - e.oldPrice) / e.oldPrice) * 100, 0) / ups.length : 0;
  })();
  const reverted = filteredHistory.filter(e => e.status === 'reverted').length;

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0 bg-white">
          <button onClick={() => navigate('/optimizers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Optimizers
          </button>
          <span className="text-border">·</span>
          <Target className="w-4 h-4 shrink-0" style={{ color: P.primary }} />
          <h1 className="text-sm font-semibold tracking-tight">Price History</h1>

          <div className="flex-1" />

          <div className="flex items-center bg-muted/30 rounded-lg p-0.5 border border-border gap-0.5">
            {(['7d', '30d', '90d'] as Range[]).map(r => (
              <button key={r} onClick={() => setRange(r)}
                className={cn('px-2.5 py-1 text-[11px] font-medium rounded-md transition-all',
                  range === r
                    ? 'bg-white text-foreground shadow-sm border border-border/40'
                    : 'text-muted-foreground hover:text-foreground')}>
                {r}
              </button>
            ))}
          </div>

          <button onClick={() => setShowBanner(b => !b)}
            className={cn('flex items-center gap-1.5 text-[11px] border rounded-lg px-2.5 py-1.5 transition-colors',
              showBanner
                ? 'border-primary/30 text-primary bg-orange-50'
                : 'border-border text-muted-foreground hover:text-foreground')}>
            <Info className="w-3 h-3" />
            {showBanner ? 'Hide' : 'How it works'}
          </button>
        </div>

        {/* ── Banner ───────────────────────────────────────────────────────── */}
        {showBanner && (
          <div className="border-b border-border bg-white shrink-0 px-5 py-3">
            <div className="flex items-start gap-3 max-w-4xl">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: '#FEF3EC' }}>
                <Target className="w-3.5 h-3.5" style={{ color: P.primary }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground mb-0.5">How the Price History tool works</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Every price change across your tracked products is recorded here — whether applied by Dynamic Pricing, a manual override, a seasonal update, a promotion, or an event boost. The line chart shows price evolution and the log gives you a full audit trail.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-0 border-t border-border mt-3 divide-x divide-border">
              {[
                { icon: LineChartIcon, label: 'Price chart',      desc: 'Toggle products on/off to compare trends. Switch 7d, 30d, 90d windows.' },
                { icon: List,          label: 'Full audit log',   desc: 'Source, old/new price, who applied it, and current status logged.' },
                { icon: GitBranch,     label: 'Five sources',     desc: 'Dynamic Pricing, Manual Override, Seasonal, Promotion, or Event Boost.' },
                { icon: Expand,        label: 'Expand for detail', desc: 'Click any row for the price bounds bar, timestamp, and attached note.' },
              ].map(t => (
                <div key={t.label} className="flex items-center gap-2.5 px-4 py-2.5">
                  <t.icon className="w-3.5 h-3.5 shrink-0" style={{ color: P.primary }} />
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{t.label}</p>
                    <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Scrollable body ──────────────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto min-h-0" style={{ background: P.bg }}>
          <div className="px-5 py-4 space-y-4">

            {/* KPI strip */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Target,     label: 'Price Changes',    value: String(totalChanges),        sub: `in last ${range}` },
                { icon: TrendingUp, label: 'Avg Increase',     value: `+${avgIncrease.toFixed(1)}%`, sub: 'on upward adjustments' },
                { icon: RotateCcw,  label: 'Reverted',         value: String(reverted),            sub: `of ${filteredHistory.length} changes` },
              ].map(k => (
                <div key={k.label} className="bg-white border border-border rounded-xl px-4 py-3">
                  <div className="flex items-center gap-2 mb-1">
                    <k.icon className="w-3.5 h-3.5 shrink-0" style={{ color: P.muted }} />
                    <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
                  </div>
                  <p className="text-[22px] font-bold tracking-tight text-foreground leading-tight">{k.value}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>
                </div>
              ))}
            </div>

            {/* Chart */}
            <div className="bg-white rounded-xl border border-border p-4">
              <div className="flex items-start gap-4 mb-3">
                <div className="flex-1">
                  <h2 className="text-[13px] font-semibold text-foreground">Price History Chart</h2>
                  <p className="text-[11px] text-muted-foreground mt-0.5">Applied prices over time · toggle products below</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {TRACKED.map(p => (
                    <button key={p.id} onClick={() => toggleProduct(p.id)}
                      className={cn(
                        'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-all',
                        visible.has(p.id)
                          ? 'border-transparent text-white'
                          : 'border-border text-muted-foreground bg-white hover:bg-muted/20',
                      )}
                      style={visible.has(p.id) ? { background: p.color } : {}}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: visible.has(p.id) ? 'rgba(255,255,255,0.7)' : p.color }} />
                      {p.name.split(' ')[0]}
                    </button>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.border} vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: P.muted }} tickLine={false} axisLine={false}
                    interval={chartData.length <= 8 ? 0 : Math.floor(chartData.length / 7)} />
                  <YAxis tick={{ fontSize: 10, fill: P.muted }} tickLine={false} axisLine={false} width={38}
                    tickFormatter={v => `£${v}`} />
                  <Tooltip content={<ChartTip />} />
                  <ReferenceLine x={chartData[chartData.length - 1]?.date as string}
                    stroke={P.muted} strokeDasharray="4 3" strokeWidth={1}
                    label={{ value: 'Today', position: 'insideTopRight', fontSize: 9, fill: P.muted }} />
                  {TRACKED.filter(p => visible.has(p.id)).map(p => (
                    <Line key={p.id} dataKey={p.id} name={p.name} stroke={p.color} strokeWidth={2}
                      dot={false} activeDot={{ r: 3, strokeWidth: 0 }} connectNulls={false} />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Log */}
            <div className="bg-white rounded-xl border border-border overflow-hidden">

              {/* Filter bar */}
              <div className="flex items-center gap-3 px-5 py-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
                  <input value={search} onChange={e => setSearch(e.target.value)}
                    placeholder="Search product or source…"
                    className="pl-8 pr-3 py-1.5 text-[11px] border border-border rounded-lg bg-muted/10 focus:outline-none focus:ring-1 w-48"
                    style={{ '--tw-ring-color': P.primary } as React.CSSProperties} />
                </div>

                <div className="flex items-center gap-1 flex-1">
                  {(['All', 'Dynamic Pricing', 'Manual Override', 'Seasonal', 'Promotion', 'Event Boost'] as const).map(s => (
                    <button key={s} onClick={() => setFilterSrc(s)}
                      className={cn('px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all',
                        filterSrc === s
                          ? 'text-white border-transparent'
                          : 'border-border text-muted-foreground hover:bg-muted/20 bg-white')}
                      style={filterSrc === s ? { background: P.primary } : {}}>
                      {s === 'All' ? 'All' : s}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-1">
                  {(['All', 'applied', 'reverted', 'scheduled'] as const).map(s => (
                    <button key={s} onClick={() => setFilterStat(s)}
                      className={cn('px-2.5 py-1 text-[10px] font-medium rounded-full border transition-all capitalize',
                        filterStat === s
                          ? 'border-foreground/20 bg-muted/40 text-foreground'
                          : 'border-border text-muted-foreground hover:bg-muted/20 bg-white')}>
                      {s === 'All' ? 'All statuses' : s}
                    </button>
                  ))}
                </div>

                <span className="text-[10px] text-muted-foreground shrink-0">{filteredHistory.length} records</span>
              </div>

              {/* Table */}
              <table className="w-full text-xs border-collapse">
                <thead className="border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Date</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Product</th>
                    <th className="text-left px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Source</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">Old</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">New</th>
                    <th className="text-right px-4 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">Change</th>
                    <th className="text-left px-5 py-2.5 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">Status</th>
                    <th className="px-5 py-2.5 w-6" />
                  </tr>
                </thead>
                <tbody>
                  {filteredHistory.map(e => {
                    const change    = e.newPrice - e.oldPrice;
                    const changePct = (change / e.oldPrice) * 100;
                    const noChange  = Math.abs(change) < 0.001;
                    const up        = change > 0.001;
                    const isExp     = expanded.has(e.id);
                    const product   = TRACKED.find(p => p.id === e.productId);
                    const SrcIcon   = SOURCE_ICON[e.source];

                    return (
                      <React.Fragment key={e.id}>
                        <tr
                          className={cn(
                            'border-b border-border/50 hover:bg-muted/10 transition-colors cursor-pointer',
                            e.status === 'reverted' ? 'opacity-50' : '',
                          )}
                          onClick={() => setExpanded(prev => {
                            const n = new Set(prev); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n;
                          })}
                        >
                          {/* Date */}
                          <td className="px-5 py-3 whitespace-nowrap">
                            <p className="font-medium text-foreground tabular-nums text-[12px]">
                              {new Date(e.date).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{e.time}</p>
                          </td>

                          {/* Product */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {product && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: product.color }} />}
                              <div>
                                <p className="font-medium text-foreground text-[12px]">{e.productName}</p>
                                <p className="text-[10px] text-muted-foreground">{e.category}</p>
                              </div>
                            </div>
                          </td>

                          {/* Source */}
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                              <SrcIcon className="w-3 h-3 shrink-0" />
                              {e.source}
                            </span>
                          </td>

                          {/* Old */}
                          <td className="px-4 py-3 text-right">
                            <span className="tabular-nums text-muted-foreground">£{e.oldPrice.toFixed(2)}</span>
                          </td>

                          {/* New */}
                          <td className="px-4 py-3 text-right">
                            <span className="tabular-nums font-semibold text-foreground">£{e.newPrice.toFixed(2)}</span>
                          </td>

                          {/* Change */}
                          <td className="px-4 py-3 text-right">
                            {noChange ? (
                              <span className="text-muted-foreground/40">—</span>
                            ) : (
                              <span className="flex items-center justify-end gap-1 font-semibold tabular-nums"
                                style={{ color: up ? P.primary : P.rose }}>
                                {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                {up ? '+' : ''}{change.toFixed(2)}
                                <span className="text-[9px] opacity-70">({up ? '+' : ''}{changePct.toFixed(1)}%)</span>
                              </span>
                            )}
                          </td>

                          {/* Status */}
                          <td className="px-5 py-3">
                            <span className="inline-flex items-center gap-1.5 text-[11px]">
                              {e.status === 'applied'   && <CheckCircle className="w-3 h-3 shrink-0" style={{ color: P.primary }} />}
                              {e.status === 'reverted'  && <XCircle     className="w-3 h-3 shrink-0" style={{ color: P.rose    }} />}
                              {e.status === 'scheduled' && <Clock       className="w-3 h-3 shrink-0" style={{ color: P.muted   }} />}
                              <span className="text-muted-foreground capitalize">{e.status}</span>
                            </span>
                          </td>

                          {/* Expand */}
                          <td className="px-5 py-3">
                            <span className="text-muted-foreground/40">
                              {isExp ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                            </span>
                          </td>
                        </tr>

                        {/* Expanded detail */}
                        {isExp && (
                          <tr className="border-b border-border/50 bg-muted/10">
                            <td colSpan={8} className="px-5 py-3">
                              <div className="flex items-start gap-8 text-xs">
                                {product && (
                                  <div>
                                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Price Bounds</p>
                                    <div className="flex items-center gap-2">
                                      <span className="text-muted-foreground">£{product.min.toFixed(2)}</span>
                                      <div className="relative w-24 h-1.5 bg-muted/30 rounded-full">
                                        <div className="absolute inset-0 rounded-full overflow-hidden">
                                          <div className="h-full rounded-full" style={{
                                            width: `${((e.newPrice - product.min) / (product.max - product.min)) * 100}%`,
                                            background: P.primary, opacity: 0.6,
                                          }} />
                                        </div>
                                      </div>
                                      <span className="text-muted-foreground">£{product.max.toFixed(2)}</span>
                                    </div>
                                  </div>
                                )}
                                <div>
                                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Applied By</p>
                                  <p className="font-medium text-foreground">{e.appliedBy}</p>
                                </div>
                                <div>
                                  <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Full Date</p>
                                  <p className="font-medium text-foreground tabular-nums">
                                    {new Date(e.date).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} at {e.time}
                                  </p>
                                </div>
                                {e.note && (
                                  <div className="flex-1">
                                    <p className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wide mb-1.5">Note</p>
                                    <p className="text-foreground">{e.note}</p>
                                  </div>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}

                  {filteredHistory.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-12 text-center text-sm text-muted-foreground">
                        <Minus className="w-6 h-6 mx-auto mb-2 opacity-20" />
                        No records match the selected filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>

            </div>
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
