import { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { useVenueStore } from '@/store/venueStore';
import { menusApi, categoriesApi, menuApi } from '@/lib/api';
import {
  ArrowLeft, ChevronLeft, ChevronRight,
  Zap, TrendingUp, TrendingDown, RotateCcw,
  CheckCircle, Minus, Info, BarChart3, DollarSign, Package,
} from 'lucide-react';

// ─── Palette (matches ForecastDemand) ────────────────────────────────────────

const P = {
  primary: '#D25F2A',
  rose:    '#F43F5E',
  muted:   '#9A9189',
  border:  '#E2DDD4',
  bg:      '#FAF9F6',
};

// ─── Types ───────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  name: string;
  category: string;
  /** £ — from menu_items.min_price (Menu Editor master) */
  min: number;
  /** £ — from menu_items.current_price (reference / selling price) */
  ref: number;
  /** £ — from menu_items.max_price (Menu Editor master) */
  max: number;
}

interface MenuRow {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
}

interface MenuDef {
  id: string;
  name: string;
  isActive?: boolean;
}

interface CategoryRow {
  id: string;
  name: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DOW_DEFAULT = [42, 46, 62, 66, 82, 90, 70];

function fmt(n: number) {
  return n.toFixed(2);
}

/** Piecewise linear: 0% demand → min, 50% → ref, 100% → max (ref clamped between min/max) */
function calcPrice(demand: number, min: number, ref: number, max: number) {
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const r = Math.min(hi, Math.max(lo, ref));
  const raw =
    demand <= 50
      ? lo + (demand / 50) * (r - lo)
      : r + ((demand - 50) / 50) * (hi - r);
  return Math.round(Math.min(hi, Math.max(lo, raw)) * 100) / 100;
}

function demandLabel(d: number) {
  return d < 34 ? 'Low' : d < 67 ? 'Medium' : 'High';
}

function dateKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function todayKey() {
  return dateKey(new Date());
}

function isToday(d: Date) {
  return dateKey(d) === todayKey();
}

function isPast(d: Date) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x < start && !isToday(d);
}

function getWeekDays(offset: number): Date[] {
  const t = new Date();
  const dow = t.getDay() === 0 ? 6 : t.getDay() - 1;
  const d = new Date(t);
  d.setDate(t.getDate() - dow + offset * 7);
  d.setHours(12, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const x = new Date(d);
    x.setDate(d.getDate() + i);
    return x;
  });
}

function menuItemToProduct(row: MenuRow, categoryLabel: string): Product {
  return {
    id: row.id,
    name: row.name,
    category: categoryLabel,
    min: row.minPrice / 100,
    ref: row.currentPrice / 100,
    max: row.maxPrice / 100,
  };
}

// ─── Slider ───────────────────────────────────────────────────────────────────

function DemandSlider({
  value,
  onChange,
  disabled,
}: {
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  const pct = value;
  return (
    <div className="relative h-4 flex items-center">
      <div className="absolute inset-x-0 h-1 bg-muted/30 rounded-full" />
      <div
        className="absolute left-0 h-1 rounded-full transition-all duration-75"
        style={{
          width: `${pct}%`,
          background: disabled ? P.muted : P.primary,
          opacity: disabled ? 0.4 : 1,
        }}
      />
      <div
        className="absolute w-3.5 h-3.5 rounded-full bg-white border-2 shadow pointer-events-none transition-all duration-75"
        style={{
          left: `calc(${pct}% - 7px)`,
          borderColor: disabled ? P.muted : P.primary,
          opacity: disabled ? 0.4 : 1,
        }}
      />
      <input
        type="range"
        min={0}
        max={100}
        step={1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="absolute inset-0 w-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

type ApplyState = 'idle' | 'confirming' | 'applied';

export default function DynamicPricing() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { selectedVenueId, venues } = useVenueStore();
  const venueId = selectedVenueId || venues[0]?.id || '';

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [filterCat, setFilterCat] = useState('All');
  const [applyState, setApplyState] = useState<ApplyState>('idle');
  const [showBanner, setShowBanner] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data: menus = [] } = useQuery({
    queryKey: ['menus', venueId],
    queryFn: async () => {
      const r = await menusApi.list(venueId);
      return (r.data.data ?? []) as MenuDef[];
    },
    enabled: !!venueId,
  });

  const { data: allMenuItems = [] } = useQuery({
    queryKey: ['menu-items', venueId],
    queryFn: async () => {
      const r = await menuApi.list(venueId);
      return (r.data.data ?? []) as MenuRow[];
    },
    enabled: !!venueId,
  });

  const { data: menuCategories = [] } = useQuery({
    queryKey: ['categories', venueId, selectedMenuId],
    queryFn: async () => {
      const r = await categoriesApi.list(venueId, selectedMenuId!);
      return (r.data.data ?? []) as CategoryRow[];
    },
    enabled: !!venueId && !!selectedMenuId,
  });

  useEffect(() => {
    if (!menus.length || selectedMenuId) return;
    const preferred = menus.find((m) => m.isActive) ?? menus[0];
    if (preferred) setSelectedMenuId(preferred.id);
  }, [menus, selectedMenuId]);

  useEffect(() => {
    setFilterCat('All');
    setApplyState('idle');
  }, [selectedMenuId]);

  const menuProducts: Product[] = useMemo(() => {
    if (!selectedMenuId || !menuCategories.length) return [];
    const catIds = new Set(menuCategories.map((c) => c.id));
    const idToName = new Map(menuCategories.map((c) => [c.id, c.name] as const));
    const nameToId = new Map(
      menuCategories.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
    );

    return allMenuItems
      .filter((item) => {
        if (item.categoryId && catIds.has(item.categoryId)) return true;
        if (!item.categoryId && item.category) {
          return nameToId.has(item.category.trim().toLowerCase());
        }
        return false;
      })
      .map((item) => {
        let label = item.category;
        if (item.categoryId && idToName.has(item.categoryId)) {
          label = idToName.get(item.categoryId)!;
        } else if (!item.categoryId && item.category) {
          const id = nameToId.get(item.category.trim().toLowerCase());
          if (id) label = idToName.get(id) ?? item.category;
        }
        return menuItemToProduct(item, label);
      })
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [selectedMenuId, menuCategories, allMenuItems]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(menuProducts.map((p) => p.category))).sort()],
    [menuProducts],
  );

  const weekDays = useMemo(() => getWeekDays(weekOffset), [weekOffset]);

  const initDemand = useCallback(() => {
    const m: Record<string, number> = {};
    weekDays.forEach((d) => {
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      m[dateKey(d)] = DOW_DEFAULT[dow];
    });
    return m;
  }, [weekDays]);

  const [demand, setDemand] = useState<Record<string, number>>({});

  useEffect(() => {
    setDemand(initDemand());
  }, [initDemand]);

  const changeWeek = (delta: number) => {
    setWeekOffset((o) => o + delta);
    setApplyState('idle');
  };

  const resetWeek = useCallback(() => {
    setDemand(initDemand());
    setApplyState('idle');
  }, [initDemand]);

  const futureDemands = weekDays.filter((d) => !isPast(d)).map((d) => demand[dateKey(d)] ?? 50);
  const avgDemand = futureDemands.length
    ? Math.round(futureDemands.reduce((s, v) => s + v, 0) / futureDemands.length)
    : 50;

  const filteredProducts =
    filterCat === 'All' ? menuProducts : menuProducts.filter((p) => p.category === filterCat);

  const allPriceRows = useMemo(
    () =>
      menuProducts.map((p) => {
        const adj = calcPrice(avgDemand, p.min, p.ref, p.max);
        const ch = adj - p.ref;
        return { product: p, adjPrice: adj, change: ch, changePct: p.ref > 0 ? (ch / p.ref) * 100 : 0 };
      }),
    [menuProducts, avgDemand],
  );

  const priceRows = useMemo(
    () =>
      filteredProducts.map((p) => {
        const adj = calcPrice(avgDemand, p.min, p.ref, p.max);
        const ch = adj - p.ref;
        return { product: p, adjPrice: adj, change: ch, changePct: p.ref > 0 ? (ch / p.ref) * 100 : 0 };
      }),
    [filteredProducts, avgDemand],
  );

  const totalRevImpact = useMemo(() => {
    if (menuProducts.length === 0) return 0;
    const sumRef = menuProducts.reduce((s, p) => s + p.ref, 0);
    if (sumRef <= 0) return 0;
    const sumAdj = menuProducts.reduce((s, p) => s + calcPrice(avgDemand, p.min, p.ref, p.max), 0);
    return ((sumAdj - sumRef) / sumRef) * 100;
  }, [menuProducts, avgDemand]);

  const changedCount = allPriceRows.filter((r) => Math.abs(r.change) > 0.01).length;

  const weekLabel = (() => {
    const a = weekDays[0];
    const b = weekDays[6];
    return `${a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
  })();

  const selectedMenuName = menus.find((m) => m.id === selectedMenuId)?.name ?? 'Menu';

  async function confirmApply() {
    if (!venueId || menuProducts.length === 0) return;
    setApplying(true);
    try {
      const updates = menuProducts.map((p) => ({
        id: p.id,
        currentPrice: Math.round(calcPrice(avgDemand, p.min, p.ref, p.max) * 100),
      }));
      await menuApi.bulkUpdate(venueId, updates);
      await queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      toast.success(`Updated ${updates.length} prices from Menu Editor min / ref / max bands`);
      setApplyState('applied');
    } catch {
      toast.error('Could not apply prices');
      setApplyState('idle');
    } finally {
      setApplying(false);
    }
  }

  if (!venueId) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Select a venue to use Dynamic Pricing.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0 relative">

        {/* ── Header ───────────────────────────────────────────────────────── */}
        <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0 bg-white">
          <button
            onClick={() => navigate('/optimizers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Optimizers
          </button>
          <span className="text-border">·</span>
          <Zap className="w-4 h-4 shrink-0" style={{ color: P.primary }} />
          <h1 className="text-sm font-semibold tracking-tight">Dynamic Pricing</h1>

          <div className="flex items-center gap-2 ml-2 shrink-0">
            <label className="sr-only">Menu</label>
            <Select
              value={selectedMenuId ?? ''}
              onValueChange={(v) => setSelectedMenuId(v || null)}
              disabled={menus.length === 0}
            >
              <SelectTrigger className="h-8 w-[min(100%,220px)] min-w-[140px] max-w-[260px] text-xs">
                <SelectValue placeholder={menus.length === 0 ? 'No menus' : 'Select menu'} />
              </SelectTrigger>
              <SelectContent>
                {menus.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.name}{m.isActive ? ' (active)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex-1 min-w-4" />

          <button
            onClick={resetWeek}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>

          <button
            onClick={() => setShowBanner((b) => !b)}
            className={cn(
              'flex items-center gap-1.5 text-[11px] border rounded-lg px-2.5 py-1.5 transition-colors shrink-0',
              showBanner
                ? 'border-primary/30 text-primary bg-orange-50'
                : 'border-border text-muted-foreground hover:text-foreground',
            )}
          >
            <Info className="w-3 h-3" />
            {showBanner ? 'Hide' : 'How it works'}
          </button>
        </div>

        {showBanner && (
          <div className="border-b border-border bg-white shrink-0 px-5 py-3">
            <div className="flex items-start gap-3 max-w-4xl">
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5"
                style={{ background: '#FEF3EC' }}
              >
                <Zap className="w-3.5 h-3.5" style={{ color: P.primary }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground mb-0.5">How Dynamic Pricing works</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Choose a <strong>menu</strong> — products and their <strong>min, reference, and max</strong> prices come from each item&apos;s master settings in the Menu Editor. Set demand per day; low demand moves toward <strong>min</strong>, high demand toward <strong>max</strong>, with <strong>reference</strong> at 50% demand. Apply writes new <strong>current (reference) prices</strong> to the menu so POS and the editor stay aligned.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-0 border-t border-border mt-3 divide-x divide-border">
              {[
                {
                  icon: BarChart3,
                  label: 'Piecewise formula',
                  desc: '0% = min · 50% = reference · 100% = max',
                },
                {
                  icon: TrendingUp,
                  label: 'Bounds from Menu Editor',
                  desc: 'Uses each product’s saved min / max / current price',
                },
                {
                  icon: DollarSign,
                  label: 'Revenue preview',
                  desc: 'Impact vs current reference prices before apply',
                },
                {
                  icon: Zap,
                  label: 'Apply to menu',
                  desc: 'Bulk-updates menu item prices in the database',
                },
              ].map((t) => (
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

        <div className="flex-1 flex min-h-0 overflow-hidden">
          <aside className="w-64 shrink-0 border-r border-border bg-white flex flex-col overflow-hidden">
            <div className="px-3 py-2 border-b border-border bg-muted/10">
              <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider">Demand by day</p>
              <p className="text-[10px] text-muted-foreground truncate" title={selectedMenuName}>
                {selectedMenuName}
              </p>
            </div>

            <div className="px-4 py-3 border-b border-border flex items-center gap-2 shrink-0">
              <button
                onClick={() => changeWeek(-1)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted/30 transition-colors shrink-0"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <div className="flex-1 text-center min-w-0">
                <p className="text-[11px] font-semibold text-foreground truncate">{weekLabel}</p>
                <p className="text-[10px] text-muted-foreground">
                  {weekOffset === 0 ? 'Current week' : weekOffset > 0 ? `+${weekOffset} wk` : `${weekOffset} wk`}
                </p>
              </div>
              <button
                onClick={() => changeWeek(1)}
                className="w-7 h-7 rounded-md border border-border flex items-center justify-center hover:bg-muted/30 transition-colors shrink-0"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {weekDays.map((date) => {
                const k = dateKey(date);
                const past = isPast(date);
                const tod = isToday(date);
                const val = demand[k] ?? 50;
                const dayName = date.toLocaleDateString('en-GB', { weekday: 'short' });
                const dayFull = date.toLocaleDateString('en-GB', { weekday: 'long' });
                const dayShort = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

                return (
                  <div
                    key={k}
                    className={cn(
                      'px-4 py-3 border-b border-border/60 transition-colors',
                      past ? 'opacity-40' : tod ? 'bg-orange-50/30' : 'hover:bg-muted/10',
                    )}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <p className="text-[12px] font-semibold text-foreground">{dayFull}</p>
                        {tod && (
                          <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-600">
                            Today
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-muted-foreground">{dayShort}</span>
                    </div>
                    <DemandSlider
                      value={val}
                      onChange={(v) => setDemand((p) => ({ ...p, [k]: v }))}
                      disabled={past}
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <span className="text-[9px] text-muted-foreground">{dayName} avg</span>
                      <span
                        className="text-[10px] font-semibold tabular-nums"
                        style={{ color: past ? P.muted : P.primary }}
                      >
                        {val}% · {demandLabel(val)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-4 py-3 border-t border-border shrink-0 flex items-center gap-2">
              <button
                onClick={resetWeek}
                className="flex-1 py-2 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted/20 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setApplyState('confirming')}
                disabled={applyState === 'applied' || menuProducts.length === 0}
                className={cn(
                  'flex-1 py-2 text-xs font-semibold rounded-lg transition-all flex items-center justify-center gap-1',
                  applyState === 'applied'
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                    : 'text-white hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed',
                )}
                style={applyState !== 'applied' ? { background: P.primary } : {}}
              >
                {applyState === 'applied' ? (
                  <>
                    <CheckCircle className="w-3 h-3" /> Applied
                  </>
                ) : (
                  'Apply →'
                )}
              </button>
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto" style={{ background: P.bg }}>
            <div className="px-5 py-4 space-y-4">
              {menuProducts.length === 0 ? (
                <div className="bg-white border border-border rounded-xl p-8 text-center text-sm text-muted-foreground">
                  {selectedMenuId && menuCategories.length === 0 && (
                    <p>This menu has no categories yet. Add categories and products in the Menu Editor.</p>
                  )}
                  {selectedMenuId && menuCategories.length > 0 && (
                    <p>
                      No products are linked to this menu&apos;s categories. Assign each menu item to a category in
                      the Menu Editor (or match the legacy <strong>category</strong> name to a menu category).
                    </p>
                  )}
                  {!selectedMenuId && <p>Select a menu above.</p>}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        icon: TrendingUp,
                        label: 'Avg Weekly Demand',
                        value: `${avgDemand}%`,
                        sub: demandLabel(avgDemand),
                      },
                      {
                        icon: DollarSign,
                        label: 'Revenue Impact',
                        value: `${totalRevImpact >= 0 ? '+' : ''}${totalRevImpact.toFixed(1)}%`,
                        sub: 'vs reference prices',
                        positive: totalRevImpact >= 0,
                      },
                      {
                        icon: Package,
                        label: 'Items Adjusted',
                        value: `${changedCount}`,
                        sub: `of ${menuProducts.length} in ${selectedMenuName}`,
                      },
                    ].map((k) => (
                      <div key={k.label} className="bg-white border border-border rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2 mb-1">
                          <k.icon className="w-3.5 h-3.5 shrink-0" style={{ color: P.muted }} />
                          <p className="text-[11px] text-muted-foreground font-medium">{k.label}</p>
                        </div>
                        <p
                          className="text-[22px] font-bold tracking-tight leading-tight"
                          style={{
                            color:
                              'positive' in k ? (k.positive ? P.primary : P.rose) : 'var(--foreground)',
                          }}
                        >
                          {k.value}
                        </p>
                        {k.sub && <p className="text-[11px] text-muted-foreground mt-0.5">{k.sub}</p>}
                      </div>
                    ))}
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        onClick={() => setFilterCat(cat)}
                        className={cn(
                          'px-3 py-1 text-[11px] font-medium rounded-full border transition-all',
                          filterCat === cat
                            ? 'text-white border-transparent'
                            : 'border-border bg-white text-muted-foreground hover:bg-muted/20',
                        )}
                        style={filterCat === cat ? { background: P.primary } : {}}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>

                  <div className="bg-white border border-border rounded-xl overflow-hidden">
                    <table className="w-full text-xs border-collapse">
                      <thead className="border-b border-border">
                        <tr>
                          <th className="text-left px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
                            Product
                          </th>
                          <th className="text-right px-2 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">
                            Min
                          </th>
                          <th className="text-right px-2 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">
                            Ref
                          </th>
                          <th className="text-right px-2 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-20">
                            Max
                          </th>
                          <th className="text-right px-4 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">
                            Adjusted
                          </th>
                          <th className="text-right px-5 py-3 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide w-24">
                            Change
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceRows.map(({ product: p, adjPrice, change, changePct }) => {
                          const noChange = Math.abs(change) < 0.01;
                          const up = change > 0.01;
                          return (
                            <tr key={p.id} className="border-b border-border/50 hover:bg-muted/10 transition-colors">
                              <td className="px-5 py-3">
                                <p className="font-medium text-foreground text-[13px]">{p.name}</p>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{p.category}</p>
                              </td>
                              <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">£{fmt(p.min)}</td>
                              <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">£{fmt(p.ref)}</td>
                              <td className="px-2 py-3 text-right text-muted-foreground tabular-nums">£{fmt(p.max)}</td>
                              <td className="px-4 py-3 text-right">
                                <span
                                  className="font-bold tabular-nums text-[13px]"
                                  style={{ color: noChange ? 'var(--foreground)' : up ? P.primary : P.rose }}
                                >
                                  £{fmt(adjPrice)}
                                </span>
                              </td>
                              <td className="px-5 py-3 text-right">
                                {noChange ? (
                                  <span className="text-muted-foreground/40 flex items-center justify-end gap-1">
                                    <Minus className="w-3 h-3" /> —
                                  </span>
                                ) : (
                                  <span
                                    className="flex items-center justify-end gap-1 font-semibold tabular-nums"
                                    style={{ color: up ? P.primary : P.rose }}
                                  >
                                    {up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                    {up ? '+' : ''}
                                    {fmt(change)}
                                    <span className="text-[9px] opacity-70">
                                      ({up ? '+' : ''}
                                      {changePct.toFixed(1)}%)
                                    </span>
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          </main>
        </div>

        {applyState === 'confirming' && (
          <div className="absolute inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-white rounded-2xl shadow-xl border border-border w-[400px] p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: '#FEF3EC' }}>
                  <Zap className="w-4 h-4" style={{ color: P.primary }} />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-foreground">Confirm Pricing</h2>
                  <p className="text-[11px] text-muted-foreground">{weekLabel}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{selectedMenuName}</p>
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground mb-3">
                This updates <strong>current menu prices</strong> (reference) for all {menuProducts.length} products in
                this menu. Min and max bands in the Menu Editor are unchanged.
              </p>

              <div className="space-y-0 mb-5 rounded-lg border border-border overflow-hidden">
                {[
                  {
                    label: 'Avg demand',
                    value: `${avgDemand}% · ${demandLabel(avgDemand)}`,
                    color: P.primary,
                  },
                  {
                    label: 'Revenue impact',
                    value: `${totalRevImpact >= 0 ? '+' : ''}${totalRevImpact.toFixed(1)}%`,
                    color: totalRevImpact >= 0 ? P.primary : P.rose,
                  },
                  {
                    label: 'Items to update',
                    value: `${menuProducts.length}`,
                  },
                ].map((row, i) => (
                  <div
                    key={row.label}
                    className={cn(
                      'flex items-center justify-between px-4 py-2.5',
                      i < 2 ? 'border-b border-border/60' : '',
                    )}
                  >
                    <span className="text-[11px] text-muted-foreground">{row.label}</span>
                    <span className="text-[11px] font-semibold" style={row.color ? { color: row.color } : {}}>
                      {row.value}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setApplyState('idle')}
                  disabled={applying}
                  className="flex-1 py-2.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted/20 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void confirmApply()}
                  disabled={applying}
                  className="flex-1 py-2.5 text-xs font-bold text-white rounded-lg hover:opacity-90 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50"
                  style={{ background: P.primary }}
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {applying ? 'Applying…' : 'Confirm & Apply'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
