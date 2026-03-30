import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { orderApi, posApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

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
function formatPence(v: number) { return `£${(v / 100).toFixed(2)}`; }
function mapPosStatusToOrderStatus(status: 'open' | 'parked' | 'closed' | 'voided'): OrderStatus {
  if (status === 'closed') return 'paid';
  if (status === 'voided') return 'cancelled';
  return 'preparing';
}

export default function OrderDatabase() {
  const { id: venueId } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [query, setQuery] = useState('');

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

  const filtered = useMemo(
    () => {
      const byStatus = statusFilter === 'all' ? orders : orders.filter((o) => o.status === statusFilter);
      const q = query.trim().toLowerCase();
      if (!q) return byStatus;
      return byStatus.filter((o) =>
        `${o.customerName ?? ''} ${o.tableNumber ?? ''} ${o.items.map((i) => i.name).join(' ')}`.toLowerCase().includes(q),
      );
    },
    [orders, statusFilter, query],
  );
  const totalRevenue = useMemo(() => filtered.reduce((s, o) => s + o.totalPence, 0), [filtered]);
  const countNew = useMemo(() => orders.filter((o) => o.status === 'new').length, [orders]);
  const countPreparing = useMemo(() => orders.filter((o) => o.status === 'preparing').length, [orders]);
  const countPaid = useMemo(() => orders.filter((o) => o.status === 'paid').length, [orders]);

  const badgeCls: Record<OrderStatus, string> = {
    new: 'bg-blue-50 text-blue-700 border-blue-200',
    preparing: 'bg-amber-50 text-amber-700 border-amber-200',
    served: 'bg-purple-50 text-purple-700 border-purple-200',
    paid: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-red-50 text-red-700 border-red-200',
  };

  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        <header className="h-14 border-b border-border px-4 flex items-center gap-2 bg-background">
          <h1 className="text-sm font-semibold">Order Database</h1>
          <div className="ml-auto flex items-center gap-2">
            <input
              className="h-8 text-xs border rounded px-2 w-52"
              placeholder="Search customer, table, item..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | OrderStatus)}>
              <SelectTrigger className="h-8 w-32 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="new">New</SelectItem>
                <SelectItem value="preparing">Preparing</SelectItem>
                <SelectItem value="served">Served</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-xs text-muted-foreground">Revenue: <b className="text-foreground">{formatPence(totalRevenue)}</b></span>
          </div>
        </header>
        <div className="grid grid-cols-4 gap-3 p-4 border-b border-border bg-muted/20">
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Total Orders</div>
            <div className="text-lg font-semibold">{orders.length}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">New</div>
            <div className="text-lg font-semibold">{countNew}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Preparing</div>
            <div className="text-lg font-semibold">{countPreparing}</div>
          </div>
          <div className="rounded-xl border bg-card p-3">
            <div className="text-[11px] text-muted-foreground">Paid Revenue</div>
            <div className="text-lg font-semibold">{formatPence(orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.totalPence, 0))}</div>
          </div>
        </div>
        <div className="flex-1 overflow-auto">
          {loading ? <div className="p-4 text-sm text-muted-foreground">Loading orders...</div> : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3">Time</th>
                  <th className="text-left py-2 px-3">Order</th>
                  <th className="text-left py-2 px-3">Items</th>
                  <th className="text-left py-2 px-3">Status</th>
                  <th className="text-right py-2 px-3">Total</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.id} className="border-b border-border/60">
                    <td className="py-2 px-3 text-muted-foreground">{new Date(o.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
                    <td className="py-2 px-3">
                      <div className="font-medium">{o.customerName || 'Walk-in'} {o.tableNumber ? `· T${o.tableNumber}` : ''}</div>
                      {o.source === 'pos' && (
                        <div className="text-[10px] text-blue-700">POS {o.posTicketRef ?? ''}</div>
                      )}
                      <div className="text-muted-foreground">{o.covers} covers</div>
                    </td>
                    <td className="py-2 px-3 text-muted-foreground">{o.items.map((i) => `${i.qty}x ${i.name}`).join(', ')}</td>
                    <td className="py-2 px-3">
                      <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 capitalize font-medium', badgeCls[o.status])}>
                        {o.status}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-right font-semibold">{formatPence(o.totalPence)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </AppLayout>
  );
}
