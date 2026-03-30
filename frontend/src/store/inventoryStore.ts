import { create } from 'zustand';
import type { InventoryItem, StockStatus } from '@/components/inventory/InventoryTable';

// ── Helpers ───────────────────────────────────────────────────────────────────

export function deriveStatus(onHand: number, parLevel: number): StockStatus {
  if (parLevel === 0) return 'ok';
  const ratio = onHand / parLevel;
  if (ratio < 0.8)  return 'low';
  if (ratio > 1.2)  return 'high';
  return 'ok';
}

// ── Store ──────────────────────────────────────────────────────────────────────

interface InventoryState {
  items: InventoryItem[];
  setItems: (items: InventoryItem[]) => void;
  updateItem: (updated: InventoryItem) => void;
  addItem:    (item: InventoryItem)    => void;
  deleteItem: (id: string)             => void;
}

export const useInventoryStore = create<InventoryState>()((set) => ({
  items: [],

  setItems: (items) => set({ items }),

  updateItem: (updated) =>
    set((state) => ({
      items: state.items.map((i) => i.id === updated.id ? updated : i),
    })),

  addItem: (item) =>
    set((state) => ({ items: [...state.items, item] })),

  deleteItem: (id) =>
    set((state) => ({ items: state.items.filter((i) => i.id !== id) })),
}));
