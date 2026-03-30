import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { formatPence, timeAgo, cn } from '@/lib/utils';
import { Plus, Trash2, Zap, Lock } from 'lucide-react';

interface MenuItem {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  isDynamicPricingEnabled: boolean;
  isAvailable: boolean;
  lastUpdatedAt: string;
  description?: string;
}

interface MenuPanelProps {
  venueId: string;
}

export function MenuPanel({ venueId }: MenuPanelProps) {
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newItem, setNewItem] = useState({
    name: '', category: 'Drinks', basePrice: '', minPrice: '', maxPrice: '', description: '',
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['menu-items', venueId],
    queryFn: () => menuApi.list(venueId).then((r) => r.data.data),
    enabled: !!venueId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => menuApi.create(venueId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      setShowAddForm(false);
      setNewItem({ name: '', category: 'Drinks', basePrice: '', minPrice: '', maxPrice: '', description: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      menuApi.update(venueId, itemId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => menuApi.delete(venueId, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] }),
  });

  const grouped: Record<string, MenuItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    const basePrice = Math.round(parseFloat(newItem.basePrice) * 100);
    createMutation.mutate({
      name: newItem.name,
      category: newItem.category,
      basePrice,
      minPrice: newItem.minPrice ? Math.round(parseFloat(newItem.minPrice) * 100) : Math.round(basePrice * 0.8),
      maxPrice: newItem.maxPrice ? Math.round(parseFloat(newItem.maxPrice) * 100) : Math.round(basePrice * 1.5),
      description: newItem.description || undefined,
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-background">
        <span className="text-xs text-muted-foreground/60">
          {items.length} item{items.length !== 1 ? 's' : ''}
          {' · '}
          {items.filter((i: { isDynamicPricingEnabled: boolean }) => i.isDynamicPricingEnabled).length} dynamic
        </span>
        <div className="flex-1" />
        <Button
          size="sm"
          variant={showAddForm ? 'secondary' : 'outline'}
          className="h-7 text-xs gap-1.5"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add item
        </Button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="shrink-0 px-4 py-3 border-b border-border bg-secondary/30">
          <form onSubmit={handleAdd} className="flex flex-wrap gap-2 items-end">
            <Input
              placeholder="Name *"
              value={newItem.name}
              onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
              className="h-7 text-xs w-36"
              required
              autoFocus
            />
            <Input
              placeholder="Category"
              value={newItem.category}
              onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
              className="h-7 text-xs w-28"
            />
            <Input
              placeholder="Base £ *"
              type="number" step="0.01" min="0.01"
              value={newItem.basePrice}
              onChange={(e) => setNewItem({ ...newItem, basePrice: e.target.value })}
              className="h-7 text-xs w-24"
              required
            />
            <Input
              placeholder="Min £"
              type="number" step="0.01"
              value={newItem.minPrice}
              onChange={(e) => setNewItem({ ...newItem, minPrice: e.target.value })}
              className="h-7 text-xs w-20"
            />
            <Input
              placeholder="Max £"
              type="number" step="0.01"
              value={newItem.maxPrice}
              onChange={(e) => setNewItem({ ...newItem, maxPrice: e.target.value })}
              className="h-7 text-xs w-20"
            />
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Adding…' : 'Add'}
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setShowAddForm(false)}>
              Cancel
            </Button>
          </form>
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-24 text-xs text-muted-foreground">Loading…</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-24 gap-2">
            <p className="text-xs text-muted-foreground">No menu items yet</p>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowAddForm(true)}>
              <Plus className="h-3.5 w-3.5" /> Add first item
            </Button>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-background border-b border-border">
              <tr className="text-muted-foreground">
                <th className="text-left font-medium py-2 px-4 w-[35%]">Item</th>
                <th className="text-right font-medium py-2 px-3">Base</th>
                <th className="text-right font-medium py-2 px-3">Current</th>
                <th className="text-right font-medium py-2 px-3 hidden sm:table-cell">Min</th>
                <th className="text-right font-medium py-2 px-3 hidden sm:table-cell">Max</th>
                <th className="text-center font-medium py-2 px-3">Dynamic</th>
                <th className="text-right font-medium py-2 px-3 hidden md:table-cell">Updated</th>
                <th className="py-2 px-3 w-8" />
              </tr>
            </thead>
            <tbody>
              {Object.entries(grouped).map(([cat, catItems]) => (
                <>
                  <tr key={`cat-${cat}`} className="bg-secondary/40 border-y border-border">
                    <td colSpan={8} className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {cat} ({catItems.length})
                    </td>
                  </tr>
                  {catItems.map((item) => (
                    <tr key={item.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors">
                      <td className="py-2 px-4">
                        <span className="font-medium text-foreground">{item.name}</span>
                        {item.description && (
                          <span className="text-muted-foreground/50 ml-1.5 truncate hidden lg:inline">— {item.description}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground font-mono tabular-nums">
                        {formatPence(item.basePrice)}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <span className={cn(
                          'font-bold font-mono tabular-nums',
                          item.currentPrice > item.basePrice ? 'text-emerald-600' :
                          item.currentPrice < item.basePrice ? 'text-red-500' : 'text-foreground'
                        )}>
                          {formatPence(item.currentPrice)}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground/50 font-mono tabular-nums hidden sm:table-cell">
                        {formatPence(item.minPrice)}
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground/50 font-mono tabular-nums hidden sm:table-cell">
                        {formatPence(item.maxPrice)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Switch
                          checked={item.isDynamicPricingEnabled}
                          onCheckedChange={() => updateMutation.mutate({
                            itemId: item.id,
                            data: { isDynamicPricingEnabled: !item.isDynamicPricingEnabled },
                          })}
                          className="scale-75"
                        />
                      </td>
                      <td className="py-2 px-3 text-right text-muted-foreground/40 hidden md:table-cell">
                        {timeAgo(item.lastUpdatedAt)}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={() => deleteMutation.mutate(item.id)}
                          className="text-muted-foreground/30 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
