import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { bookingApi, menuApi, orderApi, posApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
  SelectLabel, SelectSeparator, SelectGroup,
} from '@/components/ui/select';
import {
  Plus, Trash2, Search, X, Users, MapPin, AlertCircle, Clock,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

type OrderStatus = 'new' | 'preparing' | 'served' | 'paid' | 'cancelled';
type StatusFilter = 'all' | OrderStatus;

interface OrderItem {
  id?: string; menuItemId?: string; name: string;
  qty: number; unitPricePence: number; lineTotalPence?: number;
}
interface OrderRow {
  id: string;
  source?: 'order' | 'pos';
  posTicketId?: string;
  posTicketRef?: string;
  posStatus?: 'open' | 'parked' | 'closed' | 'voided';
  tableNumber?: string | null;
  customerName?: string | null;
  covers: number;
  status: OrderStatus;
  totalPence: number;
  notes?: string | null;
  orderedAt: string;
  items: OrderItem[];
}
interface TableOption { id: string; number: string; section: string; capacity: number; }
interface MenuOption { id: string; name: string; category: string; currentPrice: number; }

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function fmt(v: number) { return `£${(v / 100).toFixed(2)}`; }

function mapPosStatus(s: 'open' | 'parked' | 'closed' | 'voided'): OrderStatus {
  if (s === 'closed') return 'paid';
  if (s === 'voided') return 'cancelled';
  return 'preparing';
}

const STATUS_BADGE: Record<OrderStatus, string> = {
  new: 'text-blue-700 bg-blue-50 border-blue-200',
  preparing: 'text-amber-700 bg-amber-50 border-amber-200',
  served: 'text-purple-700 bg-purple-50 border-purple-200',
  paid: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  cancelled: 'text-red-700 bg-red-50 border-red-200',
};

const STATUS_DOT: Record<OrderStatus, string> = {
  new: 'bg-blue-500',
  preparing: 'bg-amber-500',
  served: 'bg-purple-500',
  paid: 'bg-emerald-500',
  cancelled: 'bg-red-500',
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function OrderEditor() {
  const { id: venueId } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const accessToken = useAuthStore((s) => s.accessToken);

  /* ── State ── */
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form
  const [customerName, setCustomerName] = useState('');
  const [tableNumber, setTableNumber] = useState('');
  const [covers, setCovers] = useState('2');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<OrderItem[]>([{ name: '', qty: 1, unitPricePence: 0 }]);
  const [appendToOrderId, setAppendToOrderId] = useState<string | null>(null);

  // Sources
  const [tables, setTables] = useState<TableOption[]>([]);
  const [menuItems, setMenuItems] = useState<MenuOption[]>([]);

  // Filters — auto-populated from ?table= query param (deep-link from floor plan)
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState(() => searchParams.get('table') ?? '');

  /* ── Derived ── */

  const draftTotal = useMemo(
    () => items.reduce((s, it) => s + ((Number(it.qty) || 0) * (Number(it.unitPricePence) || 0)), 0),
    [items],
  );

  const menuItemsForDropdown = useMemo(() => {
    const day = new Date().getDay();
    const isWeekday = day >= 1 && day <= 5;
    const isDrinkCat = (c: string) => /drink|bar|beverage|cocktail|wine|beer|soft/i.test(c);
    return menuItems
      .filter((m) => isWeekday ? !/weekend/i.test(m.category) || isDrinkCat(m.category) : isDrinkCat(m.category))
      .sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  }, [menuItems]);

  const filteredOrders = useMemo(() => {
    let result = orders;
    if (statusFilter !== 'all') result = result.filter((o) => o.status === statusFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) {
      result = result.filter((o) =>
        `${o.customerName ?? ''} ${o.tableNumber ?? ''} ${o.items.map((i) => i.name).join(' ')} ${o.posTicketRef ?? ''}`
          .toLowerCase().includes(q),
      );
    }
    return result;
  }, [orders, statusFilter, searchQuery]);

  const stats = useMemo(() => ({
    total: orders.length,
    new: orders.filter((o) => o.status === 'new').length,
    preparing: orders.filter((o) => o.status === 'preparing').length,
    paid: orders.filter((o) => o.status === 'paid').length,
    revenue: orders.filter((o) => o.status === 'paid').reduce((s, o) => s + o.totalPence, 0),
  }), [orders]);

  /* ── Data ── */

  async function loadOrders() {
    if (!venueId) return;
    setLoading(true);
    setError(null);
    try {
      const today = new Date().toISOString().slice(0, 10);
      const [resp, posResp] = await Promise.all([
        orderApi.list(venueId, today),
        posApi.listTickets(venueId, { date: today, limit: 200 }),
      ]);
      const native: OrderRow[] = (resp.data.data ?? []).map((o: any) => ({ ...o, source: 'order' }));
      const pos: OrderRow[] = (posResp.data.data ?? []).map((t: any) => ({
        id: `pos:${t.id}`,
        source: 'pos',
        posTicketId: t.id,
        posTicketRef: t.ticket_ref,
        posStatus: t.status,
        tableNumber: t.table_number ?? null,
        customerName: t.customer_name ?? null,
        covers: t.covers ?? 1,
        status: mapPosStatus(t.status),
        totalPence: t.total_pence ?? 0,
        notes: t.notes ?? null,
        orderedAt: t.created_at,
        items: (t.items ?? []).map((i: any) => ({
          id: i.id, name: i.name, qty: i.qty,
          unitPricePence: i.unit_price_pence, lineTotalPence: i.line_total_pence,
        })),
      }));
      setOrders([...native, ...pos].sort((a, b) => +new Date(b.orderedAt) - +new Date(a.orderedAt)));
    } catch {
      setError('Failed to load orders');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadOrders(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    async function loadSources() {
      if (!venueId) return;
      try {
        const [tableResp, menuResp] = await Promise.all([
          bookingApi.tables(venueId),
          menuApi.list(venueId),
        ]);
        setTables(tableResp.data.data ?? []);
        setMenuItems(menuResp.data.data ?? []);
      } catch {
        setError('Failed to load tables/menu');
      }
    }
    void loadSources();
  }, [venueId]);

  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const refresh = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) void loadOrders();
    };
    socket.on('orders:updated', refresh);
    socket.on('pos:tickets_updated', refresh);
    socket.on('pos:payments_updated', refresh);
    socket.on('inventory:updated', refresh);
    return () => {
      socket.off('orders:updated', refresh);
      socket.off('pos:tickets_updated', refresh);
      socket.off('pos:payments_updated', refresh);
      socket.off('inventory:updated', refresh);
      leaveVenueRoom(venueId);
    };
  }, [venueId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── Actions ── */

  function handleSelectTable(num: string) {
    setTableNumber(num);
    const t = tables.find((t) => t.number === num);
    if (t) setCovers(String(t.capacity));
  }

  function handleSelectMenuItem(idx: number, menuItemId: string) {
    const m = menuItems.find((m) => m.id === menuItemId);
    if (!m) return;
    setItems((prev) => prev.map((it, i) =>
      i === idx ? { ...it, menuItemId: m.id, name: m.name, unitPricePence: m.currentPrice } : it,
    ));
  }

  async function createOrder() {
    if (!venueId) return;
    const validItems = items.filter((i) => i.name.trim() && i.qty > 0);
    if (!validItems.length) { setError('Add at least one valid item'); return; }
    try {
      if (appendToOrderId) {
        await orderApi.addItems(
          venueId, appendToOrderId,
          validItems.map((i) => ({ name: i.name.trim(), qty: i.qty, unitPricePence: i.unitPricePence })),
        );
      } else {
        await orderApi.create(venueId, {
          customerName: customerName || null,
          tableNumber: tableNumber || null,
          covers: Math.max(1, Number(covers) || 1),
          notes: notes || null,
          status: 'new',
          items: validItems.map((i) => ({ name: i.name.trim(), qty: i.qty, unitPricePence: i.unitPricePence })),
        });
      }
      setCustomerName('');
      setTableNumber('');
      setCovers('2');
      setNotes('');
      setItems([{ name: '', qty: 1, unitPricePence: 0, menuItemId: undefined }]);
      setAppendToOrderId(null);
      void loadOrders();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to create order');
    }
  }

  async function setStatus(order: OrderRow, status: OrderStatus) {
    if (!venueId) return;
    if (order.source === 'pos' && order.posTicketId) {
      try {
        if (status === 'paid') {
          const ticketResp = await posApi.getTicket(venueId, order.posTicketId);
          const ticket = ticketResp.data.data;
          if (ticket?.status === 'closed' || ticket?.status === 'voided') return;
          await posApi.pay(venueId, order.posTicketId, {
            method: 'card',
            amountPence: Math.max(1, Number(ticket?.total_pence) || Number(order.totalPence) || 0),
            tipPence: 0,
            idempotencyKey: `${order.posTicketId}-order-editor-${Date.now()}`,
          });
        } else if (status === 'cancelled') {
          await posApi.voidTicket(venueId, order.posTicketId, 'Cancelled from Order Editor');
        } else if (status === 'preparing' && order.posStatus === 'parked') {
          await posApi.reopenTicket(venueId, order.posTicketId);
        }
        void loadOrders();
      } catch (e: any) {
        setError(e?.response?.data?.error ?? 'Failed to sync status');
      }
      return;
    }
    try {
      await orderApi.update(venueId, order.id, { status });
      void loadOrders();
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to update status');
    }
  }

  function cancelAppend() {
    setAppendToOrderId(null);
    setCustomerName('');
    setTableNumber('');
    setCovers('2');
    setItems([{ name: '', qty: 1, unitPricePence: 0 }]);
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render
     ══════════════════════════════════════════════════════════════════════ */

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* ── Header ── */}
        <header className="h-12 bg-white border-b border-border flex items-center px-5 gap-4 shrink-0">
          <h1 className="text-sm font-semibold">Order Editor</h1>
          <div className="h-4 w-px bg-border" />

          {/* Stats */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{stats.total} orders</span>
            <span className="text-amber-600 font-medium">{stats.preparing} preparing</span>
            <span className="text-emerald-600 font-medium">{fmt(stats.revenue)} revenue</span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input
                className="h-8 w-48 pl-8 pr-7 rounded-lg border bg-muted/30 text-xs placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-white transition-colors"
                placeholder="Search orders…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Status filter */}
            <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
              {(['all', 'new', 'preparing', 'served', 'paid'] as StatusFilter[]).map((f) => (
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
          </div>
        </header>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-50 border-b border-red-200 flex items-center gap-2 text-xs text-red-700">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-600">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 flex min-h-0">

          {/* ════════════ LEFT — Create Order Form ════════════ */}
          <aside className="w-[380px] bg-white border-r border-border flex flex-col shrink-0">
            <div className="px-4 pt-4 pb-3 border-b border-border/50">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">
                  {appendToOrderId ? 'Add Items to Order' : 'Create Order'}
                </span>
                {appendToOrderId && (
                  <button onClick={cancelAppend} className="text-[11px] text-primary hover:underline font-medium">
                    Cancel
                  </button>
                )}
              </div>
              {appendToOrderId && (
                <p className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5 mt-2">
                  Adding extra items to a preparing order. Submit to append.
                </p>
              )}
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
              {/* Customer + Table + Covers */}
              {!appendToOrderId && (
                <>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Customer Name</label>
                    <input
                      className="w-full h-9 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      placeholder="Walk-in"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_100px] gap-2">
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Table</label>
                      <Select value={tableNumber || '__none__'} onValueChange={(v) => handleSelectTable(v === '__none__' ? '' : v)}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select table" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">No table</SelectItem>
                          {tables.map((t) => (
                            <SelectItem key={t.id} value={t.number}>
                              T{t.number} · {t.section} ({t.capacity}p)
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Covers</label>
                      <input
                        className="w-full h-9 border rounded-lg px-3 text-sm text-center focus:outline-none focus:ring-2 focus:ring-primary/20"
                        type="number" min={1} value={covers}
                        onChange={(e) => setCovers(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary/20"
                      rows={2} placeholder="Special instructions…"
                      value={notes} onChange={(e) => setNotes(e.target.value)}
                    />
                  </div>
                </>
              )}

              {/* Line items */}
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-2 block">Items</label>
                <div className="space-y-2">
                  {items.map((it, idx) => (
                    <div key={idx} className="rounded-xl border bg-muted/20 p-2.5 space-y-1.5">
                      <div className="flex gap-1.5">
                        <Select
                          value={it.menuItemId ?? '__none__'}
                          onValueChange={(v) => { if (v !== '__none__') handleSelectMenuItem(idx, v); }}
                        >
                          <SelectTrigger className="min-w-0 flex-1 h-8 text-[11px] px-2">
                            <SelectValue placeholder="Select item" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">Select menu item</SelectItem>
                            {Array.from(new Set(menuItemsForDropdown.map((m) => m.category))).map((cat, catIdx) => (
                              <SelectGroup key={cat}>
                                {catIdx > 0 && <SelectSeparator />}
                                <SelectLabel>{cat}</SelectLabel>
                                {menuItemsForDropdown.filter((m) => m.category === cat).map((m) => (
                                  <SelectItem key={m.id} value={m.id}>
                                    {m.name} · {fmt(m.currentPrice)}
                                  </SelectItem>
                                ))}
                              </SelectGroup>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                          className="w-8 h-8 rounded-md text-red-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center shrink-0 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-[60px_1fr_80px] gap-1.5 items-center">
                        <input
                          className="h-7 border rounded-md px-2 text-[11px] text-center focus:outline-none focus:ring-1 focus:ring-primary/20"
                          type="number" min={1} placeholder="Qty"
                          value={it.qty}
                          onChange={(e) => setItems((p) => p.map((x, i) => i === idx ? { ...x, qty: Math.max(1, Number(e.target.value) || 1) } : x))}
                        />
                        <div className="text-[11px] text-muted-foreground truncate">
                          {it.name || 'No item selected'}
                        </div>
                        <div className="text-[11px] font-semibold text-right tabular-nums">
                          {it.name ? fmt(it.qty * it.unitPricePence) : '—'}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  onClick={() => setItems((p) => [...p, { name: '', qty: 1, unitPricePence: 0 }])}
                  className="mt-2 h-8 px-3 text-xs border border-dashed rounded-lg inline-flex items-center gap-1 text-muted-foreground hover:text-foreground hover:border-primary/30 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Add line
                </button>
              </div>
            </div>

            {/* Submit */}
            <div className="px-4 py-3 border-t border-border/50 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-muted-foreground">Order Total</span>
                <span className="font-bold tabular-nums">{fmt(draftTotal)}</span>
              </div>
              <button
                onClick={() => void createOrder()}
                className="w-full h-10 rounded-xl bg-primary text-white text-sm font-medium hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                {appendToOrderId ? 'Add Items to Order' : 'Create Order'}
              </button>
            </div>
          </aside>

          {/* ════════════ RIGHT — Live Orders ════════════ */}
          <main className="flex-1 overflow-y-auto bg-muted/20 p-4">
            {loading ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-sm text-muted-foreground">Loading orders…</p>
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <Clock className="w-8 h-8 text-muted-foreground/20 mb-2" />
                <p className="text-sm text-muted-foreground">
                  {searchQuery || statusFilter !== 'all' ? 'No orders match your filters' : 'No orders yet today'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {filteredOrders.map((o) => {
                  const isPreparing = o.status === 'preparing' && o.source !== 'pos';
                  return (
                    <div
                      key={o.id}
                      onClick={() => {
                        if (!isPreparing) return;
                        setAppendToOrderId(o.id);
                        setCustomerName(o.customerName ?? '');
                        setTableNumber(o.tableNumber ?? '');
                        setCovers(String(o.covers ?? 1));
                      }}
                      className={cn(
                        'rounded-xl border bg-white p-4 transition-all',
                        isPreparing && 'cursor-pointer hover:border-primary/40 hover:shadow-md',
                      )}
                    >
                      {/* Header */}
                      <div className="flex items-start gap-2 mb-2">
                        <div className={cn('w-1.5 h-1.5 rounded-full mt-1.5 shrink-0', STATUS_DOT[o.status])} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold truncate">
                              {o.customerName || 'Walk-in'}
                            </span>
                            {o.source === 'pos' && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-blue-200 bg-blue-50 text-blue-700 font-medium shrink-0">
                                POS {o.posTicketRef}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                            {o.tableNumber && (
                              <span className="flex items-center gap-0.5">
                                <MapPin className="w-3 h-3" /> T{o.tableNumber}
                              </span>
                            )}
                            <span className="flex items-center gap-0.5">
                              <Users className="w-3 h-3" /> {o.covers}
                            </span>
                            <span className="flex items-center gap-0.5">
                              <Clock className="w-3 h-3" />
                              {new Date(o.orderedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-bold tabular-nums shrink-0">{fmt(o.totalPence)}</span>
                      </div>

                      {/* Items */}
                      {o.items.length > 0 && (
                        <div className="text-xs text-muted-foreground mb-3 pl-3.5 line-clamp-2">
                          {o.items.map((i) => `${i.qty}× ${i.name}`).join(', ')}
                        </div>
                      )}

                      {/* Status buttons */}
                      <div className="flex items-center gap-1 pl-3.5">
                        {(o.source === 'pos'
                          ? (['preparing', 'paid', 'cancelled'] as OrderStatus[])
                          : (['new', 'preparing', 'served', 'paid', 'cancelled'] as OrderStatus[])
                        ).map((s) => (
                          <button
                            key={s}
                            onClick={(e) => { e.stopPropagation(); void setStatus(o, s); }}
                            className={cn(
                              'text-[10px] px-2.5 py-1 rounded-full border font-medium capitalize transition-all',
                              o.status === s
                                ? STATUS_BADGE[s]
                                : 'border-transparent text-muted-foreground hover:bg-muted/50',
                            )}
                          >
                            {s}
                          </button>
                        ))}
                      </div>

                      {isPreparing && (
                        <p className="text-[10px] text-primary mt-2 pl-3.5 font-medium">
                          Click to add extra items
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </main>
        </div>
      </div>
    </AppLayout>
  );
}
