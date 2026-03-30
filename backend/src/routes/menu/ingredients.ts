import { Router, Response } from 'express';
import { z } from 'zod';
import { getDb, schema } from '../../db';
import { requireAuth, AuthRequest } from '../../middleware/auth';
import { eq, and, asc } from 'drizzle-orm';

const router = Router({ mergeParams: true });

const ingredientSchema = z.object({
  name:            z.string().min(1).max(255),
  quantity:        z.number().positive(),
  unit:            z.string().min(1).max(50),
  costPence:       z.number().int().min(0),
  displayOrder:    z.number().int().default(0),
  inventoryItemId: z.string().uuid().nullable().optional(),
});

// Verify the product belongs to the authenticated user's venue
async function requireProductAccess(req: AuthRequest, res: Response): Promise<boolean> {
  const db = getDb();
  const item = await db.query.menuItems.findFirst({
    where: eq(schema.menuItems.id, req.params.itemId),
    with: { venue: true } as never,
  });
  const anyItem = item as (typeof item & { venue?: { userId?: string } }) | undefined;
  if (!anyItem || anyItem.venue?.userId !== req.userId) {
    res.status(404).json({ success: false, error: 'Product not found' });
    return false;
  }
  return true;
}

// GET /api/menu-items/:itemId/ingredients
router.get('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!await requireProductAccess(req, res)) return;
    const db = getDb();
    const ingredients = await db.query.productIngredients.findMany({
      where: eq(schema.productIngredients.productId, req.params.itemId),
      orderBy: [asc(schema.productIngredients.displayOrder), asc(schema.productIngredients.createdAt)],
    });
    res.json({ success: true, data: ingredients });
  } catch (err) {
    console.error('[Ingredients] List error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch ingredients' });
  }
});

// POST /api/menu-items/:itemId/ingredients
router.post('/', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!await requireProductAccess(req, res)) return;
    const parsed = ingredientSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const d = parsed.data;
    const [ing] = await db.insert(schema.productIngredients)
      .values({
        productId: req.params.itemId,
        name: d.name,
        quantity: String(d.quantity),
        unit: d.unit,
        costPence: d.costPence,
        displayOrder: d.displayOrder,
        inventoryItemId: d.inventoryItemId ?? null,
      })
      .returning();
    res.status(201).json({ success: true, data: ing });
  } catch (err) {
    console.error('[Ingredients] Create error:', err);
    res.status(500).json({ success: false, error: 'Failed to create ingredient' });
  }
});

// PATCH /api/menu-items/:itemId/ingredients/:ingId
router.patch('/:ingId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!await requireProductAccess(req, res)) return;
    const parsed = ingredientSchema.partial().safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ success: false, error: parsed.error.errors[0].message });
      return;
    }
    const db = getDb();
    const patch = parsed.data;
    const setData: {
      updatedAt: Date;
      name?: string;
      displayOrder?: number;
      unit?: string;
      costPence?: number;
      inventoryItemId?: string | null;
      quantity?: string;
    } = { updatedAt: new Date() };
    if (patch.name !== undefined) setData.name = patch.name;
    if (patch.displayOrder !== undefined) setData.displayOrder = patch.displayOrder;
    if (patch.unit !== undefined) setData.unit = patch.unit;
    if (patch.costPence !== undefined) setData.costPence = patch.costPence;
    if (patch.inventoryItemId !== undefined) setData.inventoryItemId = patch.inventoryItemId;
    if (patch.quantity !== undefined) setData.quantity = String(patch.quantity);

    const [ing] = await db.update(schema.productIngredients)
      .set(setData)
      .where(and(
        eq(schema.productIngredients.id, req.params.ingId),
        eq(schema.productIngredients.productId, req.params.itemId),
      ))
      .returning();
    if (!ing) { res.status(404).json({ success: false, error: 'Ingredient not found' }); return; }
    res.json({ success: true, data: ing });
  } catch (err) {
    console.error('[Ingredients] Update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update ingredient' });
  }
});

// DELETE /api/menu-items/:itemId/ingredients/:ingId
router.delete('/:ingId', requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!await requireProductAccess(req, res)) return;
    const db = getDb();
    await db.delete(schema.productIngredients)
      .where(and(
        eq(schema.productIngredients.id, req.params.ingId),
        eq(schema.productIngredients.productId, req.params.itemId),
      ));
    res.json({ success: true });
  } catch (err) {
    console.error('[Ingredients] Delete error:', err);
    res.status(500).json({ success: false, error: 'Failed to delete ingredient' });
  }
});

export default router;
