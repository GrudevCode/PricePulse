import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { orderApi, posApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  Search, X, Users, MapPin, Clock, Receipt, TrendingUp, ShoppingCart, ChefHat,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type OrderStatus = 'new' | 'preparing' | 'served' | 'paid' | 'cancelled';

interface OrderItem { name: string; qty: number; unitPricePence: number; }

interface OrderRow {
  id: string;
  source?: 'order' | 'pos';
  posTicketRef?: string;
  tableNumber?: string | null;
  customerName?: string | null;
  covers: number;
  status: OrderStatus;
  totalPence: number;
  orderedAt: string;
  items: OrderItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPence(v: number) { return `£${(v / 100).toFixed(2)}`; }

function mapPosStatusToOrderStatus(status: 'open' | 'parked' | 'closed' | 'voided'): OrderStatus {
  if (status === 'closed') return 'paid';
  if (status === 'voided') return 'cancelled';
  return 'preparing';
}

// ─── Status styles ────────────────────────────────────────────────────────────

const STATUS_BADGE: Record<OrderStatus, string> = {
  new:       'bg-blue-50 text-blue-700 border-blue-200',
  preparing: 'bg-amber-50 text-amber-700 border-amber-200',
  served:    'bg-purple-50 text-purple-700 border-purple-200',
  paid:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  cancelled: 'bg-red-50 text-red-700 border-red-200',
};

const STATUS_DOT: Record<OrderStatus, string> = {
  new:       'bg-blue-500',
  preparing: 'bg-amber-500',
  served:    'bg-purple-500',
  paid:      'bg-emerald-500',
  cancelled: 'bg-red-400',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatCard({ icon, iconCls, label, value, valueCls }: {
  icon: ReactNode; iconCls: string; label: string; value: string; valueCls?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-white p-3.5 flex items-center gap-3">
      <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', iconCls)}>
        {icon}
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{label}</div>
        <div className={cn('text-lg font-bold tabular-nums leading-tight', valueCls ?? 'text-gray-900')}>{value}</div>
      </div>
    </div>
  );
}

function InfoRow({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 text-xs">
      <span className="w-3.5 h-3.5 mt-0.5 text-gray-400 shrink-0 [&>svg]:w-3.5 [&>svg]:h-3.5">{icon}</span>
      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide w-14 shrink-0 mt-0.5">{label}</span>
      <span className="text-gray-700 min-w-0">{children}</span>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function OrderDatabase() {
  const { id: venueId } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<OrderRow | null>(null);

  async function load() {
    if (!venueId) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [resp, posResp] = await Promise.all([
        orderApi.list(venueId),
        posApi.listTickets(venueId, { date: today, limit: 200 }),
      ]);
      const nativeOrders: OrderRow[] = (resp.data.data ?? []).map((o: any) => ({ ...o, source: 'order' }));
      const posOrders: OrderRow[] = (posResp.data.data ?? []).map((t: any) => ({
        id: `pos:${t.id}`,
        source: 'pos',
        posTicketRef: t.ticket_ref,
        tableNumber: t.table_number ?? null,
        customerName: t.customer_name ?? null,
        covers: t.covers ?? 1,
        status: mapPosStatusToOrderStatus(t.status),
        totalPence: t.total_pence ?? 0,
        orderedAt: t.created_at,
        items: [],
      }));
      setOrders([...nativeOrders, ...posOrders].sort((a, b) => +new Date(b.orderedAt) - +new Date(a.orderedAt)));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const onOrders = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) void load();
    };
    const onPos = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) void load();
    };
    socket.on('orders:updated', onOrders);
    socket.on('pos:tickets_updated', onPos);
    socket.on('pos:payments_updated', onPos);
    return () => {
      socket.off('orders:updated', onOrders);
      socket.off('pos:tickets_updated', onPos);
      socket.off('pos:payments_updated', onPos);
      leaveVenueRoom(venueId);
    };
  }, [venueId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const byStatus = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);
    const q = query.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((o) =>
      `${o.customerName ?? ''} ${o.tableNumber ?? ''} ${o.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q),
    );
  }, [orders, statusFilter, query]);

  const countNew       = useMemo(() => orders.filter((o) => o.status === 'new').length, [orders]);
  const countPreparing = useMemo(() => orders.filter((o) => o.status === 'preparing').length, [orders]);
  const paidRevenue    = useMemo(() => orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.totalPence, 0), [orders]);

  return (
    <AppLayout>
      <div className="h-full flex flex-col">

        {/* ── Header ── */}
        <header className="h-12 bg-white border-b border-border flex items-center px-5 gap-4 shrink-0">
          <Receipt className="w-4 h-4 text-muted-foreground/50 shrink-0" />
          <h1 className="text-sm font-semibold">Order Database</h1>
          <div className="h-4 w-px bg-border" />

          {/* Status filter pills */}
          <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
            {(['all', 'new', 'preparing', 'served', 'paid', 'cancelled'] as ('all' | OrderStatus)[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'h-7 px-2.5 rounded-md text-[11px] font-medium capitalize transition-all',
                  statusFilter === f
                    ? 'bg-white text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {f}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              <input
                className="h-8 w-52 pl-8 pr-7 rounded-lg border bg-muted/30 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-white transition-colors"
                placeholder="Search customer, table, item…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        </header>

        {/* ── Stat strip ── */}
        <div className="grid grid-cols-4 gap-3 px-5 py-3 border-b border-border bg-white shrink-0">
          <StatCard
            icon={<ShoppingCart className="w-4 h-4" />}
            iconCls="bg-gray-100 text-gray-500"
            label="Total Orders"
            value={String(orders.length)}
          />
          <StatCard
            icon={<Clock className="w-4 h-4" />}
            iconCls="bg-blue-50 text-blue-600"
            label="New"
            value={String(countNew)}
            valueCls="text-blue-700"
          />
          <StatCard
            icon={<ChefHat className="w-4 h-4" />}
            iconCls="bg-amber-50 text-amber-600"
            label="Preparing"
            value={String(countPreparing)}
            valueCls="text-amber-700"
          />
          <StatCard
            icon={<TrendingUp className="w-4 h-4" />}
            iconCls="bg-emerald-50 text-emerald-600"
            label="Paid Revenue"
            value={formatPence(paidRevenue)}
            valueCls="text-emerald-700"
          />
        </div>

        {/* ── Body ── */}
        <div className="flex-1 flex min-h-0">

          {/* Table */}
          <div className={cn('flex-1 overflow-auto', selected && 'border-r border-border')}>
            {loading ? (
              <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
                Loading orders…
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-white border-b border-border z-10">
                  <tr>
                    <th className="text-left py-2.5 pl-5 pr-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">Time</th>
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Customer</th>
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Items</th>
                    <th className="text-left py-2.5 px-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Status</th>
                    <th className="text-right py-2.5 px-3 pr-5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((o) => {
                    const isSelected = selected?.id === o.id;
                    return (
                      <tr
                        key={o.id}
                        onClick={() => setSelected(isSelected ? null : o)}
                        className={cn(
                          'border-b border-border/50 cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                        )}
                      >
                        <td className="py-3 pl-5 pr-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">
                          {new Date(o.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-medium text-gray-800">
                            {o.customerName || 'Walk-in'}
                            {o.tableNumber && (
                              <span className="text-muted-foreground font-normal"> · T{o.tableNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            {o.source === 'pos' && (
                              <span className="text-[10px] font-semibold text-blue-700">POS {o.posTicketRef}</span>
                            )}
                            <span className="text-[10px] text-muted-foreground">{o.covers} cover{o.covers !== 1 ? 's' : ''}</span>
                          </div>
                        </td>
                        <td className="py-3 px-3 max-w-[200px]">
                          <div className="truncate text-muted-foreground">
                            {o.items.length > 0
                              ? o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')
                              : <span className="text-muted-foreground/40">—</span>
                            }
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <span className={cn(
                            'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-semibold capitalize',
                            STATUS_BADGE[o.status],
                          )}>
                            <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[o.status])} />
                            {o.status}
                          </span>
                        </td>
                        <td className="py-3 px-3 pr-5 text-right font-semibold tabular-nums text-gray-800">
                          {formatPence(o.totalPence)}
                        </td>
                      </tr>
                    );
                  })}
                  {filtered.length === 0 && !loading && (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-muted-foreground">
                        No orders match your filters
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Detail panel ── */}
          {selected && (
            <div className="w-72 shrink-0 flex flex-col bg-white overflow-y-auto">
              <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
                <div>
                  <h3 className="text-[13px] font-semibold text-gray-900">
                    {selected.customerName || 'Walk-in'}
                  </h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    {new Date(selected.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {selected.tableNumber && ` · T${selected.tableNumber}`}
                  </p>
                </div>
                <button
                  onClick={() => setSelected(null)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
                {/* Status */}
                <div>
                  <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Status</div>
                  <span className={cn(
                    'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize',
                    STATUS_BADGE[selected.status],
                  )}>
                    <span className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[selected.status])} />
                    {selected.status}
                  </span>
                </div>

                {/* Info block */}
                <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3 space-y-2.5">
                  <InfoRow icon={<Clock />} label="Time">
                    {new Date(selected.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </InfoRow>
                  {selected.tableNumber && (
                    <InfoRow icon={<MapPin />} label="Table">T{selected.tableNumber}</InfoRow>
                  )}
                  <InfoRow icon={<Users />} label="Covers">
                    {selected.covers} cover{selected.covers !== 1 ? 's' : ''}
                  </InfoRow>
                  {selected.source === 'pos' && selected.posTicketRef && (
                    <InfoRow icon={<Receipt />} label="POS ref">{selected.posTicketRef}</InfoRow>
                  )}
                </div>

                {/* Items */}
                {selected.items.length > 0 ? (
                  <div>
                    <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Items</div>
                    <div className="space-y-1">
                      {selected.items.map((item, i) => (
                        <div key={i} className="flex items-center justify-between rounded-lg border border-border bg-white px-2.5 py-1.5">
                          <span className="text-xs text-gray-700">{item.qty}× {item.name}</span>
                          <span className="text-xs font-semibold tabular-nums text-gray-600">
                            {formatPence(item.qty * item.unitPricePence)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : selected.source === 'pos' ? (
                  <div className="text-[11px] text-muted-foreground text-center py-2 bg-muted/20 rounded-lg">
                    Item details available in POS
                  </div>
                ) : null}

                {/* Total */}
                <div className="rounded-xl border border-border bg-white px-3 py-3 flex items-center justify-between">
                  <span className="text-xs font-medium text-gray-500">Total</span>
                  <span className="text-base font-bold tabular-nums text-gray-900">
                    {formatPence(selected.totalPence)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
