/**
 * Convert recipe line quantity + unit to a cost in pence using inventory
 * `unit_cost_pence` for one `inventory.unit` (e.g. £/kg × 0.25 kg for 250g).
 */

function norm(u: string): string {
  return u.trim().toLowerCase().replace(/\.$/, '');
}

/** Map free-text / legacy labels to recipe canonical units (g, kg, ml, l, …). */
function canonicalMassUnit(u: string): string {
  const n = norm(u);
  const aliases: Record<string, string> = {
    gram: 'g',
    grams: 'g',
    gms: 'g',
    gm: 'g',
    kilogram: 'kg',
    kilograms: 'kg',
    kilo: 'kg',
    kgs: 'kg',
    ounce: 'oz',
    ounces: 'oz',
    pound: 'lb',
    pounds: 'lb',
    lbs: 'lb',
  };
  return aliases[n] ?? n;
}

function canonicalVolumeUnit(u: string): string {
  const n = norm(u);
  const aliases: Record<string, string> = {
    millilitre: 'ml',
    milliliter: 'ml',
    millilitres: 'ml',
    milliliters: 'ml',
    mls: 'ml',
    cc: 'ml',
    litre: 'l',
    liter: 'l',
    litres: 'l',
    liters: 'l',
    teaspoon: 'tsp',
    teaspoons: 'tsp',
    tablespoon: 'tbsp',
    tablespoons: 'tbsp',
    cups: 'cup',
  };
  return aliases[n] ?? n;
}

/** Amount of `unit` expressed in grams, or null if not a mass unit. */
function toGrams(amount: number, unitRaw: string): number | null {
  const u = canonicalMassUnit(unitRaw);
  const m: Record<string, number> = {
    g: 1,
    kg: 1000,
    oz: 28.349523125,
    lb: 453.59237,
  };
  const f = m[u];
  return f != null ? amount * f : null;
}

/** Amount of `unit` expressed in ml, or null if not a volume unit. */
function toMl(amount: number, unitRaw: string): number | null {
  const u = canonicalVolumeUnit(unitRaw);
  const m: Record<string, number> = {
    ml: 1,
    l: 1000,
    tsp: 4.92892,
    tbsp: 14.7868,
    cup: 236.588,
  };
  const f = m[u];
  return f != null ? amount * f : null;
}

export type InventoryCostResult =
  | { ok: true; costPence: number }
  | { ok: false; reason: string };

/**
 * `unitCostPence` = price for exactly one `inventoryUnit` (e.g. per 1 kg).
 * `recipeQuantity` + `recipeUnit` = how much the recipe uses (e.g. 250 g).
 */
export function inventoryCostForRecipeLine(
  recipeQuantity: number,
  recipeUnitRaw: string,
  inventoryUnitRaw: string,
  unitCostPence: number,
): InventoryCostResult {
  if (!Number.isFinite(recipeQuantity) || recipeQuantity < 0) {
    return { ok: true, costPence: 0 };
  }
  if (!Number.isFinite(unitCostPence) || unitCostPence < 0) {
    return { ok: true, costPence: 0 };
  }

  const ru = canonicalMassUnit(recipeUnitRaw);
  const ruVol = canonicalVolumeUnit(recipeUnitRaw);
  const iu = canonicalMassUnit(inventoryUnitRaw);
  const iuVol = canonicalVolumeUnit(inventoryUnitRaw);

  if (ru === iu || ruVol === iuVol) {
    return { ok: true, costPence: Math.round(unitCostPence * recipeQuantity) };
  }

  const rG = toGrams(recipeQuantity, recipeUnitRaw);
  const invG = toGrams(1, inventoryUnitRaw);
  if (rG !== null && invG !== null && invG > 0) {
    const qtyInInvUnits = rG / invG;
    return { ok: true, costPence: Math.round(unitCostPence * qtyInInvUnits) };
  }

  const rMl = toMl(recipeQuantity, recipeUnitRaw);
  const invMl = toMl(1, inventoryUnitRaw);
  if (rMl !== null && invMl !== null && invMl > 0) {
    const qtyInInvUnits = rMl / invMl;
    return { ok: true, costPence: Math.round(unitCostPence * qtyInInvUnits) };
  }

  const COUNT = new Set(['ea', 'portion']);
  const rCount = norm(recipeUnitRaw);
  const iCount = norm(inventoryUnitRaw);
  if (COUNT.has(rCount) && COUNT.has(iCount)) {
    return { ok: true, costPence: Math.round(unitCostPence * recipeQuantity) };
  }

  return {
    ok: false,
    reason: `No automatic conversion between “${recipeUnitRaw.trim() || recipeUnitRaw}” and inventory unit “${inventoryUnitRaw.trim() || inventoryUnitRaw}”.`,
  };
}

/**
 * Pence for this recipe line from inventory pricing. Uses full unit conversion when possible;
 * otherwise falls back to `unitCostPence * recipeQuantity` (same as naive “per line unit”).
 */
export function inventoryLineCostPence(
  recipeQuantity: number,
  recipeUnitRaw: string,
  inventoryUnitRaw: string,
  unitCostPence: number,
): number {
  const r = inventoryCostForRecipeLine(recipeQuantity, recipeUnitRaw, inventoryUnitRaw, unitCostPence);
  if (r.ok) return r.costPence;
  return Math.round(unitCostPence * recipeQuantity);
}

// ─── Unit family helpers ──────────────────────────────────────────────────────

export type UnitFamily = 'mass' | 'volume' | 'count' | 'other';

const MASS_UNITS_ORDERED   = ['g', 'kg', 'oz', 'lb'] as const;
const VOLUME_UNITS_ORDERED = ['ml', 'l', 'tsp', 'tbsp', 'cup'] as const;
const COUNT_UNITS_ORDERED  = ['ea', 'portion'] as const;

const MASS_SET   = new Set<string>(MASS_UNITS_ORDERED);
const VOLUME_SET = new Set<string>(VOLUME_UNITS_ORDERED);
const COUNT_SET  = new Set<string>(COUNT_UNITS_ORDERED);

/** Which family a unit belongs to. */
export function unitFamily(unitRaw: string): UnitFamily {
  if (MASS_SET.has(canonicalMassUnit(unitRaw)))       return 'mass';
  if (VOLUME_SET.has(canonicalVolumeUnit(unitRaw)))    return 'volume';
  if (COUNT_SET.has(norm(unitRaw)))                    return 'count';
  return 'other';
}

/**
 * All canonical units that can be converted to/from `inventoryUnitRaw`
 * (i.e. same measurement family). Returns empty array for custom units.
 */
export function compatibleUnitsFor(inventoryUnitRaw: string): string[] {
  const fam = unitFamily(inventoryUnitRaw);
  if (fam === 'mass')   return [...MASS_UNITS_ORDERED];
  if (fam === 'volume') return [...VOLUME_UNITS_ORDERED];
  if (fam === 'count')  return [...COUNT_UNITS_ORDERED];
  return [];
}

/**
 * Human-readable conversion hint for a recipe line, e.g.
 *   “30 ml = 0.030 l · £10.00/l → £0.30”
 * Returns null when no conversion is needed (same unit) or not possible.
 */
export function conversionHint(
  qty: number,
  recipeUnit: string,
  inventoryUnit: string,
  unitCostPence: number,
): string | null {
  if (!qty || !recipeUnit?.trim() || !inventoryUnit?.trim()) return null;
  if (recipeUnit.trim().toLowerCase() === inventoryUnit.trim().toLowerCase()) return null;

  const pricePerInv = unitCostPence / 100;
  const fmtQty = (n: number) =>
    n === Math.round(n) ? String(n) : n < 0.01 ? n.toFixed(4) : n < 1 ? n.toFixed(3) : n.toFixed(2).replace(/\.?0+$/, '');

  const rG = toGrams(qty, recipeUnit);
  const iG = toGrams(1, inventoryUnit);
  if (rG !== null && iG !== null && iG > 0) {
    const ratio = rG / iG;
    return `${qty} ${recipeUnit} = ${fmtQty(ratio)} ${inventoryUnit} · £${pricePerInv.toFixed(2)}/${inventoryUnit} → £${(pricePerInv * ratio).toFixed(2)}`;
  }

  const rMl = toMl(qty, recipeUnit);
  const iMl = toMl(1, inventoryUnit);
  if (rMl !== null && iMl !== null && iMl > 0) {
    const ratio = rMl / iMl;
    return `${qty} ${recipeUnit} = ${fmtQty(ratio)} ${inventoryUnit} · £${pricePerInv.toFixed(2)}/${inventoryUnit} → £${(pricePerInv * ratio).toFixed(2)}`;
  }

  return null;
}
