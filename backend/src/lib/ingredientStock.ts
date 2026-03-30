import { getPool } from '../db';
import { UNIT_CONVERT_SQL } from './unitConversion';

export type IngredientStockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

/**
 * Same aggregation as POS menu: bottleneck ingredient (min servings left) sets status.
 * Only products with at least one product_ingredient row linked to inventory appear in the map.
 * Uses unit conversion so recipe quantities in g/ml are correctly compared to inventory in kg/l.
 */
export async function getMenuItemIngredientStockMap(venueId: string): Promise<Map<string, IngredientStockStatus>> {
  const pool = getPool();
  const stockResult = await pool.query(
    `SELECT
       pi.product_id AS menu_item_id,
       CASE
         WHEN MIN(ii.on_hand::numeric / NULLIF(${UNIT_CONVERT_SQL}, 0)) <= 0 THEN 'out_of_stock'
         WHEN MIN(ii.on_hand::numeric / NULLIF(${UNIT_CONVERT_SQL}, 0)) <= 5 THEN 'low_stock'
         ELSE 'in_stock'
       END AS stock_status
     FROM product_ingredients pi
     JOIN inventory_items ii ON ii.id = pi.inventory_item_id
     WHERE (pi.venue_id = $1 OR pi.venue_id IS NULL)
       AND pi.inventory_item_id IS NOT NULL
     GROUP BY pi.product_id`,
    [venueId],
  );
  return new Map(
    stockResult.rows.map((r: { menu_item_id: string; stock_status: string }) => [
      r.menu_item_id,
      r.stock_status as IngredientStockStatus,
    ]),
  );
}
