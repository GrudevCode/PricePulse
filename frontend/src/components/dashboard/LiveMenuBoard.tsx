import { useEffect, useRef, useState } from 'react';
import { TrendingUp, TrendingDown, Minus, Zap, Lock } from 'lucide-react';
import { formatPence, cn } from '@/lib/utils';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  isDynamicPricingEnabled: boolean;
}

interface SignalData {
  demandScore: number;
  period: string;
  weatherCondition: string;
  temperatureC: string | number;
  occupancyPct: number;
}

type FlashDir = 'up' | 'down';

interface LiveMenuBoardProps {
  menuItems: MenuItem[];
  signals: SignalData | null;
  venueName: string;
}

const CATEGORY_ORDER = ['Drinks', 'Cocktails', 'Beer', 'Wine', 'Food', 'Hot Drinks', 'Other'];

function sortCategories(cats: string[]) {
  return [...cats].sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a);
    const bi = CATEGORY_ORDER.indexOf(b);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });
}

export function LiveMenuBoard({ menuItems, signals, venueName }: LiveMenuBoardProps) {
  const [flashMap, setFlashMap] = useState<Record<string, FlashDir>>({});
  const prevPricesRef = useRef<Record<string, number>>({});
  const flashTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const newFlashes: Record<string, FlashDir> = {};

    menuItems.forEach((item) => {
      const prev = prevPricesRef.current[item.id];
      if (prev !== undefined && prev !== item.currentPrice) {
        newFlashes[item.id] = item.currentPrice > prev ? 'up' : 'down';
        // clear any existing timeout for this item
        if (flashTimeoutsRef.current[item.id]) {
          clearTimeout(flashTimeoutsRef.current[item.id]);
        }
        flashTimeoutsRef.current[item.id] = setTimeout(() => {
          setFlashMap((prev) => {
            const next = { ...prev };
            delete next[item.id];
            return next;
          });
        }, 1800); // slightly longer than 1.6s animation
      }
      prevPricesRef.current[item.id] = item.currentPrice;
    });

    if (Object.keys(newFlashes).length > 0) {
      setFlashMap((prev) => ({ ...prev, ...newFlashes }));
    }
  }, [menuItems]);

  // Group by category
  const grouped = menuItems.reduce<Record<string, MenuItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});
  const categories = sortCategories(Object.keys(grouped));

  return (
    <div className="h-full flex flex-col">
      {/* Board header */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-secondary/20 shrink-0">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full live-pulse" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
            Live Menu · {venueName}
          </span>
        </div>
        <div className="flex-1" />
        {signals && (
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Demand&nbsp;
              <span className={cn(
                'font-semibold',
                signals.demandScore >= 70 ? 'text-emerald-600' :
                signals.demandScore >= 40 ? 'text-amber-600' : 'text-red-500'
              )}>
                {signals.demandScore}
              </span>
              /100
            </span>
            <span className="text-border">|</span>
            <span>{signals.period}</span>
            <span className="text-border">|</span>
            <span>{parseFloat(String(signals.temperatureC)).toFixed(0)}°C</span>
            <span className="text-border">|</span>
            <span>
              Occupancy&nbsp;
              <span className="text-foreground font-semibold">{signals.occupancyPct}%</span>
            </span>
          </div>
        )}
        <div className="text-xs text-muted-foreground/50 font-mono tabular-nums">
          {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto">
        {menuItems.length === 0 ? (
          <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
            No menu items yet — add items in Menu Management.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr className="text-xs text-muted-foreground">
                <th className="text-left font-medium py-2.5 px-4 w-[40%]">Item</th>
                <th className="text-right font-medium py-2.5 px-3">Base</th>
                <th className="text-right font-medium py-2.5 px-3">Current</th>
                <th className="text-right font-medium py-2.5 px-3">Change</th>
                <th className="text-right font-medium py-2.5 px-4 hidden sm:table-cell">Range</th>
                <th className="text-center font-medium py-2.5 px-3 hidden md:table-cell">Dynamic</th>
              </tr>
            </thead>
            <tbody>
              {categories.map((cat) => (
                <>
                  {/* Category row */}
                  <tr key={`cat-${cat}`} className="bg-secondary/40 border-y border-border">
                    <td colSpan={6} className="px-4 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {cat}
                    </td>
                  </tr>
                  {grouped[cat].map((item) => {
                    const flash = flashMap[item.id];
                    const diff = item.currentPrice - item.basePrice;
                    const pct = item.basePrice > 0 ? ((diff / item.basePrice) * 100) : 0;
                    const isUp = diff > 0;
                    const isDown = diff < 0;

                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          'border-b border-border/50 hover:bg-secondary/20',
                          flash === 'up' && 'price-flash-up',
                          flash === 'down' && 'price-flash-down'
                        )}
                      >
                        {/* Name */}
                        <td className="py-3 px-4">
                          <span className={cn(
                            'font-medium transition-colors',
                            flash === 'up' ? 'text-emerald-700' :
                            flash === 'down' ? 'text-red-600' : 'text-foreground'
                          )}>
                            {item.name}
                          </span>
                        </td>

                        {/* Base */}
                        <td className="py-3 px-3 text-right text-muted-foreground font-mono text-xs">
                          {formatPence(item.basePrice)}
                        </td>

                        {/* Current — the big number, animates on flash */}
                        <td className="py-3 px-3 text-right">
                          <span className={cn(
                            'font-bold font-mono text-sm tabular-nums inline-block',
                            flash === 'up'   ? 'price-val-up   text-emerald-600' :
                            flash === 'down' ? 'price-val-down text-red-500'     :
                            isUp   ? 'text-emerald-600' :
                            isDown ? 'text-red-500'     : 'text-foreground'
                          )}>
                            {formatPence(item.currentPrice)}
                          </span>
                        </td>

                        {/* Change % with arrow — bold flash indicator */}
                        <td className="py-3 px-3 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {flash === 'up' || isUp ? (
                              <TrendingUp className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                flash === 'up' ? 'text-emerald-500' : 'text-emerald-600'
                              )} />
                            ) : flash === 'down' || isDown ? (
                              <TrendingDown className={cn(
                                'h-3.5 w-3.5 shrink-0',
                                flash === 'down' ? 'text-red-500' : 'text-red-500'
                              )} />
                            ) : (
                              <Minus className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                            )}
                            <span className={cn(
                              'text-xs font-semibold font-mono tabular-nums',
                              flash === 'up'   ? 'text-emerald-600 font-bold' :
                              flash === 'down' ? 'text-red-500 font-bold'     :
                              isUp   ? 'text-emerald-600' :
                              isDown ? 'text-red-500'     : 'text-muted-foreground/50'
                            )}>
                              {isUp ? '+' : ''}{pct.toFixed(1)}%
                            </span>
                          </div>
                        </td>

                        {/* Min–Max range */}
                        <td className="py-3 px-4 text-right hidden sm:table-cell">
                          <span className="text-xs text-muted-foreground/50 font-mono tabular-nums">
                            {formatPence(item.minPrice)}–{formatPence(item.maxPrice)}
                          </span>
                        </td>

                        {/* Dynamic badge */}
                        <td className="py-3 px-3 text-center hidden md:table-cell">
                          {item.isDynamicPricingEnabled ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 border border-primary/20 rounded-full px-2 py-0.5">
                              <Zap className="h-2.5 w-2.5" />
                              Live
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-muted-foreground/60 bg-secondary border border-border rounded-full px-2 py-0.5">
                              <Lock className="h-2.5 w-2.5" />
                              Fixed
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
