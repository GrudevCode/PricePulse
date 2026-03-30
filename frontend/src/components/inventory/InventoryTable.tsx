import { cn } from '@/lib/utils';
import { Package, AlertTriangle, CheckCircle2, ArrowUpRight, ArrowDownRight } from 'lucide-react';

export type StockStatus = 'low' | 'ok' | 'high';

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  onHand: number;
  parLevel: number;
  unit: string;
  unitCostPence: number;
  status: StockStatus;
  velocityPerNight: number;
}

const STATUS_BADGE: Record<StockStatus, { label: string; cls: string }> = {
  low: {
    label: 'Below par',
    cls: 'bg-red-50 text-red-600 border-red-200',
  },
  ok: {
    label: 'Healthy',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  },
  high: {
    label: 'Overstocked',
    cls: 'bg-blue-50 text-blue-600 border-blue-200',
  },
};

function formatPence(v: number) {
  return `£${(v / 100).toFixed(2)}`;
}

interface InventoryTableProps {
  items: InventoryItem[];
  selectedId: string | null;
  onSelect: (item: InventoryItem) => void;
}

export function InventoryTable({ items, selectedId, onSelect }: InventoryTableProps) {
  const totalValue = items.reduce((sum, i) => sum + i.unitCostPence * i.onHand, 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-background">
        <span className="text-xs text-muted-foreground/60 flex items-center gap-2">
          <Package className="h-3.5 w-3.5" />
          <span>
            {items.length} SKU{items.length !== 1 ? 's' : ''}{' · '}
            <span className="text-emerald-600">
              {items.filter(i => i.status === 'ok').length} healthy
            </span>
            {' · '}
            <span className="text-red-500">
              {items.filter(i => i.status === 'low').length} below par
            </span>
            {' · '}
            <span className="text-blue-600">
              {items.filter(i => i.status === 'high').length} overstocked
            </span>
          </span>
        </span>
        <div className="ml-auto text-xs text-muted-foreground/60">
          Stock value:{' '}
          <span className="font-semibold text-foreground">{formatPence(totalValue)}</span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-2 px-4">Item</th>
              <th className="text-left font-medium py-2 px-3 hidden sm:table-cell">Category</th>
              <th className="text-center font-medium py-2 px-3 hidden sm:table-cell">Unit</th>
              <th className="text-center font-medium py-2 px-3">On hand</th>
              <th className="text-center font-medium py-2 px-3">Par</th>
              <th className="text-center font-medium py-2 px-3 hidden md:table-cell">Nightly usage</th>
              <th className="text-right font-medium py-2 px-3 hidden lg:table-cell">Unit cost</th>
              <th className="text-right font-medium py-2 px-3 hidden lg:table-cell">Value</th>
              <th className="text-center font-medium py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const badge = STATUS_BADGE[item.status];
              const isSelected = selectedId === item.id;
              const value = item.unitCostPence * item.onHand;
              const ratio = item.parLevel > 0 ? item.onHand / item.parLevel : 0;
              const DeltaIcon =
                ratio > 1.2 ? ArrowUpRight : ratio < 0.8 ? ArrowDownRight : null;

              return (
                <tr
                  key={item.id}
                  onClick={() => onSelect(item)}
                  className={cn(
                    'border-b border-border/50 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary/8 border-l-2 border-l-primary'
                      : item.status === 'low'
                        ? 'bg-red-50/50 hover:bg-red-50'
                        : item.status === 'high'
                          ? 'bg-blue-50/50 hover:bg-blue-50'
                          : 'hover:bg-secondary/30'
                  )}
                >
                  <td className="py-2.5 px-4 text-foreground">
                    <div className="font-semibold">{item.name}</div>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell text-muted-foreground/70">
                    {item.category}
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell text-center text-muted-foreground/80 tabular-nums">
                    {item.unit}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-foreground">
                    {item.onHand}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                    {item.parLevel}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground hidden md:table-cell">
                    {item.velocityPerNight.toFixed(1)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-muted-foreground hidden lg:table-cell">
                    {formatPence(item.unitCostPence)}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums text-foreground hidden lg:table-cell">
                    {formatPence(value)}
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                        badge.cls
                      )}
                    >
                      {item.status === 'ok' ? (
                        <CheckCircle2 className="h-3 w-3" />
                      ) : (
                        <AlertTriangle className="h-3 w-3" />
                      )}
                      {badge.label}
                      {DeltaIcon && (
                        <DeltaIcon className="h-3 w-3" />
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

