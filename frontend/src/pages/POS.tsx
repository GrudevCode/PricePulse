import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { bookingApi, posApi } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useVenueStore } from '@/store/venueStore';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Plus, X, Search, CreditCard, Banknote, Smartphone,
  Pause, Play, Split, Percent, Trash2, ReceiptText, Package, Users,
  MapPin, AlertCircle, Check,
} from 'lucide-react';

/* ═══════════════════════════════════════════════════════════════════════
   Types
   ═══════════════════════════════════════════════════════════════════════ */

type PaymentMethod = 'cash' | 'card' | 'contactless' | 'apple_pay' | 'google_pay' | 'voucher' | 'other';
type TicketFilter = 'all' | 'open' | 'parked';
type OrderType = 'dine_in' | 'takeaway' | 'delivery';

interface PosMenuItem {
  id: string; name: string; pricePence: number;
  isAvailable: boolean; stockStatus: 'in_stock' | 'low_stock' | 'out_of_stock';
}
interface PosMenuCategory { id: string | null; name: string; items: PosMenuItem[]; }
interface PosTicketItem {
  id: string; name: string; qty: number;
  unit_price_pence: number; line_total_pence: number;
}
interface PosTicket {
  id: string; ticket_ref: string;
  table_number?: string | null; customer_name?: string | null;
  covers: number; status: 'open' | 'parked' | 'closed' | 'voided';
  total_pence: number; subtotal_pence: number; tax_pence: number;
  service_charge_pence: number; discount_pence: number;
  items: PosTicketItem[];
}
interface TableOption { id: string; number: string; section: string; capacity: number; }
interface BookingGuestOption {
  id: string; guestName: string; tableNumber: string;
  partySize: number; section: string;
}

/* ═══════════════════════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════════════════════ */

function fmt(pence: number) { return `£${(pence / 100).toFixed(2)}`; }

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return <span>{time.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</span>;
}

const STATUS_DOT: Record<string, string> = {
  open: 'bg-emerald-500', parked: 'bg-blue-500', closed: 'bg-slate-400', voided: 'bg-red-500',
};
const STATUS_BADGE: Record<string, string> = {
  open: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  parked: 'text-blue-700 bg-blue-50 border-blue-200',
  closed: 'text-slate-600 bg-slate-50 border-slate-200',
  voided: 'text-red-700 bg-red-50 border-red-200',
};

/* ═══════════════════════════════════════════════════════════════════════
   Component
   ═══════════════════════════════════════════════════════════════════════ */

export default function POS() {
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { selectedVenueId, venues } = useVenueStore();
  const venueId = selectedVenueId || venues[0]?.id || '';
  const venueName = venues.find((v) => v.id === venueId)?.name ?? '';

  /* ── State ── */
  const [menu, setMenu] = useState<PosMenuCategory[]>([]);
  const [tickets, setTickets] = useState<PosTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<any>(null);

  const [activeCategoryName, setActiveCategoryName] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all');

  const [showNewTicket, setShowNewTicket] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>('dine_in');
  const [ticketForm, setTicketForm] = useState({ tableNumber: '', customerName: '', covers: '2', notes: '' });
  const [selectedBookingId, setSelectedBookingId] = useState('__none__');
  const [tableOptions, setTableOptions] = useState<TableOption[]>([]);
  const [bookingGuestOptions, setBookingGuestOptions] = useState<BookingGuestOption[]>([]);
  const [autofilledFromBooking, setAutofilledFromBooking] = useState(false);

  const [payMethod, setPayMethod] = useState<PaymentMethod>('card');
  const [payAmount, setPayAmount] = useState('0');
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [itemBusyId, setItemBusyId] = useState<string | null>(null);
  const suppressSocketRefreshUntil = useRef(0);
  const [openStaffName, setOpenStaffName] = useState('Front Staff');

  /* ── Derived ── */

  const selectedTicket = useMemo(
    () => tickets.find((t) => t.id === selectedTicketId) ?? null,
    [tickets, selectedTicketId],
  );

  /** Merge categories with the same name (fixes duplicate Starters / Mains / Desserts) */
  const deduplicatedMenu = useMemo(() => {
    const merged = new Map<string, PosMenuCategory>();
    for (const cat of menu) {
      const key = cat.name.trim();
      if (merged.has(key)) {
        const existing = merged.get(key)!;
        const ids = new Set(existing.items.map((i) => i.id));
        for (const item of cat.items) {
          if (!ids.has(item.id)) existing.items.push(item);
        }
      } else {
        merged.set(key, { ...cat, items: [...cat.items] });
      }
    }
    return Array.from(merged.values());
  }, [menu]);

  const displayItems = useMemo(() => {
    let items: PosMenuItem[] = [];
    if (activeCategoryName === 'all') {
      items = deduplicatedMenu.flatMap((c) => c.items);
    } else {
      items = deduplicatedMenu.find((c) => c.name.trim() === activeCategoryName)?.items ?? [];
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      items = items.filter((i) => i.name.toLowerCase().includes(q));
    }
    const seen = new Set<string>();
    return items.filter((i) => { if (seen.has(i.id)) return false; seen.add(i.id); return true; });
  }, [deduplicatedMenu, activeCategoryName, searchQuery]);

  const filteredTickets = useMemo(() => {
    if (ticketFilter === 'all') return tickets;
    return tickets.filter((t) => t.status === ticketFilter);
  }, [tickets, ticketFilter]);

  const remaining = useMemo(() => {
    if (!selectedTicket) return 0;
    return Math.max(0, selectedTicket.total_pence);
  }, [selectedTicket]);

  /* ── Data fetching ── */

  function suppressSocketRefresh(ms = 1200) {
    suppressSocketRefreshUntil.current = Date.now() + ms;
  }

  async function refreshAll(opts?: { silent?: boolean }) {
    if (!venueId) return;
    if (!opts?.silent) setLoading(true);
    try {
      const [menuResp, ticketResp, sessionResp, tablesResp, bookingsResp] = await Promise.all([
        posApi.menu(venueId),
        posApi.activeTickets(venueId),
        posApi.currentSession(venueId),
        bookingApi.tables(venueId),
        bookingApi.bookingsByDate(venueId, new Date().toISOString().slice(0, 10)),
      ]);
      setMenu(menuResp.data.data ?? []);
      setTickets(ticketResp.data.data ?? []);
      setSession(sessionResp.data.data ?? null);
      setTableOptions((tablesResp.data.data ?? []).map((t: any) => ({
        id: t.id, number: t.number, section: t.section, capacity: t.capacity,
      })));
      setBookingGuestOptions((bookingsResp.data.data ?? []).map((b: any) => ({
        id: b.id, guestName: b.guestName, tableNumber: b.tableNumber,
        partySize: b.partySize, section: b.section,
      })));
      setSelectedTicketId((prev) => {
        const next = ticketResp.data.data ?? [];
        if (!next.length) return null;
        if (prev && next.some((t: any) => t.id === prev)) return prev;
        return next[0].id;
      });
    } catch (e: any) {
      setError(e?.response?.data?.error ?? 'Failed to load POS data');
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  async function refreshSelectedTicket(ticketId: string) {
    if (!venueId) return;
    const resp = await posApi.getTicket(venueId, ticketId);
    setTickets((prev) => prev.map((t) => (t.id === ticketId ? resp.data.data : t)));
  }

  useEffect(() => { if (venueId) void refreshAll(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const onPos = (payload: { venueId?: string }) => {
      if (Date.now() < suppressSocketRefreshUntil.current) return;
      if (!payload?.venueId || payload.venueId === venueId) void refreshAll({ silent: true });
    };
    socket.on('pos:tickets_updated', onPos);
    socket.on('pos:payments_updated', onPos);
    return () => {
      socket.off('pos:tickets_updated', onPos);
      socket.off('pos:payments_updated', onPos);
      leaveVenueRoom(venueId);
    };
  }, [venueId, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedTicket) setPayAmount((selectedTicket.total_pence / 100).toFixed(2));
  }, [selectedTicket]);

  /* ══════════════════════════════════════════════════════════════════════
     Actions
     ══════════════════════════════════════════════════════════════════════ */

  async function openSession() {
    if (!venueId) return;
    setBusyAction('open-session');
    setError(null);
    try {
      await posApi.openSession(venueId, { staffName: openStaffName, openingFloat: 0 });
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to open session'); }
    finally { setBusyAction(null); }
  }

  async function closeSession() {
    if (!venueId) return;
    setBusyAction('close-session');
    setError(null);
    try {
      await posApi.closeSession(venueId, {});
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to close session'); }
    finally { setBusyAction(null); }
  }

  async function createTicket() {
    if (!venueId) return;
    setBusyAction('create-ticket');
    setError(null);
    try {
      const resp = await posApi.createTicket(venueId, {
        tableNumber: ticketForm.tableNumber || null,
        customerName: ticketForm.customerName || null,
        covers: Math.max(1, Number(ticketForm.covers) || 1),
        notes: ticketForm.notes || null,
        ticketType: orderType,
      });
      setTicketForm({ tableNumber: '', customerName: '', covers: '2', notes: '' });
      setSelectedBookingId('__none__');
      setAutofilledFromBooking(false);
      setShowNewTicket(false);
      await refreshAll({ silent: true });
      setSelectedTicketId(resp.data.data.id);
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to create ticket'); }
    finally { setBusyAction(null); }
  }

  async function addMenuItem(item: PosMenuItem) {
    if (!venueId || !selectedTicket) return;
    setBusyAction(`add-${item.id}`);
    try {
      suppressSocketRefresh();
      await posApi.addItems(venueId, selectedTicket.id, [{
        menuItemId: item.id, name: item.name, qty: 1,
        unitPricePence: item.pricePence, modifierPence: 0,
      }]);
      await refreshSelectedTicket(selectedTicket.id);
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to add item'); }
    finally { setBusyAction(null); }
  }

  async function updateQty(item: PosTicketItem, nextQty: number) {
    if (!venueId || !selectedTicket) return;
    setItemBusyId(item.id);
    suppressSocketRefresh();
    try {
      if (nextQty <= 0) {
        await posApi.removeItem(venueId, selectedTicket.id, item.id);
      } else {
        await posApi.updateItem(venueId, selectedTicket.id, item.id, { qty: nextQty });
      }
      await refreshSelectedTicket(selectedTicket.id);
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to update quantity'); }
    finally { setItemBusyId(null); }
  }

  async function parkOrReopen() {
    if (!venueId || !selectedTicket) return;
    try {
      if (selectedTicket.status === 'open') await posApi.parkTicket(venueId, selectedTicket.id);
      else if (selectedTicket.status === 'parked') await posApi.reopenTicket(venueId, selectedTicket.id);
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to update ticket'); }
  }

  async function splitEqual2() {
    if (!venueId || !selectedTicket) return;
    const a = Math.floor(selectedTicket.total_pence / 2);
    try {
      await posApi.splitTicket(venueId, selectedTicket.id, {
        type: 'by_amount', amounts: [a, selectedTicket.total_pence - a],
      });
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to split ticket'); }
  }

  async function applyDiscount(pct: number) {
    if (!venueId || !selectedTicket) return;
    try {
      await posApi.applyDiscount(venueId, selectedTicket.id, { type: 'percentage', value: pct });
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to apply discount'); }
  }

  async function payTicket() {
    if (!venueId || !selectedTicket) return;
    setBusyAction('pay');
    try {
      await posApi.pay(venueId, selectedTicket.id, {
        method: payMethod,
        amountPence: Math.max(1, Math.round((Number(payAmount) || 0) * 100)),
        tipPence: 0,
        idempotencyKey: `${selectedTicket.id}-${Date.now()}`,
      });
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to process payment'); }
    finally { setBusyAction(null); }
  }

  async function voidTicket() {
    if (!venueId || !selectedTicket) return;
    if (!confirm('Void this ticket? This cannot be undone.')) return;
    try {
      await posApi.voidTicket(venueId, selectedTicket.id, 'Voided by staff');
      await refreshAll({ silent: true });
    } catch (e: any) { setError(e?.response?.data?.error ?? 'Failed to void ticket'); }
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render — Open-Shift Screen
     ══════════════════════════════════════════════════════════════════════ */

  if (!loading && !session) {
    return (
      <AppLayout>
        <div className="flex flex-col h-full">
          <header className="h-14 bg-white border-b border-border flex items-center px-3 gap-3 shrink-0">
            <button onClick={() => navigate('/optimizers')} className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground text-xs transition-colors">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>
            <div className="h-4 w-px bg-border" />
            <h1 className="text-sm font-semibold tracking-tight">Point of Sale</h1>
            <div className="ml-auto text-muted-foreground text-xs">{venueName}</div>
          </header>

          <div className="flex-1 flex items-center justify-center bg-muted/30">
            <div className="text-center max-w-sm">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-6">
                <ReceiptText className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Open a Shift to Begin</h2>
              <p className="text-sm text-muted-foreground mb-6">
                Start a new shift to begin taking orders and processing payments.
              </p>
              {error && (
                <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg p-3 mb-4">{error}</div>
              )}
              <input
                className="w-full h-10 border rounded-lg px-3 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                value={openStaffName}
                onChange={(e) => setOpenStaffName(e.target.value)}
                placeholder="Staff name"
              />
              <button
                onClick={() => void openSession()}
                disabled={busyAction === 'open-session' || !venueId}
                className="w-full h-11 rounded-lg bg-primary text-white text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {busyAction === 'open-session' ? 'Opening…' : 'Open Shift'}
              </button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  /* ══════════════════════════════════════════════════════════════════════
     Render — Main POS
     ══════════════════════════════════════════════════════════════════════ */

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* ── Top Bar ── */}
        <header className="h-14 bg-white border-b border-border flex items-center px-3 gap-3 shrink-0">
          <button onClick={() => navigate('/optimizers')} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <h1 className="text-sm font-semibold">POS</h1>
          <div className="h-4 w-px bg-border" />
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-emerald-600 text-xs font-medium">Shift Open</span>
          </div>
          <div className="ml-auto flex items-center gap-4 text-xs text-muted-foreground">
            <span className="hidden sm:inline">{venueName}</span>
            <LiveClock />
            <button
              onClick={() => { if (confirm('Close this shift?')) void closeSession(); }}
              disabled={busyAction === 'close-session'}
              className="text-muted-foreground hover:text-red-500 transition-colors font-medium"
            >
              End Shift
            </button>
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

          {/* ════════════ LEFT — Tickets ════════════ */}
          <aside className="w-56 xl:w-64 bg-white border-r border-border flex flex-col shrink-0">
            <div className="px-3 pt-3 pb-2 border-b border-border/50 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold tracking-wide uppercase text-muted-foreground">Orders</span>
                <span className="text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded-full font-semibold">
                  {tickets.length}
                </span>
              </div>
              <div className="flex gap-0.5 bg-muted/50 rounded-lg p-0.5">
                {(['all', 'open', 'parked'] as TicketFilter[]).map((f) => (
                  <button
                    key={f}
                    onClick={() => setTicketFilter(f)}
                    className={cn(
                      'flex-1 h-7 rounded-md text-[11px] font-medium capitalize transition-all',
                      ticketFilter === f
                        ? 'bg-white text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-2 py-2 space-y-1">
              {filteredTickets.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className={cn(
                    'w-full text-left rounded-xl p-2.5 transition-all',
                    selectedTicketId === t.id
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted/40 border border-transparent',
                  )}
                >
                  <div className="flex items-center gap-2">
                    <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT[t.status])} />
                    <span className="text-xs font-bold">{t.ticket_ref}</span>
                    <span className="ml-auto text-xs font-bold tabular-nums">{fmt(t.total_pence)}</span>
                  </div>
                  <div className="text-[11px] mt-0.5 pl-3.5 truncate text-muted-foreground">
                    {t.customer_name || 'Walk-in'}
                    {t.table_number ? ` · T${t.table_number}` : ''}
                  </div>
                </button>
              ))}
              {!filteredTickets.length && (
                <div className="text-center py-10">
                  <ReceiptText className="w-7 h-7 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-[11px] text-muted-foreground">
                    {ticketFilter !== 'all' ? `No ${ticketFilter} orders` : 'No active orders'}
                  </p>
                </div>
              )}
            </div>

            <div className="p-2 border-t border-border/50">
              <button
                onClick={() => setShowNewTicket(true)}
                className="w-full h-10 rounded-xl bg-primary text-white text-xs font-medium flex items-center justify-center gap-1.5 hover:bg-primary/90 active:scale-[0.98] transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> New Order
              </button>
            </div>
          </aside>

          {/* ════════════ CENTER — Menu ════════════ */}
          <main className="flex-1 flex flex-col min-w-0 bg-muted/20">
            <div className="bg-white border-b border-border px-4 pt-3 pb-2 space-y-2.5">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search menu…"
                  className="w-full h-9 pl-9 pr-8 rounded-lg border bg-muted/30 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 focus:bg-white transition-colors"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <div className="flex gap-1.5 overflow-x-auto pb-0.5 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
                <button
                  onClick={() => setActiveCategoryName('all')}
                  className={cn(
                    'shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition-all',
                    activeCategoryName === 'all'
                      ? 'bg-primary text-white shadow-sm'
                      : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                  )}
                >
                  All
                </button>
                {deduplicatedMenu.map((cat) => (
                  <button
                    key={cat.name.trim()}
                    onClick={() => setActiveCategoryName(cat.name.trim())}
                    className={cn(
                      'shrink-0 h-8 px-3.5 rounded-full text-xs font-medium transition-all whitespace-nowrap',
                      activeCategoryName === cat.name.trim()
                        ? 'bg-primary text-white shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {cat.name}
                    <span className="ml-1 opacity-50">{cat.items.length}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center justify-center h-full">
                  <div className="text-sm text-muted-foreground">Loading menu…</div>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
                  {displayItems.map((item) => {
                    const isAdding = busyAction === `add-${item.id}`;
                    const disabled = !selectedTicket || !session || !item.isAvailable || item.stockStatus === 'out_of_stock';
                    return (
                      <button
                        key={item.id}
                        onClick={() => void addMenuItem(item)}
                        disabled={disabled}
                        className={cn(
                          'relative rounded-xl border bg-white p-3 text-left transition-all',
                          'hover:shadow-md hover:border-primary/30 active:scale-[0.97]',
                          'disabled:opacity-35 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:border-border',
                          isAdding && 'ring-2 ring-primary/50 border-primary',
                          item.stockStatus === 'low_stock' && !disabled && 'border-amber-200',
                          item.stockStatus === 'out_of_stock' && 'bg-muted/30',
                        )}
                      >
                        <div className="text-[13px] font-medium leading-snug line-clamp-2">
                          {item.name}
                        </div>
                        <div className="flex items-center justify-between mt-2.5">
                          <span className="text-sm font-bold tabular-nums">{fmt(item.pricePence)}</span>
                          {item.stockStatus === 'low_stock' && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 uppercase tracking-wide">
                              Low
                            </span>
                          )}
                          {item.stockStatus === 'out_of_stock' && (
                            <span className="text-[9px] font-semibold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 uppercase tracking-wide">
                              86&apos;d
                            </span>
                          )}
                        </div>
                        {isAdding && (
                          <div className="absolute inset-0 rounded-xl bg-primary/10 flex items-center justify-center pointer-events-none">
                            <Check className="w-5 h-5 text-primary" />
                          </div>
                        )}
                      </button>
                    );
                  })}
                  {!displayItems.length && !loading && (
                    <div className="col-span-full flex flex-col items-center justify-center py-16">
                      <Package className="w-8 h-8 text-muted-foreground/20 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        {searchQuery ? 'No items match your search' : 'No items in this category'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </main>

          {/* ════════════ RIGHT — Order + Payment ════════════ */}
          <aside className="w-80 xl:w-[360px] bg-white border-l border-border flex flex-col shrink-0">
            {!selectedTicket ? (
              <div className="flex-1 flex items-center justify-center p-4">
                <div className="text-center">
                  <ReceiptText className="w-9 h-9 text-muted-foreground/20 mx-auto mb-3" />
                  <p className="text-sm font-medium text-muted-foreground">No order selected</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Select an order or create a new one</p>
                </div>
              </div>
            ) : (
              <>
                {/* Ticket header */}
                <div className="px-4 py-3 border-b border-border/50">
                  <div className="flex items-center gap-2">
                    <span className="text-base font-bold">{selectedTicket.ticket_ref}</span>
                    <span className={cn(
                      'text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize',
                      STATUS_BADGE[selectedTicket.status],
                    )}>
                      {selectedTicket.status}
                    </span>
                    <div className="ml-auto">
                      <button
                        onClick={() => void voidTicket()}
                        className="w-7 h-7 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 flex items-center justify-center transition-colors"
                        title="Void order"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {selectedTicket.customer_name || 'Walk-in'}
                    </span>
                    {selectedTicket.table_number && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" /> T{selectedTicket.table_number}
                      </span>
                    )}
                  </div>
                </div>

                {/* Cart items */}
                <div className="flex-1 overflow-y-auto min-h-0">
                  {!(selectedTicket.items ?? []).length ? (
                    <div className="flex flex-col items-center justify-center h-full px-4">
                      <p className="text-xs text-muted-foreground">Tap menu items to add</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-border/30">
                      {(selectedTicket.items ?? []).map((it) => (
                        <div key={it.id} className="px-4 py-2.5 flex items-center gap-2.5">
                          <div className="flex-1 min-w-0">
                            <div className="text-[13px] font-medium truncate">{it.name}</div>
                            <div className="text-[11px] text-muted-foreground tabular-nums">{fmt(it.unit_price_pence)} ea</div>
                          </div>
                          <div className="flex items-center gap-0.5">
                            <button
                              onClick={() => void updateQty(it, it.qty - 1)}
                              disabled={itemBusyId === it.id}
                              className="w-7 h-7 rounded-md border text-sm font-medium flex items-center justify-center hover:bg-muted/40 active:scale-95 disabled:opacity-40 transition-all"
                            >
                              {it.qty === 1 ? <Trash2 className="w-3 h-3 text-red-400" /> : '−'}
                            </button>
                            <span className="w-6 text-center text-sm font-semibold tabular-nums">{it.qty}</span>
                            <button
                              onClick={() => void updateQty(it, it.qty + 1)}
                              disabled={itemBusyId === it.id}
                              className="w-7 h-7 rounded-md border text-sm font-medium flex items-center justify-center hover:bg-muted/40 active:scale-95 disabled:opacity-40 transition-all"
                            >
                              +
                            </button>
                          </div>
                          <span className="w-14 text-right text-[13px] font-semibold tabular-nums">
                            {fmt(it.line_total_pence)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Totals */}
                <div className="border-t border-border px-4 py-3 text-[13px]">
                  <div className="space-y-1">
                    <div className="flex justify-between text-muted-foreground">
                      <span>Subtotal</span><span className="tabular-nums">{fmt(selectedTicket.subtotal_pence)}</span>
                    </div>
                    <div className="flex justify-between text-muted-foreground">
                      <span>Tax</span><span className="tabular-nums">{fmt(selectedTicket.tax_pence)}</span>
                    </div>
                    {selectedTicket.service_charge_pence > 0 && (
                      <div className="flex justify-between text-muted-foreground">
                        <span>Service</span><span className="tabular-nums">{fmt(selectedTicket.service_charge_pence)}</span>
                      </div>
                    )}
                    {selectedTicket.discount_pence > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium">
                        <span>Discount</span><span className="tabular-nums">−{fmt(selectedTicket.discount_pence)}</span>
                      </div>
                    )}
                  </div>
                  <div className="h-px bg-border my-2" />
                  <div className="flex justify-between font-bold text-base">
                    <span>Total</span><span className="tabular-nums">{fmt(selectedTicket.total_pence)}</span>
                  </div>
                </div>

                {/* Quick actions */}
                <div className="px-3 py-2 border-t border-border/50">
                  <div className="flex gap-1">
                    <button
                      onClick={() => void parkOrReopen()}
                      className="flex-1 h-8 rounded-lg border text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/40 active:scale-[0.97] transition-all"
                    >
                      {selectedTicket.status === 'open'
                        ? <><Pause className="w-3 h-3" /> Park</>
                        : <><Play className="w-3 h-3" /> Resume</>}
                    </button>
                    <button
                      onClick={() => void splitEqual2()}
                      className="flex-1 h-8 rounded-lg border text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/40 active:scale-[0.97] transition-all"
                    >
                      <Split className="w-3 h-3" /> Split
                    </button>
                    <button
                      onClick={() => void applyDiscount(10)}
                      className="flex-1 h-8 rounded-lg border text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/40 active:scale-[0.97] transition-all"
                    >
                      <Percent className="w-3 h-3" /> 10%
                    </button>
                    <button
                      onClick={() => void applyDiscount(20)}
                      className="flex-1 h-8 rounded-lg border text-[11px] font-medium text-muted-foreground flex items-center justify-center gap-1 hover:bg-muted/40 active:scale-[0.97] transition-all"
                    >
                      20%
                    </button>
                  </div>
                </div>

                {/* Payment */}
                <div className="px-3 pb-3 pt-2 border-t border-border space-y-2">
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { key: 'cash' as PaymentMethod, label: 'Cash', Icon: Banknote },
                      { key: 'card' as PaymentMethod, label: 'Card', Icon: CreditCard },
                      { key: 'contactless' as PaymentMethod, label: 'Tap', Icon: Smartphone },
                    ]).map(({ key, label, Icon }) => (
                      <button
                        key={key}
                        onClick={() => setPayMethod(key)}
                        className={cn(
                          'h-9 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 transition-all',
                          payMethod === key
                            ? 'bg-primary text-white border-primary shadow-sm'
                            : 'border-border text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        <Icon className="w-3.5 h-3.5" /> {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-medium">£</span>
                      <input
                        className="w-full h-11 pl-7 pr-3 rounded-lg border text-base font-semibold text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40 transition-colors"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                    </div>
                    <button
                      onClick={() => void payTicket()}
                      disabled={busyAction === 'pay' || !(selectedTicket.items?.length)}
                      className="h-11 px-5 rounded-lg bg-primary text-white font-semibold text-sm flex items-center gap-2 hover:bg-primary/90 active:scale-[0.97] disabled:opacity-40 transition-all"
                    >
                      <ReceiptText className="w-4 h-4" />
                      {busyAction === 'pay' ? '…' : 'Pay'}
                    </button>
                  </div>
                  {remaining > 0 && (selectedTicket.items?.length ?? 0) > 0 && (
                    <p className="text-center text-[11px] text-muted-foreground tabular-nums">
                      Remaining: {fmt(remaining)}
                    </p>
                  )}
                </div>
              </>
            )}
          </aside>
        </div>

        {/* ══════════════════════════════════════════════════════════════
           New Order Modal
           ══════════════════════════════════════════════════════════════ */}
        {showNewTicket && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm"
            onClick={() => setShowNewTicket(false)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl w-[440px] max-h-[88vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 pt-5 pb-3">
                <h2 className="text-lg font-semibold">New Order</h2>
                <button
                  onClick={() => setShowNewTicket(false)}
                  className="w-8 h-8 rounded-lg hover:bg-muted/50 flex items-center justify-center text-muted-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="px-5 pb-5 space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Order Type</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {([
                      { key: 'dine_in' as OrderType, label: 'Dine In' },
                      { key: 'takeaway' as OrderType, label: 'Takeaway' },
                      { key: 'delivery' as OrderType, label: 'Delivery' },
                    ]).map(({ key, label }) => (
                      <button
                        key={key}
                        onClick={() => setOrderType(key)}
                        className={cn(
                          'h-10 rounded-lg border text-sm font-medium transition-all',
                          orderType === key
                            ? 'bg-primary text-white border-primary'
                            : 'border-border text-muted-foreground hover:bg-muted/40',
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Link to Booking</label>
                  <Select
                    value={selectedBookingId}
                    onValueChange={(v) => {
                      setSelectedBookingId(v);
                      if (v === '__none__') { setAutofilledFromBooking(false); return; }
                      const sel = bookingGuestOptions.find((g) => g.id === v);
                      if (!sel) return;
                      setTicketForm((f) => ({
                        ...f,
                        customerName: sel.guestName || f.customerName,
                        tableNumber: sel.tableNumber || f.tableNumber,
                        covers: String(sel.partySize || Number(f.covers) || 1),
                      }));
                      setAutofilledFromBooking(true);
                    }}
                  >
                    <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="No booking" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No booking</SelectItem>
                      {bookingGuestOptions.map((g) => (
                        <SelectItem key={g.id} value={g.id}>
                          {g.guestName} · T{g.tableNumber} · {g.partySize} guests
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {autofilledFromBooking && (
                    <p className="text-[11px] text-primary mt-1 flex items-center gap-1">
                      <Check className="w-3 h-3" /> Auto-filled from booking
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Table</label>
                    <Select
                      value={ticketForm.tableNumber || '__none__'}
                      onValueChange={(v) => {
                        setTicketForm((f) => ({ ...f, tableNumber: v === '__none__' ? '' : v }));
                        if (v !== '__none__') setAutofilledFromBooking(false);
                      }}
                    >
                      <SelectTrigger className="h-10 text-sm"><SelectValue placeholder="No table" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">No table</SelectItem>
                        {tableOptions.map((t) => (
                          <SelectItem key={t.id} value={t.number}>T{t.number} · {t.section} ({t.capacity})</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Covers</label>
                    <input
                      type="number" min={1}
                      className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={ticketForm.covers}
                      onChange={(e) => setTicketForm((f) => ({ ...f, covers: e.target.value }))}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Customer Name</label>
                  <input
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Walk-in"
                    value={ticketForm.customerName}
                    onChange={(e) => {
                      setTicketForm((f) => ({ ...f, customerName: e.target.value }));
                      setAutofilledFromBooking(false);
                    }}
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Notes</label>
                  <input
                    className="w-full h-10 border rounded-lg px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    placeholder="Special instructions…"
                    value={ticketForm.notes}
                    onChange={(e) => setTicketForm((f) => ({ ...f, notes: e.target.value }))}
                  />
                </div>

                <button
                  onClick={() => void createTicket()}
                  disabled={busyAction === 'create-ticket'}
                  className="w-full h-11 rounded-xl bg-primary text-white font-semibold text-sm hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2 active:scale-[0.98]"
                >
                  <Plus className="w-4 h-4" />
                  {busyAction === 'create-ticket' ? 'Creating…' : 'Create Order'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
