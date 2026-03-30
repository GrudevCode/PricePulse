import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { useVenueStore } from '@/store/venueStore';
import { menuApi, menusApi, categoriesApi } from '@/lib/api';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';
import {
  ArrowLeft, Brain, EyeOff, AlertTriangle, CheckCircle,
  ArrowUp, ArrowDown, Star, Zap, Package, TrendingUp,
  Info, ChevronDown, ChevronUp, RotateCcw, X,
} from 'lucide-react';

const P = {
  primary: '#D25F2A',
  rose:    '#F43F5E',
  muted:   '#9A9189',
  border:  '#E2DDD4',
  bg:      '#FAF9F6',
};

interface MenuDef {
  id: string;
  name: string;
  isActive?: boolean;
}

interface DbCategoryRow {
  id: string;
  name: string;
  displayOrder: number;
}

interface VenueMenuRow {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  description?: string | null;
  currentPrice: number;
  intelligentInventorySync?: boolean;
  ingredientStockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  intelligentlyHidden?: boolean;
}

/** Items assigned to this menu’s categories (by categoryId or legacy name match). */
function scopeItemsToMenu(
  allItems: VenueMenuRow[],
  menuCategories: DbCategoryRow[],
): VenueMenuRow[] {
  if (!menuCategories.length) return [];
  const catIds = new Set(menuCategories.map((c) => c.id));
  const idToName = new Map(menuCategories.map((c) => [c.id, c.name] as const));
  const nameToId = new Map(
    menuCategories.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
  );

  return allItems
    .filter((item) => {
      if (item.categoryId && catIds.has(item.categoryId)) return true;
      if (!item.categoryId && item.category) {
        return nameToId.has(item.category.trim().toLowerCase());
      }
      return false;
    })
    .map((item) => {
      let displayCat = item.category;
      if (item.categoryId && idToName.has(item.categoryId)) {
        displayCat = idToName.get(item.categoryId)!;
      } else if (!item.categoryId && item.category) {
        const id = nameToId.get(item.category.trim().toLowerCase());
        if (id) displayCat = idToName.get(id) ?? item.category;
      }
      return { ...item, category: displayCat };
    });
}

type ItemStatus = 'auto-hidden' | 'low-stock' | 'optimal';

interface IngredientStatus {
  id: string;
  name: string;
  onHand: number;
  parLevel: number;
  ratio: number;
  level: 'ok' | 'low' | 'critical';
}

interface AlgoResult {
  status: ItemStatus;
  score: number;
  marginPct: number;
  stockPct: number;
  velocityPct: number;
  demandPct: number;
  ingredients: IngredientStatus[];
  reasons: string[];
  autoHideReason?: string;
}

function algoFromApiItem(item: VenueMenuRow): AlgoResult {
  const sync = item.intelligentInventorySync === true;
  const st = item.ingredientStockStatus ?? 'not_tracked';
  const emptyIng: IngredientStatus[] = [];

  if (!sync) {
    return {
      status: 'optimal',
      score: 50,
      marginPct: 0,
      stockPct: 100,
      velocityPct: 50,
      demandPct: 50,
      ingredients: emptyIng,
      reasons: [
        'Intelligent Menu is off. Enable the IM toggle to auto-hide this dish from the Menu Editor, preview, and public menu when linked inventory runs out.',
      ],
    };
  }
  if (st === 'not_tracked') {
    return {
      status: 'optimal',
      score: 40,
      marginPct: 0,
      stockPct: 50,
      velocityPct: 50,
      demandPct: 50,
      ingredients: emptyIng,
      reasons: [
        'No inventory-linked ingredients yet. Link rows on the product sheet to stock items (same as POS) so we can detect out-of-stock.',
      ],
    };
  }
  if (st === 'out_of_stock') {
    return {
      status: 'auto-hidden',
      score: 0,
      marginPct: 0,
      stockPct: 0,
      velocityPct: 0,
      demandPct: 0,
      ingredients: emptyIng,
      reasons: [],
      autoHideReason:
        'Linked inventory cannot cover this dish (same rule as POS). Hidden in Menu Editor main list, phone preview, and public menu until restocked.',
    };
  }
  if (st === 'low_stock') {
    return {
      status: 'low-stock',
      score: 55,
      marginPct: 0,
      stockPct: 55,
      velocityPct: 50,
      demandPct: 50,
      ingredients: emptyIng,
      reasons: [
        'One or more linked ingredients are low (POS uses ≤5 estimated portions as “low”). Dish stays visible; restock before it hits zero.',
      ],
    };
  }
  return {
    status: 'optimal',
    score: 72,
    marginPct: 0,
    stockPct: 100,
    velocityPct: 50,
    demandPct: 50,
    ingredients: emptyIng,
    reasons: ['Linked inventory levels look sufficient for this dish right now.'],
  };
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      className="relative w-9 h-5 rounded-full shrink-0 focus:outline-none transition-colors duration-200"
      style={{ background: on ? P.primary : '#C8C2BA' }}
    >
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200"
        style={{ left: on ? 'calc(100% - 18px)' : '2px' }}
      />
    </button>
  );
}

function ScoreBar({ pct, critical }: { pct: number; critical?: boolean }) {
  const color = critical ? P.rose : P.primary;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 bg-muted/30 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className="text-[9px] tabular-nums font-bold w-6 text-right" style={{ color }}>{pct}%</span>
    </div>
  );
}

function ProductCard({
  item,
  algo,
  rank,
  enabled,
  featured,
  onToggle,
  onFeature,
  onMoveUp,
  onMoveDown,
  onReset,
  canMoveUp,
  canMoveDown,
  hasOffset,
  toggling,
}: {
  item: VenueMenuRow;
  algo: AlgoResult;
  rank: number;
  enabled: boolean;
  featured: boolean;
  onToggle: () => void;
  onFeature: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onReset: () => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
  hasOffset: boolean;
  toggling: boolean;
}) {
  const [showScores, setShowScores] = useState(false);
  const isHidden = enabled && algo.status === 'auto-hidden';
  const isLow = enabled && algo.status === 'low-stock';
  const price = (item.currentPrice ?? 0) / 100;

  return (
    <div
      className={cn(
        'rounded-xl border mb-2.5 overflow-hidden transition-all',
        isHidden ? 'border-rose-200 opacity-75' :
        isLow ? 'border-border' :
        featured ? 'border-primary/25' :
        'border-border bg-white',
      )}
      style={isHidden ? { background: '#FFF5F5' } : featured ? { background: '#FEF8F4' } : {}}
    >
      {isHidden && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-rose-200" style={{ background: '#FFE4E6' }}>
          <EyeOff className="w-3.5 h-3.5 shrink-0" style={{ color: P.rose }} />
          <p className="text-[11px] font-semibold" style={{ color: P.rose }}>
            AUTO-HIDDEN — {algo.autoHideReason}
          </p>
        </div>
      )}

      {isLow && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/20 border-b border-border">
          <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <p className="text-[11px] text-muted-foreground">
            Ingredient running low — still visible until stock hits zero
          </p>
        </div>
      )}

      {featured && !isHidden && (
        <div className="flex items-center gap-2 px-4 py-2 border-b border-primary/15" style={{ background: `${P.primary}0A` }}>
          <Zap className="w-3.5 h-3.5 shrink-0" style={{ color: P.primary }} />
          <p className="text-[11px] font-semibold" style={{ color: P.primary }}>
            FEATURED — pinned to top of category
          </p>
          <button type="button" onClick={onFeature} className="ml-auto text-muted-foreground/50 hover:text-muted-foreground">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="px-4 py-3 bg-white" style={isHidden ? { background: '#FFF5F5' } : featured ? { background: '#FEF8F4' } : {}}>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              'w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black shrink-0 mt-0.5',
              isHidden ? 'bg-muted/20 text-muted-foreground/50' :
              featured ? 'text-white' : 'bg-muted/20 text-muted-foreground',
            )}
            style={featured ? { background: P.primary } : {}}
          >
            {isHidden ? '–' : rank}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={cn('text-[13px] font-semibold', isHidden ? 'line-through text-muted-foreground' : 'text-foreground')}>
                {item.name}
              </span>
              <span className="text-[12px] font-semibold" style={{ color: P.primary }}>
                £{price.toFixed(2)}
              </span>
              {enabled ? (
                isHidden ? (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-rose-200 bg-rose-50" style={{ color: P.rose }}>Hidden</span>
                ) : isLow ? (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-border bg-muted/20 text-muted-foreground">Low stock</span>
                ) : (
                  <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-primary/20 bg-orange-50 text-primary">Optimal</span>
                )
              ) : (
                <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full border border-border bg-muted/20 text-muted-foreground">IM off</span>
              )}
              {featured && <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full text-white" style={{ background: P.primary }}>Featured</span>}
            </div>
            {item.description && (
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed line-clamp-2">{item.description}</p>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={onFeature}
              title={featured ? 'Remove feature' : 'Feature'}
              className={cn(
                'w-7 h-7 rounded-lg border flex items-center justify-center transition-all',
                featured ? 'text-white border-transparent' : 'border-border text-muted-foreground hover:border-primary/30 hover:text-primary',
              )}
              style={featured ? { background: P.primary } : {}}
            >
              <Star className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveUp}
              disabled={!canMoveUp || !enabled || isHidden}
              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={onMoveDown}
              disabled={!canMoveDown || !enabled || isHidden}
              className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </button>
            {hasOffset && (
              <button
                type="button"
                onClick={onReset}
                className="w-7 h-7 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/30 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <div className="ml-1 flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">IM</span>
              <Toggle on={enabled} onChange={onToggle} />
              {toggling && <span className="text-[9px] text-muted-foreground">…</span>}
            </div>
          </div>
        </div>

        {algo.ingredients.length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            <span className="text-[10px] text-muted-foreground mr-0.5">Ingredients:</span>
            {algo.ingredients.map((ing) => (
              <span
                key={ing.id}
                className={cn(
                  'inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border',
                  ing.level === 'critical' ? 'border-rose-200 bg-rose-50' :
                  ing.level === 'low' ? 'border-border bg-muted/20' :
                  'border-border bg-white',
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full shrink-0"
                  style={{
                    background: ing.level === 'critical' ? P.rose : ing.level === 'low' ? P.muted : '#C8E6C9',
                  }}
                />
                <span style={{ color: ing.level === 'critical' ? P.rose : 'var(--muted-foreground)' }}>{ing.name}</span>
                <span className="opacity-50">{ing.onHand}/{ing.parLevel}</span>
              </span>
            ))}
          </div>
        )}

        {!isHidden && (
          <div className="mt-2.5">
            <button
              type="button"
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => setShowScores((s) => !s)}
            >
              <Brain className="w-3 h-3" />
              Details
              {showScores ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>

            {showScores && (
              <div className="mt-2 pl-4 space-y-2 border-l-2 border-muted/20">
                <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                  {[
                    { label: 'Stock health', pct: algo.stockPct, critical: algo.stockPct < 40 },
                    { label: 'Score', pct: Math.min(100, algo.score), critical: algo.score < 35 },
                  ].map((f) => (
                    <div key={f.label}>
                      <p className="text-[9px] text-muted-foreground font-semibold uppercase tracking-wide mb-1">{f.label}</p>
                      <ScoreBar pct={f.pct} critical={f.critical} />
                    </div>
                  ))}
                </div>
                <div className="space-y-0.5 mt-1">
                  {algo.reasons.map((r, i) => (
                    <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
                      <Info className="w-2.5 h-2.5 mt-0.5 shrink-0 opacity-50" />
                      {r}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function IntelligentMenu() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { selectedVenueId, venues } = useVenueStore();
  const venueId = selectedVenueId || venues[0]?.id || '';

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('All');
  const [featuredItems, setFeaturedItems] = useState<Set<string>>(() => new Set());
  const [userOffsets, setUserOffsets] = useState<Record<string, number>>({});
  const [showBanner, setShowBanner] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const { data: menus = [], isLoading: menusLoading } = useQuery<MenuDef[]>({
    queryKey: ['menus', venueId],
    queryFn: async () => {
      const r = await menusApi.list(venueId);
      return (r.data.data ?? []) as MenuDef[];
    },
    enabled: !!venueId,
  });

  useEffect(() => {
    if (!menus.length || selectedMenuId) return;
    const preferred = menus.find((m) => m.isActive) ?? menus[0];
    if (preferred) setSelectedMenuId(preferred.id);
  }, [menus, selectedMenuId]);

  useEffect(() => {
    setActiveCategory('All');
  }, [selectedMenuId]);

  const { data: menuCategories = [], isFetched: catsFetched, isFetching: catsFetching } = useQuery<DbCategoryRow[]>({
    queryKey: ['categories', venueId, selectedMenuId],
    queryFn: async () => {
      const r = await categoriesApi.list(venueId, selectedMenuId!);
      return (r.data.data ?? []) as DbCategoryRow[];
    },
    enabled: !!venueId && !!selectedMenuId,
  });

  const { data: menuRows = [], isLoading: itemsLoading } = useQuery<VenueMenuRow[]>({
    queryKey: ['menu-items', venueId],
    queryFn: async () => {
      const r = await menuApi.list(venueId);
      return (r.data.data ?? []) as VenueMenuRow[];
    },
    enabled: !!venueId,
  });

  const categoryOrder = useMemo(
    () => [...menuCategories].sort((a, b) => a.displayOrder - b.displayOrder).map((c) => c.name),
    [menuCategories],
  );

  const scopedRows = useMemo(
    () => scopeItemsToMenu(menuRows, menuCategories),
    [menuRows, menuCategories],
  );

  const CATEGORIES = useMemo(() => ['All', ...categoryOrder], [categoryOrder]);

  const algoMap = useMemo(() => {
    const m: Record<string, AlgoResult> = {};
    for (const row of scopedRows) {
      m[row.id] = algoFromApiItem(row);
    }
    return m;
  }, [scopedRows]);

  const sortedMenu = useMemo(() => {
    const sorted: VenueMenuRow[] = [];
    categoryOrder.forEach((cat) => {
      const catItems = [...scopedRows.filter((m) => (m.category || 'Other') === cat)];
      catItems.sort((a, b) => {
        const aFeat = featuredItems.has(a.id) ? 10000 : 0;
        const bFeat = featuredItems.has(b.id) ? 10000 : 0;
        const aHid = a.intelligentInventorySync && algoMap[a.id].status === 'auto-hidden' ? -1000 : 0;
        const bHid = b.intelligentInventorySync && algoMap[b.id].status === 'auto-hidden' ? -1000 : 0;
        return (algoMap[b.id].score + bFeat + bHid + (userOffsets[b.id] ?? 0) * 15) -
          (algoMap[a.id].score + aFeat + aHid + (userOffsets[a.id] ?? 0) * 15);
      });
      sorted.push(...catItems);
    });
    return sorted;
  }, [algoMap, featuredItems, userOffsets, scopedRows, categoryOrder]);

  const moveItem = useCallback((id: string, dir: 1 | -1) => {
    setUserOffsets((prev) => ({ ...prev, [id]: (prev[id] ?? 0) + dir }));
  }, []);

  const catStats = useMemo(() => {
    const s: Record<string, { total: number; hidden: number; low: number }> = {};
    CATEGORIES.forEach((cat) => {
      const items = cat === 'All' ? scopedRows : scopedRows.filter((m) => (m.category || 'Other') === cat);
      s[cat] = {
        total: items.length,
        hidden: items.filter((m) => m.intelligentInventorySync && algoMap[m.id]?.status === 'auto-hidden').length,
        low: items.filter((m) => m.intelligentInventorySync && algoMap[m.id]?.status === 'low-stock').length,
      };
    });
    return s;
  }, [algoMap, scopedRows, CATEGORIES]);

  const visibleItems = useMemo(
    () => sortedMenu.filter((m) => activeCategory === 'All' || (m.category || 'Other') === activeCategory),
    [sortedMenu, activeCategory],
  );

  const rankMap = useMemo(() => {
    const m: Record<string, number> = {};
    categoryOrder.forEach((cat) => {
      let r = 1;
      sortedMenu.filter((i) => (i.category || 'Other') === cat).forEach((item) => {
        m[item.id] = item.intelligentInventorySync && algoMap[item.id].status === 'auto-hidden' ? 99 : r++;
      });
    });
    return m;
  }, [sortedMenu, algoMap, categoryOrder]);

  const autoHidden = catStats['All']?.hidden ?? 0;
  const lowStockCnt = catStats['All']?.low ?? 0;
  const optimal = Math.max(0, scopedRows.length - autoHidden - lowStockCnt);
  const enabledCount = scopedRows.filter((m) => m.intelligentInventorySync).length;

  const selectedMenuName = menus.find((m) => m.id === selectedMenuId)?.name ?? 'Menu';
  const listBlocking =
    itemsLoading || menusLoading || (selectedMenuId && (!catsFetched || catsFetching));

  async function toggleIm(id: string, current: boolean) {
    if (!venueId) return;
    setTogglingId(id);
    try {
      await menuApi.update(venueId, id, { intelligentInventorySync: !current });
      await qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
      toast.success(!current ? 'Intelligent Menu enabled for product' : 'Intelligent Menu disabled');
    } catch {
      toast.error('Could not update product');
    } finally {
      setTogglingId(null);
    }
  }

  if (!venueId) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Select a venue to use Intelligent Menu.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0">
        <div className="min-h-14 border-b border-border flex flex-wrap items-center px-5 py-2 gap-2 shrink-0 bg-white">
          <button
            type="button"
            onClick={() => navigate('/optimizers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Optimizers
          </button>
          <span className="text-border">·</span>
          <Brain className="w-4 h-4 shrink-0" style={{ color: P.primary }} />
          <h1 className="text-sm font-semibold tracking-tight shrink-0">Intelligent Menu</h1>

          <div className="flex flex-nowrap items-center gap-2 shrink-0">
            <Select
              value={selectedMenuId ?? ''}
              onValueChange={(v) => setSelectedMenuId(v || null)}
              disabled={menus.length === 0}
            >
              <SelectTrigger className="h-8 w-[9.75rem] sm:w-[13.75rem] text-xs shrink-0">
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

          <span
            className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full shrink-0"
            style={{ background: '#FEF3EC', color: P.primary }}
          >
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P.primary }} />
            Live inventory
          </span>

          <div className="flex-1 min-w-2" />

          <button
            type="button"
            onClick={() => setShowBanner((b) => !b)}
            className={cn(
              'flex items-center gap-1.5 text-[11px] border rounded-lg px-2.5 py-1.5 transition-colors',
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
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: '#FEF3EC' }}>
                <Brain className="w-3.5 h-3.5" style={{ color: P.primary }} />
              </div>
              <div>
                <p className="text-[12px] font-semibold text-foreground mb-0.5">Intelligent Menu + inventory</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Turn IM on per product (here or in Menu Editor → master product). We use the same linked ingredients and stock math as POS.
                  When a dish is out of stock on those links, it moves to <strong>Hidden (stock)</strong> in the editor, disappears from the phone preview and your public menu, and comes back automatically after restock.
                </p>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-0 border-t border-border mt-3 divide-x divide-border">
              {[
                { icon: EyeOff, label: 'Auto-hidden', desc: `${autoHidden} with IM on and zero stock on a linked ingredient` },
                { icon: AlertTriangle, label: 'Low stock', desc: `${lowStockCnt} with IM on and low inventory (POS rule)` },
                { icon: CheckCircle, label: 'In stock', desc: `${optimal} not currently flagged as hidden/low` },
                { icon: TrendingUp, label: 'Toggle IM', desc: 'Syncs to Menu Editor; refresh list after inventory changes' },
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

        <div className="flex-1 flex min-h-0 overflow-hidden" style={{ background: P.bg }}>
          <aside className="w-52 shrink-0 border-r border-border bg-white flex flex-col overflow-y-auto">
            <div className="px-3 py-2 border-b border-border/70 bg-muted/10">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-0.5">Menu</p>
              <p className="text-[11px] font-medium text-foreground px-2 truncate" title={selectedMenuName}>
                {selectedMenuId ? selectedMenuName : '—'}
              </p>
            </div>
            <div className="px-3 py-3 flex-1">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Categories</p>
              {catsFetched && selectedMenuId && menuCategories.length === 0 && (
                <p className="text-[10px] text-muted-foreground px-2 leading-snug mb-2">
                  No categories on this menu. Add them in Menu Editor.
                </p>
              )}
              {CATEGORIES.map((cat) => {
                const stats = catStats[cat] ?? { total: 0, hidden: 0, low: 0 };
                const active = activeCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={cn(
                      'w-full flex items-center justify-between px-2 py-2 rounded-lg text-left text-xs transition-all mb-0.5',
                      active ? 'text-white font-semibold' : 'text-muted-foreground hover:text-foreground hover:bg-muted/30',
                    )}
                    style={active ? { background: P.primary } : {}}
                  >
                    <span className="font-medium">{cat}</span>
                    <div className="flex items-center gap-1">
                      {stats.hidden > 0 && (
                        <span
                          className={cn(
                            'text-[9px] font-bold px-1 py-0.5 rounded',
                            active ? 'bg-white/20 text-white' : 'bg-muted/30 text-muted-foreground',
                          )}
                        >
                          {stats.hidden}
                        </span>
                      )}
                      <span className={cn('text-[9px]', active ? 'text-white/70' : 'text-muted-foreground/60')}>{stats.total}</span>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="px-3 pt-2 pb-4 border-t border-border/60 space-y-2">
              <p className="text-[9px] font-bold uppercase tracking-widest text-muted-foreground px-2 mb-2">Legend</p>
              {[
                { color: P.primary, label: 'Optimal / Featured' },
                { color: P.muted, label: 'Low stock' },
                { color: P.rose, label: 'Auto-hidden' },
              ].map((l) => (
                <div key={l.label} className="flex items-center gap-2 px-2">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color }} />
                  <span className="text-[10px] text-muted-foreground">{l.label}</span>
                </div>
              ))}
            </div>
          </aside>

          <main className="flex-1 overflow-y-auto p-4 min-w-0">
            {listBlocking ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : menus.length === 0 ? (
              <p className="text-sm text-muted-foreground">No menus yet. Create one in Menu Editor.</p>
            ) : catsFetched && selectedMenuId && menuCategories.length === 0 ? (
              <p className="text-sm text-muted-foreground max-w-md">
                This menu has no categories. Add categories and assign products in Menu Editor, then return here.
              </p>
            ) : scopedRows.length === 0 ? (
              <div className="text-sm text-muted-foreground max-w-lg space-y-2">
                <p>No products on <span className="font-medium text-foreground">{selectedMenuName}</span> yet.</p>
                <p className="text-xs leading-relaxed">
                  Put each dish in a category that belongs to this menu (category in Menu Editor), or match the legacy category name to a menu category.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-muted-foreground mb-3 truncate" title={selectedMenuName}>
                  Showing <span className="font-medium text-foreground">{scopedRows.length}</span> product{scopedRows.length !== 1 ? 's' : ''} on{' '}
                  <span className="font-medium text-foreground">{selectedMenuName}</span>
                  {activeCategory !== 'All' && (
                    <> · category <span className="font-medium text-foreground">{activeCategory}</span></>
                  )}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
                  {[
                    { icon: CheckCircle, label: 'Not hidden / low', value: String(optimal), sub: 'visible in editor & previews' },
                    { icon: Package, label: 'IM enabled', value: `${enabledCount}/${scopedRows.length}`, sub: 'products under inventory sync' },
                    { icon: EyeOff, label: 'Auto-hidden', value: String(autoHidden), sub: 'out of stock on linked ingredients' },
                  ].map((k) => (
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

                {activeCategory === 'All'
                  ? CATEGORIES.slice(1).map((cat) => {
                      const catItems = sortedMenu.filter((m) => (m.category || 'Other') === cat);
                      if (catItems.length === 0) return null;
                      return (
                        <div key={cat} className="mb-5">
                          <div className="flex items-center gap-2 mb-2">
                            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">{cat}</h2>
                            <div className="flex-1 h-px bg-border" />
                            {(catStats[cat]?.hidden ?? 0) > 0 && (
                              <span className="text-[9px] border border-rose-200 bg-rose-50 px-1.5 py-0.5 rounded-full font-bold" style={{ color: P.rose }}>
                                {catStats[cat]!.hidden} hidden
                              </span>
                            )}
                          </div>
                          {catItems.map((item) => {
                            const catSorted = sortedMenu.filter((m) => (m.category || 'Other') === item.category);
                            const idx = catSorted.indexOf(item);
                            const enabled = item.intelligentInventorySync === true;
                            return (
                              <ProductCard
                                key={item.id}
                                item={item}
                                algo={algoMap[item.id]}
                                rank={rankMap[item.id]}
                                enabled={enabled}
                                featured={featuredItems.has(item.id)}
                                onToggle={() => void toggleIm(item.id, enabled)}
                                onFeature={() =>
                                  setFeaturedItems((p) => {
                                    const n = new Set(p);
                                    n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                                    return n;
                                  })
                                }
                                onMoveUp={() => moveItem(item.id, 1)}
                                onMoveDown={() => moveItem(item.id, -1)}
                                onReset={() => setUserOffsets((p) => { const n = { ...p }; delete n[item.id]; return n; })}
                                canMoveUp={idx > 0}
                                canMoveDown={idx < catSorted.length - 1}
                                hasOffset={item.id in userOffsets}
                                toggling={togglingId === item.id}
                              />
                            );
                          })}
                        </div>
                      );
                    })
                  : visibleItems.map((item) => {
                      const catSorted = sortedMenu.filter((m) => (m.category || 'Other') === item.category);
                      const idx = catSorted.indexOf(item);
                      const enabled = item.intelligentInventorySync === true;
                      return (
                        <ProductCard
                          key={item.id}
                          item={item}
                          algo={algoMap[item.id]}
                          rank={rankMap[item.id]}
                          enabled={enabled}
                          featured={featuredItems.has(item.id)}
                          onToggle={() => void toggleIm(item.id, enabled)}
                          onFeature={() =>
                            setFeaturedItems((p) => {
                              const n = new Set(p);
                              n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                              return n;
                            })
                          }
                          onMoveUp={() => moveItem(item.id, 1)}
                          onMoveDown={() => moveItem(item.id, -1)}
                          onReset={() => setUserOffsets((p) => { const n = { ...p }; delete n[item.id]; return n; })}
                          canMoveUp={idx > 0}
                          canMoveDown={idx < catSorted.length - 1}
                          hasOffset={item.id in userOffsets}
                          toggling={togglingId === item.id}
                        />
                      );
                    })}
              </>
            )}
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
