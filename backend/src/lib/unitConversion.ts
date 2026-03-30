/**
 * Unit conversion utilities for inventory deduction and stock checks.
 * Mirrors frontend/src/lib/recipeInventoryCost.ts — keep in sync.
 */

function norm(u: string): string {
  return u.trim().toLowerCase().replace(/\.$/, '');
}

const MASS_ALIASES: Record<string, string> = {
  gram: 'g', grams: 'g', gms: 'g', gm: 'g',
  kilogram: 'kg', kilograms: 'kg', kilo: 'kg', kgs: 'kg',
  ounce: 'oz', ounces: 'oz',
  pound: 'lb', pounds: 'lb', lbs: 'lb',
};

const VOLUME_ALIASES: Record<string, string> = {
  millilitre: 'ml', milliliter: 'ml', millilitres: 'ml', milliliters: 'ml', mls: 'ml', cc: 'ml',
  litre: 'l', liter: 'l', litres: 'l', liters: 'l',
  teaspoon: 'tsp', teaspoons: 'tsp',
  tablespoon: 'tbsp', tablespoons: 'tbsp',
  cups: 'cup',
};

const MASS_G: Record<string, number> = { g: 1, kg: 1000, oz: 28.349523125, lb: 453.59237 };
const VOLUME_ML: Record<string, number> = { ml: 1, l: 1000, tsp: 4.92892, tbsp: 14.7868, cup: 236.588 };

function toGrams(qty: number, unitRaw: string): number | null {
  const u = MASS_ALIASES[norm(unitRaw)] ?? norm(unitRaw);
  const f = MASS_G[u];
  return f != null ? qty * f : null;
}

function toMl(qty: number, unitRaw: string): number | null {
  const u = VOLUME_ALIASES[norm(unitRaw)] ?? norm(unitRaw);
  const f = VOLUME_ML[u];
  return f != null ? qty * f : null;
}

/**
 * Convert `recipeQty` expressed in `recipeUnit` to the equivalent quantity in `inventoryUnit`.
 * Returns the original `recipeQty` if the units are the same or if no conversion is possible
 * (incompatible families / custom units) so callers always get a usable number.
 *
 * Examples:
 *   convertToInventoryUnit(100, 'g',  'kg') → 0.1
 *   convertToInventoryUnit(200, 'ml', 'l')  → 0.2
 *   convertToInventoryUnit(500, 'g',  'kg') → 0.5
 *   convertToInventoryUnit(30,  'ml', 'l')  → 0.03
 */
export function convertToInventoryUnit(
  recipeQty: number,
  recipeUnitRaw: string,
  inventoryUnitRaw: string,
): number {
  if (!recipeUnitRaw || !inventoryUnitRaw) return recipeQty;

  const ru  = MASS_ALIASES[norm(recipeUnitRaw)]    ?? norm(recipeUnitRaw);
  const iu  = MASS_ALIASES[norm(inventoryUnitRaw)] ?? norm(inventoryUnitRaw);
  const ruV = VOLUME_ALIASES[norm(recipeUnitRaw)]    ?? norm(recipeUnitRaw);
  const iuV = VOLUME_ALIASES[norm(inventoryUnitRaw)] ?? norm(inventoryUnitRaw);

  // Already the same canonical unit
  if (ru === iu || ruV === iuV) return recipeQty;

  // Mass family (g / kg / oz / lb)
  const rG = toGrams(recipeQty, recipeUnitRaw);
  const iG = toGrams(1, inventoryUnitRaw);
  if (rG !== null && iG !== null && iG > 0) return rG / iG;

  // Volume family (ml / l / tsp / tbsp / cup)
  const rMl = toMl(recipeQty, recipeUnitRaw);
  const iMl = toMl(1, inventoryUnitRaw);
  if (rMl !== null && iMl !== null && iMl > 0) return rMl / iMl;

  // Count units (ea / portion) — same family, treat as direct
  const COUNT = new Set(['ea', 'portion']);
  if (COUNT.has(norm(recipeUnitRaw)) && COUNT.has(norm(inventoryUnitRaw))) return recipeQty;

  // Incompatible families (e.g. g vs l) — return as-is, caller logs warning
  return recipeQty;
}

/**
 * Inline SQL CASE expression that converts a recipe ingredient quantity
 * (COALESCE(pi.quantity_per_unit, pi.quantity, 1) in pi.unit)
 * into the equivalent quantity in the linked inventory item's unit (ii.unit).
 *
 * Drop this directly into any SQL aggregate, e.g.:
 *   MIN(ii.on_hand::numeric / NULLIF(${UNIT_CONVERT_SQL}, 0))
 *
 * Requires the query to JOIN product_ingredients pi and inventory_items ii.
 */
export const UNIT_CONVERT_SQL = `
CASE
  -- Mass family: g / kg / oz / lb
  WHEN (CASE lower(trim(pi.unit))
          WHEN 'g' THEN 1 WHEN 'kg' THEN 1000
          WHEN 'oz' THEN 28.3495 WHEN 'lb' THEN 453.592
          ELSE NULL END) IS NOT NULL
   AND (CASE lower(trim(ii.unit))
          WHEN 'g' THEN 1 WHEN 'kg' THEN 1000
          WHEN 'oz' THEN 28.3495 WHEN 'lb' THEN 453.592
          ELSE NULL END) IS NOT NULL
  THEN COALESCE(pi.quantity_per_unit, pi.quantity, 1)
       * (CASE lower(trim(pi.unit)) WHEN 'g' THEN 1 WHEN 'kg' THEN 1000 WHEN 'oz' THEN 28.3495 WHEN 'lb' THEN 453.592 ELSE 1 END)
       / (CASE lower(trim(ii.unit)) WHEN 'g' THEN 1 WHEN 'kg' THEN 1000 WHEN 'oz' THEN 28.3495 WHEN 'lb' THEN 453.592 ELSE 1 END)
  -- Volume family: ml / l / tsp / tbsp / cup
  WHEN (CASE lower(trim(pi.unit))
          WHEN 'ml' THEN 1 WHEN 'l' THEN 1000
          WHEN 'tsp' THEN 4.92892 WHEN 'tbsp' THEN 14.7868 WHEN 'cup' THEN 236.588
          ELSE NULL END) IS NOT NULL
   AND (CASE lower(trim(ii.unit))
          WHEN 'ml' THEN 1 WHEN 'l' THEN 1000
          WHEN 'tsp' THEN 4.92892 WHEN 'tbsp' THEN 14.7868 WHEN 'cup' THEN 236.588
          ELSE NULL END) IS NOT NULL
  THEN COALESCE(pi.quantity_per_unit, pi.quantity, 1)
       * (CASE lower(trim(pi.unit)) WHEN 'ml' THEN 1 WHEN 'l' THEN 1000 WHEN 'tsp' THEN 4.92892 WHEN 'tbsp' THEN 14.7868 WHEN 'cup' THEN 236.588 ELSE 1 END)
       / (CASE lower(trim(ii.unit)) WHEN 'ml' THEN 1 WHEN 'l' THEN 1000 WHEN 'tsp' THEN 4.92892 WHEN 'tbsp' THEN 14.7868 WHEN 'cup' THEN 236.588 ELSE 1 END)
  -- Fallback: same unit assumed (count / custom / unknown)
  ELSE COALESCE(pi.quantity_per_unit, pi.quantity, 1)
END`.trim();
