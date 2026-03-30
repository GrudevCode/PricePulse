import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { cn } from '@/lib/utils';
import { inventoryLineCostPence, compatibleUnitsFor, conversionHint } from '@/lib/recipeInventoryCost';
import { useVenueStore } from '@/store/venueStore';
import {
  recipeApi, menuApi, inventoryApi, ingredientsApi, menusApi, categoriesApi,
} from '@/lib/api';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectSeparator, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChefHat, Plus, Trash2, Save, Upload, AlertTriangle,
  Search, ChevronLeft, ChevronRight, ChevronDown, Package, Beaker,
  X, Percent, PoundSterling, Calculator, Layers, Maximize2,
  PanelLeft, PanelRight,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface RecipeLine {
  id?: string;
  inventoryItemId?: string | null;
  subRecipeId?: string | null;
  ingredientName: string;
  quantity: number;
  unit: string;
  costPence: number;
  wastePct: number;
  displayOrder: number;
  /** When linked to inventory: if false, cost tracks qty/unit from inventory unit price (with conversion). Not sent to API. */
  costManualOverride?: boolean;
}

interface Recipe {
  id: string;
  venueId: string;
  menuItemId?: string | null;
  name: string;
  portions: number;
  targetGpPct: number;
  vatRatePct: number;
  notes?: string | null;
  lines: RecipeLine[];
  createdAt: string;
  updatedAt: string;
}

interface SubRecipe {
  id: string;
  venueId: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  notes?: string | null;
  lines: SubRecipeLine[];
  createdAt: string;
  updatedAt: string;
}

interface SubRecipeLine {
  id?: string;
  inventoryItemId?: string | null;
  ingredientName: string;
  quantity: number;
  unit: string;
  costPence: number;
  wastePct: number;
  displayOrder: number;
}

interface MenuItem { id: string; name: string; category: string; currentPrice: number; categoryId?: string | null; }
interface MenuDef { id: string; name: string; isActive?: boolean; }
interface CategoryRow { id: string; name: string; }

/** Sidebar category bucket: display name, optional menu-category id, menu items */
interface MenuCategory { name: string; categoryId: string | null; items: MenuItem[]; }

const SRC_MANUAL = '__manual__';
interface InventoryItem { id: string; name: string; category: string; unit: string; unitCostPence: number; onHand: number; parLevel: number; status: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const VAT_RATES: Record<string, number> = {
  'GB': 20, 'IE': 13.5, 'FR': 10, 'DE': 19, 'ES': 10,
  'IT': 10, 'NL': 9, 'US': 0, 'CA': 5, 'AU': 10,
};

const UNITS = ['g', 'kg', 'ml', 'l', 'ea', 'portion', 'oz', 'lb', 'tbsp', 'tsp', 'cup'];

/**
 * Returns two groups for the unit dropdown:
 * - `compatible`: units in the same measurement family as the linked inventory item
 *   (e.g. ml/l/tsp/tbsp/cup when inventory is in ‘l’)
 * - `other`: remaining preset units that don’t convert with the inventory unit
 *
 * When no inventory item is linked, compatible is empty and other is all presets.
 * The current line unit is always included somewhere.
 */
function groupedUnitOptions(
  inventoryItemId: string | null | undefined,
  currentUnit: string | undefined,
  inventory: InventoryItem[],
): { compatible: string[]; other: string[] } {
  const inv = inventoryItemId ? inventory.find((i) => i.id === inventoryItemId) : null;
  const invUnit = inv?.unit?.trim();

  const ALL_PRESETS = [...UNITS];

  if (!invUnit) {
    const out = [...ALL_PRESETS];
    const cu = currentUnit?.trim();
    if (cu && !out.some((u) => u.toLowerCase() === cu.toLowerCase())) out.unshift(cu);
    return { compatible: [], other: out };
  }

  const compat = compatibleUnitsFor(invUnit);
  const compatSet = new Set(compat.map((u) => u.toLowerCase()));

  // Ensure the inventory’s own unit is present (handles custom units like ‘case’)
  if (!compatSet.has(invUnit.toLowerCase())) {
    compat.unshift(invUnit);
    compatSet.add(invUnit.toLowerCase());
  }

  // Ensure the current line unit is present
  const cu = currentUnit?.trim();
  if (cu && !compatSet.has(cu.toLowerCase()) && !ALL_PRESETS.some((u) => u.toLowerCase() === cu.toLowerCase())) {
    compat.push(cu);
    compatSet.add(cu.toLowerCase());
  }

  const other = ALL_PRESETS.filter((u) => !compatSet.has(u.toLowerCase()));

  return { compatible: compat, other };
}

/** @deprecated use groupedUnitOptions — kept for sub-recipe lines that still use flat list */
function unitChoicesWithCurrentLine(
  lineUnit: string | undefined,
  inventoryItemId: string | null | undefined,
  inventory: InventoryItem[],
): string[] {
  const { compatible, other } = groupedUnitOptions(inventoryItemId, lineUnit, inventory);
  const all = [...compatible, ...other];
  const u = lineUnit?.trim();
  if (!u) return all;
  if (all.some((x) => x.toLowerCase() === u.toLowerCase())) return all;
  return [u, ...all];
}

function fmt(pence: number) { return `£${(pence / 100).toFixed(2)}`; }

/**
 * Avoid native `type="number"` in modals: it strips decimals mid-typing ("1." → 1) and fights IME/cursor.
 * Commits on valid parses while typing; empty / trailing "." defers full commit until blur.
 */
function RecipeModalDecimalInput({
  value,
  onCommit,
  className,
  min = 0,
  max,
  /** When true, a stored 0 renders as empty (easier qty entry). When false, show "0" (e.g. waste %). */
  emptyZero = true,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
  min?: number;
  max?: number;
  emptyZero?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  useEffect(() => {
    if (!focused) setText(formatDecimalDisplay(value));
  }, [value, focused, emptyZero]);
  function formatDecimalDisplay(n: number) {
    if (!Number.isFinite(n)) return '';
    if (n === 0 && emptyZero) return '';
    return String(n);
  }
  function clamp(n: number) {
    let x = Number.isFinite(n) ? n : 0;
    x = Math.max(min, x);
    if (max !== undefined) x = Math.min(max, x);
    return x;
  }
  function commitFromString(s: string) {
    const t = s.trim().replace(/,/g, '.');
    if (t === '' || t === '.' || t === '-') {
      onCommit(clamp(0));
      return;
    }
    const n = parseFloat(t);
    onCommit(clamp(Number.isFinite(n) ? n : 0));
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      className={className}
      value={focused ? text : formatDecimalDisplay(value)}
      onFocus={() => {
        setFocused(true);
        setText(formatDecimalDisplay(value));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '.');
        if (raw !== '' && !/^-?\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        if (raw === '' || raw === '.' || raw === '-' || raw.endsWith('.')) return;
        const n = parseFloat(raw);
        if (Number.isFinite(n)) onCommit(clamp(n));
      }}
      onBlur={() => {
        setFocused(false);
        commitFromString(text);
      }}
    />
  );
}

/** Integer pence (whole numbers) with sane typing — shows 0 correctly. */
function RecipeModalPenceInput({
  value,
  onCommit,
  className,
}: {
  value: number;
  onCommit: (n: number) => void;
  className?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('0');
  useEffect(() => {
    if (!focused) setText(String(Math.max(0, Math.round(value))));
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className={className}
      value={focused ? text : String(Math.max(0, Math.round(value)))}
      onFocus={() => {
        setFocused(true);
        setText(String(Math.max(0, Math.round(value))));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/\D/g, '');
        setText(raw);
        if (raw === '') return;
        onCommit(parseInt(raw, 10));
      }}
      onBlur={() => {
        setFocused(false);
        const n = parseInt(text, 10);
        onCommit(Number.isFinite(n) && n >= 0 ? n : 0);
      }}
    />
  );
}

/**
 * Recipe table cost column: pounds in the UI, pence in state. Same typing UX as modal decimals.
 */
function RecipeTablePoundsInput({
  pence,
  onCommitPence,
  readOnly,
  className,
  title,
}: {
  pence: number;
  onCommitPence?: (pence: number) => void;
  readOnly?: boolean;
  className?: string;
  title?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState('');
  const poundsStr = (n: number) => {
    const x = n / 100;
    if (!Number.isFinite(x)) return '0.00';
    return x.toFixed(2);
  };
  useEffect(() => {
    if (!focused) setText(poundsStr(pence));
  }, [pence, focused]);
  if (readOnly) {
    return (
      <input
        type="text"
        readOnly
        title={title}
        className={cn('min-w-[4rem] w-full cursor-not-allowed bg-transparent text-right text-sm tabular-nums opacity-60 focus:outline-none', className)}
        value={poundsStr(pence)}
      />
    );
  }
  function parsePounds(s: string): number {
    const t = s.trim().replace(/,/g, '.');
    if (t === '' || t === '.' || t === '-') return 0;
    const n = parseFloat(t);
    return Number.isFinite(n) ? Math.max(0, n) : 0;
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      title={title}
      className={className}
      value={focused ? text : poundsStr(pence)}
      onFocus={() => {
        setFocused(true);
        setText(poundsStr(pence));
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/,/g, '.');
        if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return;
        setText(raw);
        if (raw === '' || raw === '.' || raw.endsWith('.')) return;
        const committed = Math.round(parsePounds(raw) * 100);
        onCommitPence?.(committed);
      }}
      onBlur={() => {
        setFocused(false);
        const committed = Math.round(parsePounds(text) * 100);
        onCommitPence?.(committed);
        setText(poundsStr(committed));
      }}
    />
  );
}

/** Refresh line costs from current inventory (auto-cost lines only). */
function applyLiveInventoryCostsToLines(lines: RecipeLine[], invList: InventoryItem[]): RecipeLine[] {
  return lines.map((line) => {
    if (!line.inventoryItemId || line.costManualOverride) return line;
    const inv = invList.find((i) => i.id === line.inventoryItemId);
    if (!inv) return line;
    const costPence = inventoryLineCostPence(line.quantity, line.unit, inv.unit, inv.unitCostPence);
    return costPence === line.costPence ? line : { ...line, costPence };
  });
}

interface RecipeIngredientsTableProps {
  recipeLines: RecipeLine[];
  inventory: InventoryItem[];
  subRecipes: SubRecipe[];
  updateLine: (index: number, patch: Partial<RecipeLine>) => void;
  /** Recalculate £ from inventory when line is linked and not manually overridden */
  updateLineWithInventoryCost: (index: number, patch: Partial<RecipeLine>) => void;
  linkInventoryItem: (index: number, inv: InventoryItem) => void;
  linkSubRecipe: (index: number, sr: SubRecipe) => void;
  removeLine: (index: number) => void;
  addLine: () => void;
  addSubRecipeLine?: () => void;
  /** Min width on `<table>` — wider in maximized view */
  tableMinWidthClass?: string;
  tableWrapperClassName?: string;
  addButtonBarClassName?: string;
  /** When the table is in the maximize modal, portaled Select menus need a higher z-index than the overlay. */
  selectInElevatedLayer?: boolean;
}

function RecipeIngredientsTable({
  recipeLines,
  inventory,
  subRecipes,
  updateLine,
  updateLineWithInventoryCost,
  linkInventoryItem,
  linkSubRecipe,
  removeLine,
  addLine,
  addSubRecipeLine,
  tableMinWidthClass = 'min-w-[860px]',
  tableWrapperClassName = 'rounded-xl border border-border bg-card shadow-sm ring-1 ring-border/30',
  addButtonBarClassName = 'shrink-0 border-t border-border bg-background px-4 py-3',
  selectInElevatedLayer = false,
}: RecipeIngredientsTableProps) {
  const selectContentOverlay = selectInElevatedLayer ? 'z-[200]' : undefined;

  function commitLineQty(idx: number, qty: number) {
    const cur = recipeLines[idx];
    if (!cur) return;
    if (cur.inventoryItemId) {
      if (!cur.costManualOverride) {
        updateLineWithInventoryCost(idx, { quantity: qty });
        return;
      }
      const nextCost =
        cur.quantity > 0 && qty >= 0
          ? Math.round(cur.costPence * (qty / cur.quantity))
          : cur.costPence;
      updateLine(idx, { quantity: qty, costPence: nextCost });
      return;
    }
    if (cur.subRecipeId) {
      const sr = subRecipes.find((s) => s.id === cur.subRecipeId);
      if (sr) {
        const srCost = sr.lines.reduce(
          (s, l) => s + Math.round(l.costPence * (1 + l.wastePct / 100)),
          0,
        );
        const perUnit = sr.yieldQty > 0 ? srCost / sr.yieldQty : srCost;
        updateLine(idx, { quantity: qty, costPence: Math.round(perUnit * qty) });
        return;
      }
    }
    const nextCost =
      cur.quantity > 0 && qty >= 0
        ? Math.round(cur.costPence * (qty / cur.quantity))
        : cur.costPence;
    updateLine(idx, { quantity: qty, costPence: nextCost });
  }

  return (
    <>
      <div className={cn('overflow-x-auto', tableWrapperClassName)}>
        <table className={cn('w-full border-collapse text-sm [&_td]:align-top', tableMinWidthClass)}>
          <thead className="sticky top-0 z-10 border-b border-border bg-muted/80 backdrop-blur-sm">
            <tr>
              <th className="w-10 whitespace-nowrap px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                #
              </th>
              <th className="min-w-[220px] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Ingredient
              </th>
              <th className="w-40 min-w-[10rem] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Source
              </th>
              <th className="w-24 min-w-[5.5rem] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Qty
              </th>
              <th className="w-28 min-w-[6.5rem] px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Unit
              </th>
              <th className="w-32 min-w-[7rem] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Cost
              </th>
              <th className="w-24 min-w-[5.5rem] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Waste %
              </th>
              <th className="w-28 min-w-[6.5rem] px-3 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Adj. cost
              </th>
              <th className="w-12 px-2 py-3" />
            </tr>
          </thead>
          <tbody>
            {recipeLines.map((line, idx) => {
              const adjCost = Math.round(line.costPence * (1 + line.wastePct / 100));
              const invForLine = line.inventoryItemId
                ? inventory.find((i) => i.id === line.inventoryItemId)
                : undefined;
              const { compatible: unitCompat, other: unitOther } = groupedUnitOptions(line.inventoryItemId, line.unit, inventory);
              return (
                <tr
                  key={idx}
                  className="border-b border-border/50 transition-colors hover:bg-muted/25"
                >
                  <td className="whitespace-nowrap px-3 py-3 text-muted-foreground tabular-nums">{idx + 1}</td>
                  <td className="px-3 py-3">
                    <input
                      className="h-9 w-full min-w-[12rem] rounded-md border border-transparent bg-transparent px-2 text-sm focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                      placeholder="Ingredient name…"
                      value={line.ingredientName}
                      onChange={(e) => updateLine(idx, { ingredientName: e.target.value })}
                    />
                  </td>
                  <td className="px-3 py-3">
                    <Select
                      value={
                        line.inventoryItemId
                          ? `i:${line.inventoryItemId}`
                          : line.subRecipeId
                            ? `s:${line.subRecipeId}`
                            : SRC_MANUAL
                      }
                      onValueChange={(val) => {
                        if (val === SRC_MANUAL) {
                          updateLine(idx, { inventoryItemId: null, subRecipeId: null });
                          return;
                        }
                        if (val.startsWith('i:')) {
                          const id = val.slice(2);
                          const inv = inventory.find((i) => i.id === id);
                          if (inv) linkInventoryItem(idx, inv);
                          return;
                        }
                        if (val.startsWith('s:')) {
                          const id = val.slice(2);
                          const sr = subRecipes.find((s) => s.id === id);
                          if (sr) linkSubRecipe(idx, sr);
                        }
                      }}
                    >
                      <SelectTrigger className="h-9 w-full min-w-[9rem] border border-input bg-background text-xs shadow-sm hover:bg-muted/40">
                        <SelectValue placeholder="Manual" />
                      </SelectTrigger>
                      <SelectContent className={cn('max-h-60', selectContentOverlay)}>
                        <SelectItem value={SRC_MANUAL}>Manual</SelectItem>
                        <SelectGroup>
                          <SelectLabel>Inventory</SelectLabel>
                          {inventory.map((inv) => (
                            <SelectItem key={inv.id} value={`i:${inv.id}`}>{inv.name}</SelectItem>
                          ))}
                        </SelectGroup>
                        {subRecipes.length > 0 && (
                          <SelectGroup>
                            <SelectLabel>Sub-Recipes</SelectLabel>
                            {subRecipes.map((sr) => (
                              <SelectItem key={sr.id} value={`s:${sr.id}`}>
                                [Sub] {sr.name}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        )}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-3 py-3">
                    <RecipeModalDecimalInput
                      value={line.quantity}
                      min={0}
                      emptyZero
                      onCommit={(qty) => commitLineQty(idx, qty)}
                      className="h-9 w-full min-w-[4.5rem] rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex min-w-0 flex-col gap-0.5">
                      <Select
                        value={line.unit}
                        onValueChange={(u) => {
                          if (line.inventoryItemId) {
                            updateLineWithInventoryCost(idx, { unit: u });
                          } else {
                            updateLine(idx, { unit: u });
                          }
                        }}
                      >
                        <SelectTrigger className="h-9 w-full min-w-[5.5rem] border border-input bg-background text-xs shadow-sm hover:bg-muted/40">
                          <SelectValue placeholder="Unit" />
                        </SelectTrigger>
                        <SelectContent className={cn('max-h-56', selectContentOverlay)}>
                          {invForLine && unitCompat.length > 0 ? (
                            <>
                              <SelectGroup>
                                <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                  {invForLine.unit} family
                                </SelectLabel>
                                {unitCompat.map((u) => (
                                  <SelectItem key={u} value={u}>
                                    {u === invForLine.unit?.trim() ? `${u} · stock` : u}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                              {unitOther.length > 0 && (
                                <>
                                  <SelectSeparator />
                                  <SelectGroup>
                                    <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                      Other
                                    </SelectLabel>
                                    {unitOther.map((u) => (
                                      <SelectItem key={u} value={u}>{u}</SelectItem>
                                    ))}
                                  </SelectGroup>
                                </>
                              )}
                            </>
                          ) : (
                            [...unitCompat, ...unitOther].map((u) => (
                              <SelectItem key={u} value={u}>{u}</SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                      {invForLine && (() => {
                        const hint = conversionHint(line.quantity, line.unit, invForLine.unit, invForLine.unitCostPence);
                        return (
                          <p className="text-[10px] leading-tight text-muted-foreground">
                            {hint
                              ? <span className="text-amber-700 dark:text-amber-500">{hint}</span>
                              : <>Priced per <span className="font-medium text-foreground">{invForLine.unit}</span></>
                            }
                          </p>
                        );
                      })()}
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right">
                    <div className="flex flex-col items-end gap-1">
                      <div className="flex h-9 w-full max-w-[7.5rem] items-center justify-end gap-1 rounded-md border border-input bg-background px-2 shadow-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20">
                        <span className="shrink-0 text-xs text-muted-foreground">£</span>
                        {line.inventoryItemId && !line.costManualOverride ? (
                          <RecipeTablePoundsInput
                            readOnly
                            pence={line.costPence}
                            title="Turn off “Auto cost” below to edit manually"
                            className="min-w-[4rem] w-full"
                          />
                        ) : (
                          <RecipeTablePoundsInput
                            pence={line.costPence}
                            title={line.inventoryItemId ? 'Line cost for this quantity (manual override)' : 'Ingredient line cost'}
                            className="min-w-[4rem] w-full bg-transparent text-right text-sm tabular-nums focus:outline-none"
                            onCommitPence={(p) => {
                              updateLine(idx, {
                                costPence: p,
                                ...(recipeLines[idx]?.inventoryItemId ? { costManualOverride: true } : {}),
                              });
                            }}
                          />
                        )}
                      </div>
                      {line.inventoryItemId && (
                        <label className="flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[10px] text-muted-foreground">
                          <input
                            type="checkbox"
                            className="rounded border-border"
                            checked={!line.costManualOverride}
                            onChange={(e) => {
                              const auto = e.target.checked;
                              if (auto) {
                                updateLineWithInventoryCost(idx, { costManualOverride: false });
                              } else {
                                updateLine(idx, { costManualOverride: true });
                              }
                            }}
                          />
                          Auto cost
                        </label>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-3">
                    <RecipeModalDecimalInput
                      value={line.wastePct}
                      min={0}
                      max={100}
                      emptyZero={false}
                      onCommit={(wastePct) => updateLine(idx, { wastePct })}
                      className="h-9 w-full min-w-[3.5rem] rounded-md border border-input bg-background px-2 text-right text-sm tabular-nums focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                    />
                  </td>
                  <td className="px-3 py-3 text-right align-middle">
                    <div
                      className="ml-auto flex h-9 min-w-[4.5rem] max-w-[7rem] items-center justify-end rounded-md border border-border/80 bg-muted/30 px-2 text-sm font-semibold tabular-nums text-foreground"
                      title="Cost after waste: base cost × (1 + waste %)"
                    >
                      {fmt(adjCost)}
                    </div>
                  </td>
                  <td className="px-2 py-3 text-center">
                    <button
                      type="button"
                      onClick={() => removeLine(idx)}
                      className="inline-flex rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className={addButtonBarClassName}>
        <button
          type="button"
          onClick={addLine}
          className="flex h-9 items-center gap-2 rounded-lg border border-dashed border-border px-4 text-sm font-medium transition-colors hover:border-primary/40 hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" />
          Add ingredient
        </button>
      </div>
    </>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function RecipeCalculator() {
  const { selectedVenueId, venues } = useVenueStore();
  const venueId = selectedVenueId || venues[0]?.id || '';
  const queryClient = useQueryClient();

  const [selectedMenuId, setSelectedMenuId] = useState<string | null>(null);

  const { data: menus = [] } = useQuery({
    queryKey: ['menus', venueId],
    queryFn: async () => {
      const r = await menusApi.list(venueId);
      return (r.data.data ?? []) as MenuDef[];
    },
    enabled: !!venueId,
  });

  const { data: menuCategories = [], isFetched: categoriesFetched } = useQuery({
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

  // Data — menu items shared query key with Menu Editor so prices stay in sync
  const { data: menuItems = [], isLoading: menuLoading } = useQuery({
    queryKey: ['menu-items', venueId],
    queryFn: async () => {
      const r = await menuApi.list(venueId);
      return (r.data.data ?? []) as MenuItem[];
    },
    enabled: !!venueId,
    staleTime: 10_000,
    refetchOnWindowFocus: true,
  });

  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [subRecipes, setSubRecipes] = useState<SubRecipe[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const inventoryRef = useRef<InventoryItem[]>([]);
  inventoryRef.current = inventory;
  const [loading, setLoading] = useState(true);

  // UI state
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [sidebarSearch, setSidebarSearch] = useState('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [showMenuSidebar, setShowMenuSidebar] = useState(true);
  const [showCostsPanel, setShowCostsPanel] = useState(true);
  const [showSubRecipeModal, setShowSubRecipeModal] = useState(false);
  const [editingSubRecipe, setEditingSubRecipe] = useState<SubRecipe | null>(null);

  // Current recipe edit state
  const [recipeName, setRecipeName] = useState('');
  const [recipeMenuItemId, setRecipeMenuItemId] = useState<string | null>(null);
  const [recipePortions, setRecipePortions] = useState(1);
  const [recipeTargetGp, setRecipeTargetGp] = useState(70);
  const [recipeVatCountry, setRecipeVatCountry] = useState('GB');
  const [recipeNotes, setRecipeNotes] = useState('');
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);

  /** gp = margin on selling price (food cost = 100% − margin). multiplier = sell (ex VAT) = cost × multiplier */
  const [pricingMethod, setPricingMethod] = useState<'gp' | 'multiplier'>('gp');
  const [costMultiplierStr, setCostMultiplierStr] = useState('2');
  const [menuPriceDraft, setMenuPriceDraft] = useState('');
  const [savingMenuPrice, setSavingMenuPrice] = useState(false);
  const [ingredientTableModalOpen, setIngredientTableModalOpen] = useState(false);
  const [showAddMenuRecipeModal, setShowAddMenuRecipeModal] = useState(false);
  const [addMenuRecipeTarget, setAddMenuRecipeTarget] = useState<MenuCategory | null>(null);
  const [addMenuRecipeName, setAddMenuRecipeName] = useState('');
  const [addMenuRecipePriceStr, setAddMenuRecipePriceStr] = useState('9.99');
  const [addMenuRecipeSaving, setAddMenuRecipeSaving] = useState(false);

  // Sub-recipe modal state
  const [srName, setSrName] = useState('');
  const [srYieldQty, setSrYieldQty] = useState(1);
  const [srYieldUnit, setSrYieldUnit] = useState('portion');
  const [srNotes, setSrNotes] = useState('');
  const [srLines, setSrLines] = useState<SubRecipeLine[]>([]);
  const [srSaving, setSrSaving] = useState(false);
  const [srError, setSrError] = useState<string | null>(null);

  // ─── Load data ────────────────────────────────────────────────────────────

  const loadAll = useCallback(async () => {
    if (!venueId) return;
    setLoading(true);
    try {
      try {
        const invResp = await inventoryApi.list(venueId);
        const raw = (invResp.data.data ?? []) as Record<string, unknown>[];
        setInventory(
          raw.map((it) => {
            const r = it as Record<string, unknown>;
            return {
              id: String(r.id ?? ''),
              name: String(r.name ?? ''),
              category: String(r.category ?? ''),
              unit: String(r.unit ?? 'ea'),
              unitCostPence: Math.max(0, Math.round(Number(r.unitCostPence ?? r.unit_cost_pence ?? 0))),
              onHand: Number(r.onHand ?? r.on_hand ?? 0) || 0,
              parLevel: Number(r.parLevel ?? r.par_level ?? 0) || 0,
              status: String(r.status ?? 'ok'),
            } satisfies InventoryItem;
          }).filter((it) => it.id),
        );
      } catch {
        // inventory optional
      }

      // Recipe tables may not exist yet (migration pending) — load gracefully
      try {
        const [recipesResp, subResp] = await Promise.all([
          recipeApi.list(venueId),
          recipeApi.listSubRecipes(venueId),
        ]);
        setRecipes(recipesResp.data.data ?? []);
        setSubRecipes(subResp.data.data ?? []);
      } catch {
        // Recipe tables not yet created — that's fine
      }
    } catch (err) {
      console.error('[RecipeCalculator] loadAll error:', err);
    } finally {
      setLoading(false);
    }
  }, [venueId]);

  useEffect(() => { void loadAll(); }, [loadAll]);

  /** Refresh recipes when coming back to this tab (e.g. after deleting a dish in Menu Editor). */
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') void loadAll();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [loadAll]);

  /** When inventory prices load or refresh, recompute auto-cost ingredient lines (recipe open). */
  useEffect(() => {
    if (!isEditing) return;
    setRecipeLines((prev) => {
      const next = applyLiveInventoryCostsToLines(prev, inventory);
      if (next.length !== prev.length) return next;
      const same = next.every((l, i) => l === prev[i]);
      return same ? prev : next;
    });
  }, [inventory, isEditing]);

  useEffect(() => {
    if (!ingredientTableModalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIngredientTableModalOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ingredientTableModalOpen]);

  useEffect(() => {
    if (!showAddMenuRecipeModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowAddMenuRecipeModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showAddMenuRecipeModal]);

  const prevVenueRef = useRef('');
  useEffect(() => {
    if (venueId !== prevVenueRef.current) {
      prevVenueRef.current = venueId;
      setExpandedCategories(new Set());
    }
  }, [venueId]);

  const sidebarMenuItems = useMemo(() => {
    if (!selectedMenuId) return menuItems;
    if (!menuCategories.length) return [];
    const catIds = new Set(menuCategories.map((c) => c.id));
    const idToName = new Map(menuCategories.map((c) => [c.id, c.name] as const));
    const nameToId = new Map(
      menuCategories.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
    );
    return menuItems
      .filter((item) => {
        if (item.categoryId && catIds.has(item.categoryId)) return true;
        if (!item.categoryId && item.category) {
          return nameToId.has(item.category.trim().toLowerCase());
        }
        return false;
      })
      .map((item) => {
        let cat = item.category;
        if (item.categoryId && idToName.has(item.categoryId)) {
          cat = idToName.get(item.categoryId)!;
        } else if (!item.categoryId && item.category) {
          const id = nameToId.get(item.category.trim().toLowerCase());
          if (id) cat = idToName.get(id) ?? item.category;
        }
        return { ...item, category: cat };
      });
  }, [menuItems, selectedMenuId, menuCategories]);

  useEffect(() => {
    setExpandedCategories(new Set());
  }, [selectedMenuId]);

  // Categories start collapsed by default — user clicks to open

  const linkedMenuItem = menuItems.find((m) => m.id === recipeMenuItemId);
  useEffect(() => {
    if (linkedMenuItem) {
      setMenuPriceDraft((linkedMenuItem.currentPrice / 100).toFixed(2));
    } else {
      setMenuPriceDraft('');
    }
  }, [linkedMenuItem?.id, linkedMenuItem?.currentPrice]);

  // ─── Sidebar menu tree ────────────────────────────────────────────────────

  const menuTree = useMemo<MenuCategory[]>(() => {
    const catMap = new Map<string, MenuItem[]>();
    for (const item of sidebarMenuItems) {
      const cat = item.category || 'Other';
      if (!catMap.has(cat)) catMap.set(cat, []);
      catMap.get(cat)!.push(item);
    }
    const nameToCatId = new Map(
      menuCategories.map((c) => [c.name.trim().toLowerCase(), c.id] as const),
    );
    return Array.from(catMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, items]) => {
        const categoryId =
          items.find((i) => i.categoryId)?.categoryId ??
          nameToCatId.get(name.trim().toLowerCase()) ??
          null;
        return { name, categoryId, items };
      });
  }, [sidebarMenuItems, menuCategories]);

  const filteredTree = useMemo(() => {
    const q = sidebarSearch.toLowerCase().trim();
    if (!q) return menuTree;
    return menuTree
      .map((cat) => ({
        ...cat,
        items: cat.items.filter((i) => i.name.toLowerCase().includes(q)),
      }))
      .filter((cat) => cat.items.length > 0);
  }, [menuTree, sidebarSearch]);

  // ─── Recipe helpers ───────────────────────────────────────────────────────

  const recipeForMenuItem = useCallback((menuItemId: string) => {
    return recipes.find((r) => r.menuItemId === menuItemId);
  }, [recipes]);

  /**
   * Merge latest product_ingredients into existing recipe lines.
   * Preserves: wastePct, costManualOverride, sub-recipe lines, recipe-only lines.
   * Syncs:     qty, unit, name, inventoryItemId and recalculates auto-costs.
   * Returns:   merged lines + whether anything actually changed.
   */
  function syncProductIngredientsToLines(
    recipeLines: RecipeLine[],
    productIngredients: Array<{
      name: string; quantity: string | number; unit: string;
      costPence: number; inventoryItemId?: string | null;
    }>,
    inv: InventoryItem[],
  ): { lines: RecipeLine[]; changed: boolean } {
    let changed = false;
    const synced = [...recipeLines];

    for (const pi of productIngredients) {
      const qty = typeof pi.quantity === 'string' ? parseFloat(pi.quantity) : (pi.quantity || 0);
      const unit = pi.unit || 'g';

      // Match by inventoryItemId (reliable) or ingredient name
      const matchIdx = synced.findIndex((l) => {
        if (pi.inventoryItemId && l.inventoryItemId && pi.inventoryItemId === l.inventoryItemId) return true;
        return l.ingredientName.toLowerCase().trim() === pi.name.toLowerCase().trim();
      });

      if (matchIdx >= 0) {
        const ex = synced[matchIdx];
        const qtyDiff = Math.abs(ex.quantity - qty) > 0.0001;
        const unitDiff = ex.unit !== unit;
        const nameDiff = ex.ingredientName !== pi.name;
        const invDiff = pi.inventoryItemId && ex.inventoryItemId !== pi.inventoryItemId;

        if (qtyDiff || unitDiff || nameDiff || invDiff) {
          changed = true;
          const newInvId = pi.inventoryItemId ?? ex.inventoryItemId ?? null;
          let costPence = ex.costPence;
          if (!ex.costManualOverride) {
            const invItem = newInvId ? inv.find((i) => i.id === newInvId) : null;
            if (invItem) {
              costPence = inventoryLineCostPence(qty, unit, invItem.unit, invItem.unitCostPence);
            } else if (qtyDiff && ex.quantity > 0) {
              costPence = Math.round(ex.costPence * (qty / ex.quantity));
            }
          }
          synced[matchIdx] = {
            ...ex,
            inventoryItemId: newInvId,
            ingredientName: pi.name,
            quantity: qty,
            unit,
            costPence,
          };
        }
      } else {
        // Ingredient added in Menu Editor but not yet in the recipe — append it
        changed = true;
        const invItem = pi.inventoryItemId ? inv.find((i) => i.id === pi.inventoryItemId) : null;
        synced.push({
          inventoryItemId: pi.inventoryItemId ?? null,
          subRecipeId: null,
          ingredientName: pi.name,
          quantity: qty,
          unit,
          costPence: invItem
            ? inventoryLineCostPence(qty, unit, invItem.unit, invItem.unitCostPence)
            : (pi.costPence || 0),
          wastePct: 0,
          displayOrder: synced.length,
          costManualOverride: false,
        });
      }
    }
    return { lines: synced, changed };
  }

  async function selectRecipe(recipe: Recipe) {
    setSelectedRecipeId(recipe.id);
    setRecipeName(recipe.name);
    setRecipeMenuItemId(recipe.menuItemId ?? null);
    setRecipePortions(recipe.portions);
    setRecipeTargetGp(Math.min(90, Math.max(5, recipe.targetGpPct)));
    setRecipeNotes(recipe.notes ?? '');
    const mapped = recipe.lines.map((l, i) => ({ ...l, displayOrder: i }));
    let lines = applyLiveInventoryCostsToLines(mapped, inventoryRef.current);
    const vatEntry = Object.entries(VAT_RATES).find(([, v]) => v === recipe.vatRatePct);
    setRecipeVatCountry(vatEntry?.[0] ?? 'GB');

    // Sync latest product_ingredients for menu-linked recipes so Menu Editor
    // changes (qty, unit, new/removed ingredients) are immediately reflected.
    let hasSyncedChanges = false;
    if (recipe.menuItemId) {
      try {
        const resp = await ingredientsApi.list(recipe.menuItemId);
        const productIngredients = resp.data.data ?? [];
        if (productIngredients.length > 0) {
          const { lines: synced, changed } = syncProductIngredientsToLines(
            lines, productIngredients, inventoryRef.current,
          );
          lines = synced;
          hasSyncedChanges = changed;
        }
      } catch {
        // Not critical — proceed with recipe lines as stored
      }
    }

    setRecipeLines(lines);
    setDirty(hasSyncedChanges);
    setIsEditing(true);
  }

  async function newRecipeForMenuItem(menuItem: MenuItem) {
    setSelectedRecipeId(null);
    setRecipeName(menuItem.name);
    setRecipeMenuItemId(menuItem.id);
    setRecipePortions(1);
    setRecipeTargetGp(70);
    setRecipeVatCountry('GB');
    setRecipeNotes('');
    setIsEditing(true);

    // Auto-populate from existing product ingredients
    try {
      const resp = await ingredientsApi.list(menuItem.id);
      const productIngredients: Array<{
        id: string; name: string; quantity: string | number;
        unit: string; costPence: number; displayOrder: number;
        inventoryItemId?: string | null;
      }> = resp.data.data ?? [];

      if (productIngredients.length > 0) {
        const invSnap = inventoryRef.current;
        const lines: RecipeLine[] = productIngredients.map((pi, i) => {
          const qty = typeof pi.quantity === 'string' ? parseFloat(pi.quantity) : pi.quantity;
          const unit = pi.unit || 'g';
          // Use the stored inventoryItemId first, fall back to name-match for older rows
          const linkedInvId = pi.inventoryItemId ?? null;
          const invMatch = linkedInvId
            ? invSnap.find((inv) => inv.id === linkedInvId)
            : invSnap.find((inv) => inv.name.toLowerCase() === pi.name.toLowerCase());
          let costPence = pi.costPence || 0;
          if (invMatch) {
            costPence = inventoryLineCostPence(qty || 0, unit, invMatch.unit, invMatch.unitCostPence);
          }
          return {
            inventoryItemId: invMatch?.id ?? linkedInvId ?? null,
            subRecipeId: null,
            ingredientName: pi.name,
            quantity: qty || 0,
            unit,
            costPence,
            wastePct: 0,
            displayOrder: i,
            costManualOverride: false,
          };
        });
        setRecipeLines(lines);
      } else {
        setRecipeLines([]);
      }
    } catch {
      setRecipeLines([]);
    }
    setDirty(true);
  }

  function handleMenuItemClick(menuItem: MenuItem) {
    const existing = recipeForMenuItem(menuItem.id);
    if (existing) {
      void selectRecipe(existing);
    } else {
      void newRecipeForMenuItem(menuItem);
    }
  }

  // ─── Calculations ─────────────────────────────────────────────────────────

  const vatRate = VAT_RATES[recipeVatCountry] ?? 20;

  const totalRawCost = useMemo(() => {
    return recipeLines.reduce((sum, l) => sum + l.costPence, 0);
  }, [recipeLines]);

  const totalAdjustedCost = useMemo(() => {
    return recipeLines.reduce((sum, l) => {
      const waste = l.wastePct / 100;
      return sum + Math.round(l.costPence * (1 + waste));
    }, 0);
  }, [recipeLines]);

  const costPerPortion = recipePortions > 0 ? Math.round(totalAdjustedCost / recipePortions) : 0;

  /** Ex-VAT selling price from chosen method */
  const suggestedSellPenceExVat = useMemo(() => {
    if (costPerPortion <= 0) return 0;
    if (pricingMethod === 'multiplier') {
      const m = parseFloat(costMultiplierStr.replace(',', '.'));
      if (!Number.isFinite(m) || m <= 0) return 0;
      return Math.round(costPerPortion * m);
    }
    const gp = recipeTargetGp;
    if (gp <= 0 || gp >= 100) return 0;
    return Math.round(costPerPortion / (1 - gp / 100));
  }, [costPerPortion, pricingMethod, costMultiplierStr, recipeTargetGp]);

  const suggestedSellWithVat = Math.round(suggestedSellPenceExVat * (1 + vatRate / 100));
  const vatOnSuggested = suggestedSellWithVat - suggestedSellPenceExVat;

  const impliedFoodCostPctOfSell =
    suggestedSellPenceExVat > 0 ? (costPerPortion / suggestedSellPenceExVat) * 100 : 0;
  const impliedMarginPctOfSell =
    suggestedSellPenceExVat > 0 ? ((suggestedSellPenceExVat - costPerPortion) / suggestedSellPenceExVat) * 100 : 0;
  const currentMenuPrice = linkedMenuItem?.currentPrice ?? 0;               // inc VAT (pence)
  const currentMenuPriceExVat = currentMenuPrice > 0
    ? Math.round(currentMenuPrice / (1 + vatRate / 100))
    : 0;
  const actualGp = currentMenuPriceExVat > 0
    ? ((currentMenuPriceExVat - costPerPortion) / currentMenuPriceExVat) * 100
    : 0;
  const menuFoodCostPct =
    currentMenuPriceExVat > 0 ? (costPerPortion / currentMenuPriceExVat) * 100 : null;

  // ─── Line management ─────────────────────────────────────────────────────

  function addLine() {
    setRecipeLines((prev) => [
      ...prev,
      {
        inventoryItemId: null,
        subRecipeId: null,
        ingredientName: '',
        quantity: 0,
        unit: 'g',
        costPence: 0,
        wastePct: 0,
        displayOrder: prev.length,
      },
    ]);
    setDirty(true);
  }

  function updateLine(index: number, patch: Partial<RecipeLine>) {
    setRecipeLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
    setDirty(true);
  }

  const updateLineWithInventoryCost = useCallback((index: number, patch: Partial<RecipeLine>) => {
    setRecipeLines((prev) => {
      const base = prev[index];
      if (!base) return prev;
      const cur: RecipeLine = { ...base, ...patch };
      if (cur.inventoryItemId && !cur.costManualOverride) {
        const inv = inventoryRef.current.find((i) => i.id === cur.inventoryItemId);
        if (inv) {
          cur.costPence = inventoryLineCostPence(cur.quantity, cur.unit, inv.unit, inv.unitCostPence);
        }
      }
      return prev.map((l, i) => (i === index ? cur : l));
    });
    setDirty(true);
  }, []);

  function removeLine(index: number) {
    setRecipeLines((prev) => prev.filter((_, i) => i !== index));
    setDirty(true);
  }

  function linkInventoryItem(index: number, invItem: InventoryItem) {
    const line = recipeLines[index];
    const qty = line && line.quantity > 0 ? line.quantity : 1;
    // Always use the inventory item’s unit of measure so cost/qty align with stock records.
    const unit = invItem.unit?.trim() || 'ea';
    updateLineWithInventoryCost(index, {
      inventoryItemId: invItem.id,
      subRecipeId: null,
      ingredientName: invItem.name,
      unit,
      quantity: qty,
      costManualOverride: false,
    });
  }

  function linkSubRecipe(index: number, sr: SubRecipe) {
    const line = recipeLines[index];
    const qty = line && line.quantity > 0 ? line.quantity : 1;
    const srCost = sr.lines.reduce((s, l) => s + Math.round(l.costPence * (1 + l.wastePct / 100)), 0);
    const perYield = sr.yieldQty > 0 ? srCost / sr.yieldQty : srCost;
    const costPence = Math.round(perYield * qty);
    updateLine(index, {
      inventoryItemId: null,
      subRecipeId: sr.id,
      ingredientName: `[Sub] ${sr.name}`,
      quantity: qty,
      unit: sr.yieldUnit,
      costPence,
      costManualOverride: false,
    });
  }

  // ─── Save recipe ──────────────────────────────────────────────────────────

  async function saveRecipe() {
    if (!venueId || !recipeName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const payload = {
        name: recipeName,
        menuItemId: recipeMenuItemId,
        portions: recipePortions,
        targetGpPct: recipeTargetGp,
        vatRatePct: vatRate,
        notes: recipeNotes || null,
        lines: recipeLines.map((l, i) => ({
          inventoryItemId: l.inventoryItemId || null,
          subRecipeId: l.subRecipeId || null,
          ingredientName: l.ingredientName,
          quantity: l.quantity,
          unit: l.unit,
          costPence: l.costPence,
          wastePct: l.wastePct,
          displayOrder: i,
        })),
      };
      if (selectedRecipeId) {
        await recipeApi.update(venueId, selectedRecipeId, payload);
      } else {
        const resp = await recipeApi.create(venueId, payload);
        setSelectedRecipeId(resp.data.data.id);
      }
      // Invalidate Menu Editor ingredient cache so it reflects the saved lines
      if (recipeMenuItemId) {
        await queryClient.invalidateQueries({ queryKey: ['ingredients', recipeMenuItemId] });
      }
      await loadAll();
      setDirty(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save recipe';
      setSaveError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function publishPrice() {
    if (!venueId || !selectedRecipeId || suggestedSellWithVat <= 0) return;
    try {
      await recipeApi.publish(venueId, selectedRecipeId, suggestedSellWithVat);
      await queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      // Invalidate Menu Editor ingredient cache so it picks up the synced lines
      if (recipeMenuItemId) {
        await queryClient.invalidateQueries({ queryKey: ['ingredients', recipeMenuItemId] });
      }
      await loadAll();
    } catch {
      toast.error('Could not publish price to menu');
    }
  }

  async function saveMenuPriceFromPanel() {
    if (!venueId || !recipeMenuItemId || !linkedMenuItem) return;
    const pence = Math.round((parseFloat(menuPriceDraft.replace(',', '.')) || 0) * 100);
    if (pence < 1) {
      toast.error('Enter a valid menu price');
      return;
    }
    setSavingMenuPrice(true);
    try {
      await menuApi.update(venueId, recipeMenuItemId, { currentPrice: pence, basePrice: pence });
      await queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      toast.success('Menu price saved — matches Menu Editor');
    } catch {
      toast.error('Failed to save menu price');
    } finally {
      setSavingMenuPrice(false);
    }
  }

  async function deleteRecipe() {
    if (!venueId || !selectedRecipeId) return;
    if (!window.confirm('Delete this recipe? The menu dish stays — only the calculator recipe is removed. This cannot be undone.')) return;
    try {
      await recipeApi.remove(venueId, selectedRecipeId);
      setSelectedRecipeId(null);
      setIsEditing(false);
      setRecipeLines([]);
      setRecipeName('');
      setRecipeMenuItemId(null);
      setDirty(false);
      await loadAll();
      await queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      toast.success('Recipe removed from calculator');
    } catch (err) {
      if (axios.isAxiosError(err) && err.response?.data && typeof (err.response.data as { error?: string }).error === 'string') {
        toast.error((err.response.data as { error: string }).error);
      } else {
        toast.error('Failed to delete recipe');
      }
    }
  }

  // ─── Sub-recipe modal handlers ────────────────────────────────────────────

  function openSubRecipeModal(sr?: SubRecipe) {
    if (sr) {
      setEditingSubRecipe(sr);
      setSrName(sr.name);
      setSrYieldQty(sr.yieldQty);
      setSrYieldUnit(sr.yieldUnit);
      setSrNotes(sr.notes ?? '');
      setSrLines(
        sr.lines.map((l, i) => {
          const line = { ...l, displayOrder: i };
          if (!line.inventoryItemId) return line;
          const inv = inventoryRef.current.find((x) => x.id === line.inventoryItemId);
          if (!inv) return line;
          return {
            ...line,
            costPence: inventoryLineCostPence(line.quantity, line.unit, inv.unit, inv.unitCostPence),
          };
        }),
      );
    } else {
      setEditingSubRecipe(null);
      setSrName('');
      setSrYieldQty(1);
      setSrYieldUnit('portion');
      setSrNotes('');
      setSrLines([]);
    }
    setSrError(null);
    setShowSubRecipeModal(true);
  }

  async function saveSubRecipe() {
    if (!venueId || !srName.trim()) return;
    setSrSaving(true);
    setSrError(null);
    try {
      const payload = {
        name: srName,
        yieldQty: srYieldQty,
        yieldUnit: srYieldUnit,
        notes: srNotes || null,
        lines: srLines.map((l, i) => ({
          inventoryItemId: l.inventoryItemId || null,
          ingredientName: l.ingredientName,
          quantity: l.quantity,
          unit: l.unit,
          costPence: l.costPence,
          wastePct: l.wastePct,
          displayOrder: i,
        })),
      };
      if (editingSubRecipe) {
        await recipeApi.updateSubRecipe(venueId, editingSubRecipe.id, payload);
      } else {
        await recipeApi.createSubRecipe(venueId, payload);
      }
      await loadAll();
      setShowSubRecipeModal(false);
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error ?? 'Failed to save sub-recipe';
      setSrError(msg);
    } finally {
      setSrSaving(false);
    }
  }

  async function deleteSubRecipe() {
    if (!venueId || !editingSubRecipe) return;
    if (!window.confirm('Delete this sub-recipe?')) return;
    await recipeApi.removeSubRecipe(venueId, editingSubRecipe.id);
    setShowSubRecipeModal(false);
    await loadAll();
  }

  // ─── Inventory warnings ───────────────────────────────────────────────────

  const inventoryWarnings = useMemo(() => {
    const warnings: Array<{ name: string; status: string }> = [];
    for (const line of recipeLines) {
      if (!line.inventoryItemId) continue;
      const inv = inventory.find((i) => i.id === line.inventoryItemId);
      if (!inv) continue;
      if (inv.onHand <= 0) warnings.push({ name: inv.name, status: 'out' });
      else if (inv.onHand < inv.parLevel) warnings.push({ name: inv.name, status: 'low' });
    }
    return warnings;
  }, [recipeLines, inventory]);

  // ─── Toggle category ──────────────────────────────────────────────────────

  function toggleCategory(name: string) {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  }

  function openAddMenuRecipeModal(cat: MenuCategory) {
    setAddMenuRecipeTarget(cat);
    setAddMenuRecipeName('');
    setAddMenuRecipePriceStr('9.99');
    setShowAddMenuRecipeModal(true);
  }

  async function submitAddMenuRecipe() {
    if (!venueId || !addMenuRecipeTarget || !addMenuRecipeName.trim()) {
      toast.error('Enter a dish name');
      return;
    }
    const pounds = parseFloat(addMenuRecipePriceStr.replace(',', '.'));
    const basePrice = Math.round(
      (Number.isFinite(pounds) && pounds > 0 ? pounds : 9.99) * 100,
    );
    const safeBase = Math.max(1, basePrice);
    const categoryLabel = addMenuRecipeTarget.name;
    setAddMenuRecipeSaving(true);
    try {
      const payload: Record<string, unknown> = {
        name: addMenuRecipeName.trim(),
        category: categoryLabel,
        basePrice: safeBase,
      };
      if (addMenuRecipeTarget.categoryId) {
        payload.categoryId = addMenuRecipeTarget.categoryId;
      }
      const resp = await menuApi.create(venueId, payload);
      const row = resp.data.data as Record<string, unknown>;
      const newItem: MenuItem = {
        id: String(row.id ?? ''),
        name: String(row.name ?? ''),
        category: String(row.category ?? categoryLabel),
        currentPrice: Math.round(Number(row.currentPrice ?? safeBase)),
        categoryId: (row.categoryId as string | undefined) ?? addMenuRecipeTarget.categoryId ?? undefined,
      };
      await queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      setShowAddMenuRecipeModal(false);
      setAddMenuRecipeTarget(null);
      setExpandedCategories((prev) => {
        const next = new Set(prev);
        next.add(categoryLabel);
        return next;
      });
      await loadAll();
      void newRecipeForMenuItem(newItem);
      toast.success('Dish added — build your recipe');
    } catch {
      toast.error('Could not create menu item');
    } finally {
      setAddMenuRecipeSaving(false);
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  if (!venueId) {
    return (
      <AppLayout>
        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">
          Select a venue to use the Recipe Calculator.
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        {/* ─── Header ─────────────────────────────────────────────────────── */}
        <header className="min-h-14 shrink-0 border-b border-border bg-background px-5 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          <ChefHat className="h-5 w-5 text-primary shrink-0" />
          <h1 className="text-sm font-semibold shrink-0">Recipe & Profit Calculator</h1>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
            <label className="sr-only">Menu</label>
            <div className="min-w-0 w-full sm:w-auto sm:max-w-[240px] sm:flex-1">
              <Select
                value={selectedMenuId ?? ''}
                onValueChange={(v) => setSelectedMenuId(v || null)}
                disabled={menus.length === 0}
              >
                <SelectTrigger className="h-8 w-full min-w-[8.5rem] max-w-[240px] text-xs">
                  <SelectValue placeholder={menus.length === 0 ? 'No menus' : 'Menu'} />
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
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 sm:ml-auto">
            <button
              type="button"
              onClick={() => setShowMenuSidebar((v) => !v)}
              className={cn(
                'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                showMenuSidebar
                  ? 'border-border bg-background hover:bg-muted/50'
                  : 'border-primary/35 bg-primary/10 text-primary hover:bg-primary/15',
              )}
              title={showMenuSidebar ? 'Hide menu & recipes sidebar' : 'Show menu & recipes sidebar'}
            >
              <PanelLeft className="h-3.5 w-3.5 shrink-0" />
              <span className="hidden sm:inline">Menu</span>
            </button>
            {isEditing && (
              <button
                type="button"
                onClick={() => setShowCostsPanel((v) => !v)}
                className={cn(
                  'flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors',
                  showCostsPanel
                    ? 'border-border bg-background hover:bg-muted/50'
                    : 'border-primary/35 bg-primary/10 text-primary hover:bg-primary/15',
                )}
                title={showCostsPanel ? 'Hide recipe costs panel' : 'Show recipe costs panel'}
              >
                <PanelRight className="h-3.5 w-3.5 shrink-0" />
                <span className="hidden sm:inline">Costs</span>
              </button>
            )}
            <button
              onClick={() => openSubRecipeModal()}
              className="h-8 px-3 text-xs font-medium rounded-md border border-border hover:bg-muted/50 flex items-center gap-1.5 transition-colors"
            >
              <Beaker className="h-3.5 w-3.5" />
              Sub-Recipes ({subRecipes.length})
            </button>
            {dirty && (
              <button
                onClick={saveRecipe}
                disabled={saving}
                className="h-8 px-3 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary/90 flex items-center gap-1.5 transition-colors disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? 'Saving...' : 'Save Recipe'}
              </button>
            )}
          </div>
        </header>

        {loading || menuLoading ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Loading recipes...
          </div>
        ) : (
          <div className="flex-1 flex min-h-0 overflow-hidden">
            {/* ─── LEFT: Menu Tree Sidebar (collapsible) ─────────────────── */}
            {showMenuSidebar ? (
            <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-muted/20">
              <div className="flex items-center justify-between gap-1 border-b border-border px-2 py-1.5">
                <span className="truncate pl-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Menu & recipes
                </span>
                <button
                  type="button"
                  onClick={() => setShowMenuSidebar(false)}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  title="Hide sidebar"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
              </div>
              <div className="border-b border-border p-3">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <input
                    className="h-8 w-full rounded-md border border-border bg-background pl-8 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
                    placeholder="Search menu items..."
                    value={sidebarSearch}
                    onChange={(e) => setSidebarSearch(e.target.value)}
                  />
                </div>
                {selectedMenuId && categoriesFetched && menuCategories.length === 0 && (
                  <p className="text-[10px] text-muted-foreground px-3 pt-2 leading-snug">
                    This menu has no categories yet. Add categories and products in the Menu Editor.
                  </p>
                )}
                {selectedMenuId && menuCategories.length > 0 && filteredTree.length === 0 && !sidebarSearch.trim() && (
                  <p className="text-[10px] text-muted-foreground px-3 pt-2 leading-snug">
                    No items linked to this menu&apos;s categories. Assign each product to a category in the Menu Editor.
                  </p>
                )}
              </div>
              <div className="flex-1 overflow-y-auto">
                {filteredTree.map((cat) => (
                  <div key={cat.name}>
                    <div className="flex w-full items-stretch">
                      <button
                        type="button"
                        onClick={() => toggleCategory(cat.name)}
                        className="min-w-0 flex flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
                      >
                        {expandedCategories.has(cat.name) ? (
                          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                        ) : (
                          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                        )}
                        <span className="truncate">{cat.name}</span>
                        <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
                          {cat.items.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          openAddMenuRecipeModal(cat);
                        }}
                        className="shrink-0 px-2.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                        title={`Add dish to ${cat.name}`}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    {expandedCategories.has(cat.name) && cat.items.map((item) => {
                      const hasRecipe = !!recipeForMenuItem(item.id);
                      const isActive = recipeMenuItemId === item.id;
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleMenuItemClick(item)}
                          className={cn(
                            'w-full text-left pl-8 pr-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2',
                            isActive && 'bg-primary/10 text-primary font-medium',
                          )}
                        >
                          <span className="truncate flex-1">{item.name}</span>
                          {hasRecipe && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                ))}
                {filteredTree.length === 0 && (
                  <p className="text-xs text-muted-foreground p-4 text-center">No menu items found.</p>
                )}

                {/* Sub-recipes section */}
                <div className="border-t border-border mt-2">
                  <div className="flex w-full items-stretch">
                    <button
                      type="button"
                      onClick={() => toggleCategory('__subrecipes')}
                      className="min-w-0 flex flex-1 items-center gap-1.5 px-3 py-2 text-left text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors"
                    >
                      {expandedCategories.has('__subrecipes') ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                      )}
                      <Layers className="h-3 w-3 shrink-0" />
                      <span className="truncate">Sub-Recipes</span>
                      <span className="ml-auto shrink-0 text-[10px] text-muted-foreground/60 tabular-nums">
                        {subRecipes.length}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedCategories((prev) => {
                          const next = new Set(prev);
                          next.add('__subrecipes');
                          return next;
                        });
                        openSubRecipeModal();
                      }}
                      className="shrink-0 px-2.5 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                      title="New sub-recipe"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  {expandedCategories.has('__subrecipes') && (
                    <>
                      {subRecipes.length === 0 && (
                        <p className="pl-8 pr-3 py-1.5 text-[11px] text-muted-foreground/60 italic">No sub-recipes yet.</p>
                      )}
                      {subRecipes.map((sr) => (
                        <button
                          key={sr.id}
                          onClick={() => openSubRecipeModal(sr)}
                          className="w-full text-left pl-8 pr-3 py-1.5 text-xs hover:bg-muted/50 transition-colors flex items-center gap-2"
                        >
                          <span className="truncate flex-1">{sr.name}</span>
                          <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
                            {sr.yieldQty} {sr.yieldUnit}
                          </span>
                        </button>
                      ))}
                      <button
                        onClick={() => openSubRecipeModal()}
                        className="w-full text-left pl-8 pr-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:bg-muted/50 transition-colors flex items-center gap-1.5"
                      >
                        <Plus className="h-3 w-3 shrink-0" />
                        New sub-recipe
                      </button>
                    </>
                  )}
                </div>
              </div>
            </aside>
            ) : (
              <div className="flex w-10 shrink-0 flex-col border-r border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setShowMenuSidebar(true)}
                  className="flex flex-col items-center gap-2 border-b border-border py-3 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title="Show menu & recipes"
                >
                  <ChevronRight className="h-4 w-4 shrink-0" />
                  <span className="text-[9px] font-semibold uppercase leading-tight text-muted-foreground [writing-mode:vertical-rl]">
                    Menu
                  </span>
                </button>
              </div>
            )}

            {/* ─── CENTER: Recipe Builder (basis-0 + min-w so table gets remaining width) ─ */}
            <main className="flex min-h-0 min-w-0 flex-1 basis-0 flex-col overflow-hidden">
              {!isEditing ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-3 text-muted-foreground">
                  <Calculator className="h-12 w-12 opacity-30" />
                  <p className="text-sm">Select a menu item or add a dish to a category</p>
                  <p className="max-w-sm px-4 text-center text-xs opacity-60">
                    {showMenuSidebar
                      ? 'Click an item, or use + next to a category to add a dish and open its recipe.'
                      : 'Use the Menu button in the top bar (or the narrow strip on the left) to open categories and add dishes.'}
                  </p>
                </div>
              ) : (
                <>
                  {/* Recipe header form */}
                  <div className="border-b border-border px-5 py-3 bg-background flex flex-wrap items-center gap-3">
                    <input
                      className="h-8 text-sm font-semibold bg-transparent border-b border-transparent hover:border-border focus:border-primary focus:outline-none w-56 transition-colors"
                      placeholder="Recipe name"
                      value={recipeName}
                      onChange={(e) => { setRecipeName(e.target.value); setDirty(true); }}
                    />
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span>Portions:</span>
                      <input
                        type="number"
                        min={1}
                        className="w-14 h-7 text-xs text-center border rounded-md bg-background"
                        value={recipePortions}
                        onChange={(e) => { setRecipePortions(Math.max(1, +e.target.value || 1)); setDirty(true); }}
                      />
                    </div>
                    {linkedMenuItem && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Package className="h-3 w-3" />
                        Linked: {linkedMenuItem.name} ({fmt(linkedMenuItem.currentPrice)})
                      </span>
                    )}
                    <div className="ml-auto flex items-center gap-2">
                      {selectedRecipeId && (
                        <button onClick={deleteRecipe} className="h-7 px-2 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Inventory warnings */}
                  {inventoryWarnings.length > 0 && (
                    <div className="border-b border-amber-200 bg-amber-50 px-5 py-2 flex items-center gap-2 text-xs text-amber-700">
                      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        Stock warning: {inventoryWarnings.map((w) => (
                          <span key={w.name} className={cn('font-medium', w.status === 'out' ? 'text-red-600' : 'text-amber-700')}>
                            {w.name} ({w.status === 'out' ? 'OUT' : 'LOW'})
                          </span>
                        )).reduce<React.ReactNode[]>((acc, el, i) => (i === 0 ? [el] : [...acc, ', ', el]), [])}
                      </span>
                    </div>
                  )}

                  {/* Ingredient table + optional fullscreen popup (shared state) */}
                  <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
                    <div className="flex shrink-0 items-center justify-between gap-3 px-4 pb-2 pt-3">
                      <h2 className="text-sm font-semibold text-foreground">Ingredients</h2>
                      <button
                        type="button"
                        onClick={() => setIngredientTableModalOpen(true)}
                        className="inline-flex h-8 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                        title="Open ingredients in a large window"
                      >
                        <Maximize2 className="h-3.5 w-3.5" />
                        Maximize table
                      </button>
                    </div>
                    <div className="min-h-0 flex-1 overflow-auto px-4 pb-2">
                      <RecipeIngredientsTable
                        recipeLines={recipeLines}
                        inventory={inventory}
                        subRecipes={subRecipes}
                        updateLine={updateLine}
                        updateLineWithInventoryCost={updateLineWithInventoryCost}
                        linkInventoryItem={linkInventoryItem}
                        linkSubRecipe={linkSubRecipe}
                        removeLine={removeLine}
                        addLine={addLine}
                      />
                    </div>
                  </div>

                  {ingredientTableModalOpen && (
                    <div
                      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-3 sm:p-6"
                      role="dialog"
                      aria-modal="true"
                      aria-labelledby="recipe-ingredients-modal-title"
                      onClick={() => setIngredientTableModalOpen(false)}
                    >
                      <div
                        className="flex max-h-[calc(100vh-1.5rem)] w-full max-w-[min(100%,1400px)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-2xl sm:max-h-[calc(100vh-3rem)]"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
                          <div className="min-w-0">
                            <h2 id="recipe-ingredients-modal-title" className="text-sm font-semibold text-foreground">
                              Ingredients
                            </h2>
                            <p className="truncate text-xs text-muted-foreground">{recipeName || 'Recipe'}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setIngredientTableModalOpen(false)}
                            className="inline-flex h-9 shrink-0 items-center gap-2 rounded-md border border-border bg-background px-3 text-xs font-medium transition-colors hover:bg-muted"
                          >
                            <X className="h-4 w-4" />
                            Close
                          </button>
                        </div>
                        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-5">
                          <RecipeIngredientsTable
                            recipeLines={recipeLines}
                            inventory={inventory}
                            subRecipes={subRecipes}
                            updateLine={updateLine}
                            updateLineWithInventoryCost={updateLineWithInventoryCost}
                            linkInventoryItem={linkInventoryItem}
                            linkSubRecipe={linkSubRecipe}
                            removeLine={removeLine}
                            addLine={addLine}
                            tableMinWidthClass="w-full min-w-[1000px]"
                            tableWrapperClassName="rounded-lg border border-border bg-card shadow-sm"
                            addButtonBarClassName="shrink-0 border-t border-border bg-muted/20 px-4 py-3"
                            selectInElevatedLayer
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}
            </main>

            {/* ─── RIGHT: Cost & Profit Panel (collapsible) ───────────────── */}
            {isEditing && showCostsPanel && (
              <aside className="flex h-full min-h-0 w-[min(100%,380px)] min-w-[272px] max-w-[40vw] shrink-0 flex-col border-l border-border bg-muted/15 shadow-[-8px_0_24px_-16px_rgba(0,0,0,0.12)]">
                <div className="flex shrink-0 items-center justify-end border-b border-border bg-background px-2 py-1.5">
                  <button
                    type="button"
                    onClick={() => setShowCostsPanel(false)}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Hide recipe costs"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
                {/* Recipe costs — fixed height feel, easy to scan */}
                <div className="shrink-0 border-b border-border bg-background px-5 py-5">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-sm font-semibold tracking-tight text-foreground">Recipe costs</h2>
                    {selectedRecipeId && (
                      <button
                        type="button"
                        onClick={() => void deleteRecipe()}
                        className="shrink-0 text-xs font-medium text-red-600 hover:text-red-700 hover:underline"
                      >
                        Delete recipe
                      </button>
                    )}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    Line totals + waste, then divided by portions (see centre column).
                  </p>
                  <div className="mt-4 space-y-3 rounded-xl border border-border bg-card px-4 py-4 shadow-sm">
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">Sum of line costs</span>
                      <span className="font-medium tabular-nums text-foreground">{fmt(totalRawCost)}</span>
                    </div>
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="text-muted-foreground">+ Waste on lines</span>
                      <span className="font-medium tabular-nums text-foreground">{fmt(Math.max(0, totalAdjustedCost - totalRawCost))}</span>
                    </div>
                    <div className="h-px bg-border" />
                    <div className="flex justify-between gap-4 text-sm">
                      <span className="font-semibold text-foreground">Total recipe cost</span>
                      <span className="font-semibold tabular-nums text-foreground">{fmt(totalAdjustedCost)}</span>
                    </div>
                    <div className="flex justify-between gap-4 border-t border-dashed border-border pt-3 text-sm">
                      <span className="text-muted-foreground">÷ Portions ({recipePortions})</span>
                      <span className="text-base font-bold tabular-nums text-foreground">{fmt(costPerPortion)}</span>
                    </div>
                  </div>
                </div>

                {/* Pricing + menu compare — scrolls independently */}
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5">
                  <div className="space-y-6">
                    <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground">
                        <Percent className="h-4 w-4 text-muted-foreground" />
                        Suggested selling price
                      </h2>
                      <p className="mt-1 text-xs text-muted-foreground">Choose margin % or a cost multiplier — one applies at a time.</p>
                      <details className="group mt-2">
                        <summary className="cursor-pointer list-none text-xs font-medium text-primary hover:underline [&::-webkit-details-marker]:hidden">
                          <span className="inline-flex items-center gap-1">
                            How margin vs multiplier differs
                            <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
                          </span>
                        </summary>
                        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                          <span className="font-medium text-foreground/90">Margin %</span> is the share of the sell price you keep after food cost (higher slider → higher price).
                          {' '}
                          <span className="font-medium text-foreground/90">Multiplier</span> sets sell (ex VAT) = cost per portion × factor (e.g. £0.30 × 2 = £0.60).
                        </p>
                      </details>

                      <div className="mt-4 space-y-3">
                        <label className="flex cursor-pointer gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted/40 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/[0.06]">
                          <input
                            type="radio"
                            name="pricingMethod"
                            className="mt-1"
                            checked={pricingMethod === 'gp'}
                            onChange={() => setPricingMethod('gp')}
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-foreground">Gross margin %</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">Profit share of selling price after food cost</span>
                          </span>
                        </label>
                        <label className="flex cursor-pointer gap-3 rounded-xl border border-border p-3.5 transition-colors hover:bg-muted/40 has-[:checked]:border-primary/40 has-[:checked]:bg-primary/[0.06]">
                          <input
                            type="radio"
                            name="pricingMethod"
                            className="mt-1"
                            checked={pricingMethod === 'multiplier'}
                            onChange={() => setPricingMethod('multiplier')}
                          />
                          <span className="min-w-0">
                            <span className="text-sm font-medium text-foreground">Cost × multiplier</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">Sell (ex VAT) = food cost per portion × your factor</span>
                          </span>
                        </label>
                      </div>

                      {pricingMethod === 'gp' ? (
                        <div className="mt-5">
                          <div className="flex items-center justify-between gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Target gross margin
                            </label>
                            <span className="text-sm font-bold tabular-nums text-foreground">
                              {Math.min(90, Math.max(5, recipeTargetGp))}%
                            </span>
                          </div>
                          <input
                            type="range"
                            min={5}
                            max={90}
                            step={1}
                            className="mt-3 h-2 w-full cursor-pointer accent-primary"
                            value={Math.min(90, Math.max(5, recipeTargetGp))}
                            onChange={(e) => {
                              setRecipeTargetGp(+e.target.value);
                              setDirty(true);
                            }}
                          />
                          <p className="mt-2 text-xs text-muted-foreground">
                            Food cost ≈{' '}
                            {impliedFoodCostPctOfSell > 0 ? `${impliedFoodCostPctOfSell.toFixed(1)}%` : '—'} of suggested sell (ex VAT)
                          </p>
                        </div>
                      ) : (
                        <div className="mt-5">
                          <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Multiplier</label>
                          <div className="mt-2 flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">×</span>
                            <input
                              type="number"
                              min={0.01}
                              step={0.1}
                              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm tabular-nums"
                              value={costMultiplierStr}
                              onChange={(e) => setCostMultiplierStr(e.target.value)}
                            />
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            Implied margin on sell ≈ {impliedMarginPctOfSell > 0 ? `${impliedMarginPctOfSell.toFixed(1)}%` : '—'}
                          </p>
                        </div>
                      )}

                      <div className="mt-5">
                        <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">VAT</label>
                        <Select
                          value={recipeVatCountry}
                          onValueChange={(v) => { setRecipeVatCountry(v); setDirty(true); }}
                        >
                          <SelectTrigger className="mt-2 h-9 w-full text-sm">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {Object.entries(VAT_RATES).map(([code, rate]) => (
                              <SelectItem key={code} value={code}>
                                {code} — {rate}%
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="mt-5 space-y-2 border-t border-border pt-5 text-sm">
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">Sell (ex VAT)</span>
                          <span className="font-medium tabular-nums">
                            {costPerPortion > 0 && suggestedSellPenceExVat > 0 ? fmt(suggestedSellPenceExVat) : '—'}
                          </span>
                        </div>
                        <div className="flex justify-between gap-3">
                          <span className="text-muted-foreground">+ VAT ({vatRate}%)</span>
                          <span className="font-medium tabular-nums">{suggestedSellPenceExVat > 0 ? fmt(vatOnSuggested) : '—'}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary/10 px-4 py-3.5 ring-1 ring-primary/20">
                          <div>
                            <div className="text-xs font-medium text-primary">Suggested (inc. VAT)</div>
                            <div className="text-xl font-bold tabular-nums text-primary">
                              {suggestedSellWithVat > 0 ? fmt(suggestedSellWithVat) : '—'}
                            </div>
                          </div>
                          <PoundSterling className="h-7 w-7 shrink-0 text-primary/35" />
                        </div>
                      </div>
                    </section>

                    {linkedMenuItem && (
                      <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                        <h3 className="text-sm font-semibold text-foreground">Menu price</h3>
                        <p className="mt-1 text-xs text-muted-foreground">Synced with Menu Editor — save here or there.</p>
                        <div className="mt-3 flex gap-2">
                          <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">£</span>
                            <input
                              type="text"
                              inputMode="decimal"
                              className="h-9 w-full rounded-md border border-input bg-background pl-7 pr-3 text-sm tabular-nums"
                              value={menuPriceDraft}
                              onChange={(e) => setMenuPriceDraft(e.target.value)}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() => void saveMenuPriceFromPanel()}
                            disabled={savingMenuPrice}
                            className="h-9 shrink-0 rounded-md border border-border bg-secondary px-3 text-xs font-medium hover:bg-muted disabled:opacity-50"
                          >
                            {savingMenuPrice ? '…' : 'Save'}
                          </button>
                        </div>
                        <div className="mt-4 space-y-2 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm">
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Inc. VAT (menu)</span>
                            <span className="font-medium tabular-nums">{fmt(currentMenuPrice)}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Ex. VAT</span>
                            <span className="font-medium tabular-nums">{fmt(currentMenuPriceExVat)}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Food cost % of sell</span>
                            <span className="font-medium tabular-nums">{menuFoodCostPct != null ? `${menuFoodCostPct.toFixed(1)}%` : '—'}</span>
                          </div>
                          <div className="flex justify-between gap-2">
                            <span className="text-muted-foreground">Gross profit (ex VAT)</span>
                            <span className="font-medium tabular-nums">{fmt(currentMenuPriceExVat - costPerPortion)}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                            <span className="text-muted-foreground">Actual GP %</span>
                            <span
                              className={cn(
                                'text-base font-bold tabular-nums',
                                actualGp < 0
                                  ? 'text-red-600'
                                  : pricingMethod === 'gp' && actualGp < Math.min(90, Math.max(5, recipeTargetGp))
                                    ? 'text-amber-600'
                                    : 'text-emerald-600',
                              )}
                            >
                              {Number.isFinite(actualGp) ? `${actualGp.toFixed(1)}%` : '—'}
                            </span>
                          </div>
                        </div>
                        {pricingMethod === 'gp' && actualGp < recipeTargetGp && actualGp > -500 && suggestedSellWithVat > 0 && (
                          <p className="mt-3 text-xs text-amber-700 dark:text-amber-500/90">
                            Under {recipeTargetGp}% margin at this menu price — suggested inc. VAT {fmt(suggestedSellWithVat)} or raise £ above.
                          </p>
                        )}
                      </section>
                    )}

                    <section className="rounded-xl border border-border bg-background p-4 shadow-sm">
                      <label className="text-sm font-semibold text-foreground">Notes</label>
                      <textarea
                        rows={4}
                        className="mt-2 w-full resize-none rounded-md border border-input bg-background p-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                        placeholder="Method notes, plating, tips..."
                        value={recipeNotes}
                        onChange={(e) => { setRecipeNotes(e.target.value); setDirty(true); }}
                      />
                    </section>
                  </div>
                </div>

                {/* Sticky actions — always visible */}
                <div className="shrink-0 space-y-2 border-t border-border bg-background px-5 py-4">
                  {saveError && (
                    <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{saveError}</p>
                  )}
                  {dirty ? (
                    <button
                      type="button"
                      onClick={saveRecipe}
                      disabled={saving}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      <Save className="h-4 w-4" />
                      {saving ? 'Saving…' : 'Save recipe'}
                    </button>
                  ) : (
                    <div className="flex h-10 items-center justify-center rounded-lg border border-dashed border-border/70 bg-muted/20 text-xs text-muted-foreground">
                      No unsaved changes
                    </div>
                  )}
                  {selectedRecipeId && linkedMenuItem && suggestedSellWithVat > 0 && (
                    <button
                      type="button"
                      onClick={publishPrice}
                      className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-primary text-sm font-medium text-primary transition-colors hover:bg-primary/5"
                    >
                      <Upload className="h-4 w-4" />
                      Publish {fmt(suggestedSellWithVat)} to menu
                    </button>
                  )}
                </div>
              </aside>
            )}
            {isEditing && !showCostsPanel && (
              <div className="flex w-10 shrink-0 flex-col border-l border-border bg-muted/20">
                <button
                  type="button"
                  onClick={() => setShowCostsPanel(true)}
                  className="flex flex-col items-center gap-2 border-b border-border py-3 text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                  title="Show recipe costs"
                >
                  <ChevronLeft className="h-4 w-4 shrink-0" />
                  <span className="text-[9px] font-semibold uppercase leading-tight text-muted-foreground [writing-mode:vertical-rl]">
                    Costs
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ─── Add dish to category (creates menu item + opens recipe) ─────────── */}
      {showAddMenuRecipeModal && addMenuRecipeTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !addMenuRecipeSaving && setShowAddMenuRecipeModal(false)}
        >
          <div
            className="bg-background border border-border rounded-xl shadow-xl w-full max-w-md flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Plus className="h-4 w-4 text-primary" />
                Add dish — {addMenuRecipeTarget.name}
              </h2>
              <button
                type="button"
                disabled={addMenuRecipeSaving}
                onClick={() => setShowAddMenuRecipeModal(false)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Dish name
                </label>
                <input
                  className="mt-1 w-full h-9 text-sm border rounded-md bg-background px-3"
                  value={addMenuRecipeName}
                  onChange={(e) => setAddMenuRecipeName(e.target.value)}
                  placeholder="e.g. Sausage, carrots & mash"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">
                  Menu price (inc. VAT, placeholder)
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">£</span>
                  <input
                    className="flex-1 h-9 text-sm border rounded-md bg-background px-3 tabular-nums"
                    value={addMenuRecipePriceStr}
                    onChange={(e) => setAddMenuRecipePriceStr(e.target.value.replace(/[^0-9.,]/g, ''))}
                    placeholder="9.99"
                    inputMode="decimal"
                  />
                </div>
                <p className="mt-1.5 text-[11px] text-muted-foreground leading-snug">
                  Creates the product on your menu in this category, then opens the recipe builder. You can refine the price later in the panel or Menu Editor.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  disabled={addMenuRecipeSaving}
                  onClick={() => setShowAddMenuRecipeModal(false)}
                  className="h-9 px-3 text-xs font-medium rounded-md border border-border hover:bg-muted/50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={addMenuRecipeSaving || !addMenuRecipeName.trim()}
                  onClick={() => void submitAddMenuRecipe()}
                  className="h-9 px-3 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  {addMenuRecipeSaving ? 'Creating…' : 'Create & build recipe'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Sub-Recipe Modal ──────────────────────────────────────────────── */}
      {showSubRecipeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowSubRecipeModal(false)}>
          <div className="bg-background border border-border rounded-xl shadow-xl w-[min(96vw,780px)] max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-3 border-b border-border">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <Layers className="h-4 w-4 text-primary" />
                {editingSubRecipe ? 'Edit Sub-Recipe' : 'New Sub-Recipe'}
              </h2>
              <button onClick={() => setShowSubRecipeModal(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex-1 overflow-auto p-5 space-y-4">
              {/* List existing sub-recipes to select */}
              {!editingSubRecipe && subRecipes.length > 0 && (
                <div className="space-y-1.5">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Existing Sub-Recipes</label>
                  <div className="grid grid-cols-2 gap-2">
                    {subRecipes.map((sr) => (
                      <button
                        key={sr.id}
                        onClick={() => openSubRecipeModal(sr)}
                        className="text-left p-2 rounded-md border border-border hover:border-primary/40 hover:bg-primary/5 text-xs transition-colors"
                      >
                        <div className="font-medium">{sr.name}</div>
                        <div className="text-muted-foreground">
                          {sr.lines.length} ingredients · Yields {sr.yieldQty} {sr.yieldUnit}
                        </div>
                      </button>
                    ))}
                  </div>
                  <div className="h-px bg-border my-2" />
                </div>
              )}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Name</label>
                  <input
                    className="mt-1 w-full h-8 text-xs border rounded-md bg-background px-2"
                    value={srName}
                    onChange={(e) => setSrName(e.target.value)}
                    placeholder="e.g. Pizza Dough Base"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Yield Qty</label>
                  <RecipeModalDecimalInput
                    value={srYieldQty}
                    min={0}
                    onCommit={(n) => setSrYieldQty(n > 0 ? n : 1)}
                    className="mt-1 w-full h-9 text-sm border rounded-md bg-background px-2.5 tabular-nums"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Yield Unit</label>
                  <Select value={srYieldUnit} onValueChange={setSrYieldUnit}>
                    <SelectTrigger className="mt-1 h-9 w-full text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[200] max-h-48">
                      {UNITS.map((u) => (
                        <SelectItem key={u} value={u}>{u}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Ingredients</label>
                <table className="w-full text-xs mt-1 table-fixed [&_td]:align-top">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-[28%]">Name</th>
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-[26%]">Source</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground w-[12%]">Qty</th>
                      <th className="text-left py-2 pr-2 font-medium text-muted-foreground w-[12%]">Unit</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground w-[12%]">Cost</th>
                      <th className="text-right py-2 pr-2 font-medium text-muted-foreground w-[8%]">Waste%</th>
                      <th className="w-8 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {srLines.map((line, idx) => {
                      const srInv = line.inventoryItemId
                        ? inventory.find((i) => i.id === line.inventoryItemId)
                        : undefined;
                      const { compatible: srCompat, other: srOther } = groupedUnitOptions(line.inventoryItemId, line.unit, inventory);
                      return (
                      <tr key={idx} className="border-b border-border/40">
                        <td className="py-2 pr-2 align-middle">
                          <input
                            className="w-full min-w-0 h-9 text-sm border border-transparent rounded-md bg-background px-2 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                            value={line.ingredientName}
                            onChange={(e) => {
                              const next = [...srLines];
                              next[idx] = { ...next[idx], ingredientName: e.target.value };
                              setSrLines(next);
                            }}
                          />
                        </td>
                        <td className="py-2 pr-2 align-middle min-w-0">
                          <Select
                            value={line.inventoryItemId ?? SRC_MANUAL}
                            onValueChange={(val) => {
                              const next = [...srLines];
                              const cur = next[idx];
                              if (val === SRC_MANUAL) {
                                next[idx] = { ...cur, inventoryItemId: null };
                              } else {
                                const inv = inventory.find((i) => i.id === val);
                                if (inv) {
                                  const qty = cur.quantity > 0 ? cur.quantity : 1;
                                  const unit = inv.unit?.trim() || 'ea';
                                  next[idx] = {
                                    ...cur,
                                    inventoryItemId: inv.id,
                                    ingredientName: inv.name,
                                    unit,
                                    quantity: qty,
                                    costPence: inventoryLineCostPence(qty, unit, inv.unit, inv.unitCostPence),
                                  };
                                }
                              }
                              setSrLines(next);
                            }}
                          >
                            <SelectTrigger className="h-9 w-full min-w-0 border border-input bg-background text-xs px-2 shadow-sm hover:bg-muted/40">
                              <SelectValue placeholder="Manual" />
                            </SelectTrigger>
                            <SelectContent className="z-[200] max-h-60">
                              <SelectItem value={SRC_MANUAL}>Manual</SelectItem>
                              {inventory.map((inv) => (
                                <SelectItem key={inv.id} value={inv.id}>{inv.name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                        <td className="py-2 pr-2 align-middle">
                          <RecipeModalDecimalInput
                            value={line.quantity}
                            min={0}
                            onCommit={(qty) => {
                              const next = [...srLines];
                              const cur = next[idx];
                              if (cur.inventoryItemId) {
                                const inv = inventory.find((i) => i.id === cur.inventoryItemId);
                                const costPence = inv
                                  ? inventoryLineCostPence(qty, cur.unit, inv.unit, inv.unitCostPence)
                                  : cur.costPence;
                                next[idx] = { ...cur, quantity: qty, costPence };
                              } else {
                                next[idx] = { ...cur, quantity: qty };
                              }
                              setSrLines(next);
                            }}
                            className="w-full h-9 text-sm text-right tabular-nums border rounded-md bg-background px-2 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-2 pr-2 align-middle">
                          <div className="flex min-w-0 flex-col gap-0.5">
                            <Select
                              value={line.unit}
                              onValueChange={(u) => {
                                const next = [...srLines];
                                const cur = next[idx];
                                if (cur.inventoryItemId) {
                                  const inv = inventory.find((i) => i.id === cur.inventoryItemId);
                                  const costPence = inv
                                    ? inventoryLineCostPence(cur.quantity, u, inv.unit, inv.unitCostPence)
                                    : cur.costPence;
                                  next[idx] = { ...cur, unit: u, costPence };
                                } else {
                                  next[idx] = { ...cur, unit: u };
                                }
                                setSrLines(next);
                              }}
                            >
                              <SelectTrigger className="h-9 w-full border border-input bg-background text-xs px-2 shadow-sm hover:bg-muted/40">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="z-[200] max-h-56">
                                {srInv && srCompat.length > 0 ? (
                                  <>
                                    <SelectGroup>
                                      <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                        {srInv.unit} family
                                      </SelectLabel>
                                      {srCompat.map((u) => (
                                        <SelectItem key={u} value={u}>
                                          {u === srInv.unit?.trim() ? `${u} · stock` : u}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                    {srOther.length > 0 && (
                                      <>
                                        <SelectSeparator />
                                        <SelectGroup>
                                          <SelectLabel className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                                            Other
                                          </SelectLabel>
                                          {srOther.map((u) => (
                                            <SelectItem key={u} value={u}>{u}</SelectItem>
                                          ))}
                                        </SelectGroup>
                                      </>
                                    )}
                                  </>
                                ) : (
                                  [...srCompat, ...srOther].map((u) => (
                                    <SelectItem key={u} value={u}>{u}</SelectItem>
                                  ))
                                )}
                              </SelectContent>
                            </Select>
                            {srInv && (() => {
                              const hint = conversionHint(line.quantity, line.unit, srInv.unit, srInv.unitCostPence);
                              return (
                                <p className="text-[10px] leading-tight text-muted-foreground">
                                  {hint
                                    ? <span className="text-amber-700 dark:text-amber-500">{hint}</span>
                                    : <>Priced per <span className="font-medium text-foreground">{srInv.unit}</span></>
                                  }
                                </p>
                              );
                            })()}
                          </div>
                        </td>
                        <td className="py-2 pr-2">
                          <div className={cn(
                            'flex h-9 w-full items-center gap-1 rounded-md border px-2',
                            line.inventoryItemId && srInv
                              ? 'border-border bg-muted/25'
                              : 'border-input bg-background shadow-sm focus-within:border-primary/40 focus-within:ring-1 focus-within:ring-primary/20',
                          )}>
                            <span className="shrink-0 text-xs text-muted-foreground">£</span>
                            {line.inventoryItemId && srInv ? (
                              <span className="w-full text-right text-sm tabular-nums opacity-70">
                                {(line.costPence / 100).toFixed(2)}
                              </span>
                            ) : (
                              <RecipeTablePoundsInput
                                pence={line.costPence}
                                className="min-w-0 w-full bg-transparent text-right text-sm tabular-nums focus:outline-none"
                                onCommitPence={(costPence) => {
                                  const next = [...srLines];
                                  next[idx] = { ...next[idx], costPence };
                                  setSrLines(next);
                                }}
                              />
                            )}
                          </div>
                          {line.inventoryItemId && srInv && (
                            <p className="mt-0.5 text-right text-[9px] text-muted-foreground">auto</p>
                          )}
                        </td>
                        <td className="py-2 pr-2 align-middle">
                          <RecipeModalDecimalInput
                            value={line.wastePct}
                            min={0}
                            max={100}
                            emptyZero={false}
                            onCommit={(wastePct) => {
                              const next = [...srLines];
                              next[idx] = { ...next[idx], wastePct };
                              setSrLines(next);
                            }}
                            className="w-full h-9 text-sm text-right tabular-nums border rounded-md bg-background px-2 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/20"
                          />
                        </td>
                        <td className="py-2 align-middle">
                          <button type="button" onClick={() => setSrLines((p) => p.filter((_, i) => i !== idx))} className="text-muted-foreground hover:text-red-500 p-1 rounded-md hover:bg-muted">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                      );
                    })}
                  </tbody>
                </table>
                <button
                  type="button"
                  onClick={() => setSrLines((prev) => [...prev, { ingredientName: '', quantity: 1, unit: 'g', costPence: 0, wastePct: 0, displayOrder: prev.length }])}
                  className="mt-2 h-7 px-3 text-xs rounded border border-dashed border-border hover:border-primary/40 hover:bg-primary/5 flex items-center gap-1 transition-colors"
                >
                  <Plus className="h-3 w-3" /> Add Ingredient
                </button>
              </div>
              <div>
                <label className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Notes</label>
                <textarea
                  rows={2}
                  className="mt-1 w-full text-xs border rounded-md bg-background p-2 resize-none"
                  value={srNotes}
                  onChange={(e) => setSrNotes(e.target.value)}
                />
              </div>
              {/* Sub-recipe cost summary */}
              <div className="rounded-lg bg-muted/30 border border-border p-3 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Total sub-recipe cost</span>
                <span className="font-semibold">{fmt(srLines.reduce((s, l) => s + Math.round(l.costPence * (1 + l.wastePct / 100)), 0))}</span>
              </div>
            </div>
            <div className="flex flex-col gap-2 px-5 py-3 border-t border-border">
              {srError && (
                <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{srError}</p>
              )}
              <div className="flex items-center gap-2">
                {editingSubRecipe && (
                  <button onClick={deleteSubRecipe} className="h-8 px-3 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors mr-auto">
                    Delete
                  </button>
                )}
                <div className="ml-auto flex gap-2">
                  <button onClick={() => setShowSubRecipeModal(false)} className="h-8 px-4 text-xs rounded-md border border-border hover:bg-muted/50 transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={saveSubRecipe}
                    disabled={srSaving || !srName.trim()}
                    className="h-8 px-4 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {srSaving ? 'Saving...' : editingSubRecipe ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
