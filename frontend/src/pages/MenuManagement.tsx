import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { menuApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatPence, timeAgo, cn } from '@/lib/utils';
import { Plus, Trash2, Save, RefreshCw } from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';

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

export default function MenuManagement() {
  const { id: venueId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newItem, setNewItem] = useState({
    name: '', category: 'Drinks', basePrice: '', minPrice: '', maxPrice: '', description: '',
  });

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['menu-items', venueId],
    queryFn: () => menuApi.list(venueId!).then((r) => r.data.data),
    enabled: !!venueId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => menuApi.create(venueId!, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      setShowAddForm(false);
      setNewItem({ name: '', category: 'Drinks', basePrice: '', minPrice: '', maxPrice: '', description: '' });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ itemId, data }: { itemId: string; data: Record<string, unknown> }) =>
      menuApi.update(venueId!, itemId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] });
      setEditingId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (itemId: string) => menuApi.delete(venueId!, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['menu-items', venueId] }),
  });

  // Group by category
  const grouped: Record<string, MenuItem[]> = {};
  for (const item of items) {
    if (!grouped[item.category]) grouped[item.category] = [];
    grouped[item.category].push(item);
  }

  const handleAddItem = (e: React.FormEvent) => {
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

  const toggleDynamic = (item: MenuItem) => {
    updateMutation.mutate({
      itemId: item.id,
      data: { isDynamicPricingEnabled: !item.isDynamicPricingEnabled },
    });
  };

  return (
    <AppLayout>
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-border/50 px-6 py-4 flex items-center gap-4">
        <h1 className="text-lg font-semibold">Menu Management</h1>
        <div className="flex-1" />
        <Button onClick={() => setShowAddForm(!showAddForm)} size="sm" className="gap-2">
          <Plus className="h-4 w-4" />
          Add Item
        </Button>
      </header>

      <div className="max-w-5xl mx-auto p-6 space-y-6">
        {/* Add item form */}
        {showAddForm && (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium">New Menu Item</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddItem} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div className="col-span-2 sm:col-span-1">
                  <Input
                    placeholder="Item name *"
                    value={newItem.name}
                    onChange={(e) => setNewItem({ ...newItem, name: e.target.value })}
                    required
                    autoFocus
                  />
                </div>
                <div>
                  <Input
                    placeholder="Category *"
                    value={newItem.category}
                    onChange={(e) => setNewItem({ ...newItem, category: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    placeholder="Base price £ *"
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={newItem.basePrice}
                    onChange={(e) => setNewItem({ ...newItem, basePrice: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <Input
                    placeholder="Min price £ (80%)"
                    type="number"
                    step="0.01"
                    value={newItem.minPrice}
                    onChange={(e) => setNewItem({ ...newItem, minPrice: e.target.value })}
                  />
                </div>
                <div>
                  <Input
                    placeholder="Max price £ (150%)"
                    type="number"
                    step="0.01"
                    value={newItem.maxPrice}
                    onChange={(e) => setNewItem({ ...newItem, maxPrice: e.target.value })}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3">
                  <Input
                    placeholder="Description (optional)"
                    value={newItem.description}
                    onChange={(e) => setNewItem({ ...newItem, description: e.target.value })}
                  />
                </div>
                <div className="col-span-2 sm:col-span-3 flex gap-2">
                  <Button type="submit" size="sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Adding...' : 'Add Item'}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowAddForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground">Loading menu items...</div>
        ) : items.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-muted-foreground mb-4">No menu items yet</p>
            <Button onClick={() => setShowAddForm(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Add your first item
            </Button>
          </div>
        ) : (
          Object.entries(grouped).map(([category, catItems]) => (
            <Card key={category} className="border-border/50">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                  {category} ({catItems.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50 bg-secondary/20">
                      <th className="text-left py-2.5 px-4 text-xs font-medium text-muted-foreground">Name</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">Base</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground">Current</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground hidden sm:table-cell">Min</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground hidden sm:table-cell">Max</th>
                      <th className="text-center py-2.5 px-4 text-xs font-medium text-muted-foreground">Dynamic</th>
                      <th className="text-right py-2.5 px-4 text-xs font-medium text-muted-foreground hidden md:table-cell">Updated</th>
                      <th className="py-2.5 px-4 w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {catItems.map((item) => (
                      <tr key={item.id} className="border-b border-border/30 hover:bg-secondary/20 transition-colors">
                        <td className="py-3 px-4">
                          <div className="text-sm font-medium">{item.name}</div>
                          {item.description && (
                            <div className="text-xs text-muted-foreground truncate max-w-xs">{item.description}</div>
                          )}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground text-right">
                          {formatPence(item.basePrice)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={cn(
                            'text-sm font-semibold',
                            item.currentPrice > item.basePrice ? 'text-green-400' :
                            item.currentPrice < item.basePrice ? 'text-red-400' : 'text-foreground'
                          )}>
                            {formatPence(item.currentPrice)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground text-right hidden sm:table-cell">
                          {formatPence(item.minPrice)}
                        </td>
                        <td className="py-3 px-4 text-sm text-muted-foreground text-right hidden sm:table-cell">
                          {formatPence(item.maxPrice)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <Switch
                            checked={item.isDynamicPricingEnabled}
                            onCheckedChange={() => toggleDynamic(item)}
                          />
                        </td>
                        <td className="py-3 px-4 text-xs text-muted-foreground text-right hidden md:table-cell">
                          {timeAgo(item.lastUpdatedAt)}
                        </td>
                        <td className="py-3 px-4">
                          <button
                            onClick={() => deleteMutation.mutate(item.id)}
                            className="text-muted-foreground hover:text-destructive transition-colors"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
    </AppLayout>
  );
}
