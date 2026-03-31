import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { FloorPlanEditor } from '@/components/booking/FloorPlanEditor';
import { BookingTableList } from '@/components/booking/BookingTableList';
import type { FPTable, TableOrderInfo } from '@/components/booking/FloorPlanEditor';
import { useAuthStore } from '@/store/authStore';
import { useVenueStore } from '@/store/venueStore';
import { cn } from '@/lib/utils';
import { bookingApi, orderApi, posApi } from '@/lib/api';
import { floorStorageKey } from '@/lib/bookingFloorStorage';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import {
  CalendarDays, Clock, PanelBottomClose, PanelBottomOpen, PencilRuler, Eye,
  Settings2, Timer,
} from 'lucide-react';
import { toast } from 'sonner';

function readSavedTables(venueId: string | null | undefined): FPTable[] {
  try {
    const raw = localStorage.getItem(floorStorageKey(venueId));
    if (raw) return JSON.parse(raw).tables ?? [];
  } catch { /* ignore */ }
  return [];
}

function readSavedLayout(venueId: string | null | undefined): { tables: FPTable[]; sections: Array<{ id: string; label: string; x: number; y: number }> } {
  try {
    const raw = localStorage.getItem(floorStorageKey(venueId));
    if (!raw) return { tables: [], sections: [] };
    const parsed = JSON.parse(raw);
    return {
      tables: parsed?.tables ?? [],
      sections: parsed?.sections ?? [],
    };
  } catch {
    return { tables: [], sections: [] };
  }
}

function buildSectionsFromTables(tables: FPTable[]) {
  const defaults: Record<string, { x: number; y: number }> = {
    'Main Floor': { x: 40, y: 46 },
    'Bar Area': { x: 560, y: 46 },
    'Private Dining': { x: 40, y: 490 },
    'Terrace': { x: 560, y: 348 },
  };
  return [...new Set(tables.map((t) => t.section))].map((label, idx) => ({
    id: `sec_${idx}_${label.replace(/\s+/g, '_').toLowerCase()}`,
    label,
    x: defaults[label]?.x ?? 40 + (idx * 140),
    y: defaults[label]?.y ?? 46,
  }));
}

function mergeSectionsWithSaved(
  tables: FPTable[],
  savedSections: Array<{ id: string; label: string; x: number; y: number }>,
) {
  const generated = buildSectionsFromTables(tables);
  const byLabel = new Map(savedSections.map((s) => [s.label, s]));
  return generated.map((g) => {
    const saved = byLabel.get(g.label);
    return saved ? { ...g, x: saved.x, y: saved.y } : g;
  });
}

function persistLayoutToLocal(tables: FPTable[], venueId: string | null | undefined) {
  const { sections: savedSections } = readSavedLayout(venueId);
  const sections = mergeSectionsWithSaved(tables, savedSections);
  try {
    localStorage.setItem(floorStorageKey(venueId), JSON.stringify({ tables, sections }));
  } catch { /* ignore quota / private mode */ }
}

function normalizeTime(value?: string): string {
  if (!value) return '19:00';
  const trimmed = value.trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return trimmed;
  const ampm = trimmed.match(/^(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (!ampm) return '19:00';
  let hour = Number(ampm[1]);
  const minute = Number(ampm[2]);
  const suffix = ampm[3].toLowerCase();
  if (suffix === 'pm' && hour < 12) hour += 12;
  if (suffix === 'am' && hour === 12) hour = 0;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

const STAT_COLORS: Record<string, string> = {
  green:  'text-emerald-600',
  amber:  'text-amber-600',
  blue:   'text-blue-600',
  purple: 'text-violet-600',
};

interface TableOrderHistoryItem {
  id: string;
  ticketRef: string | null;
  status: string;
  totalPence: number;
  paidAt: string | null;
}

function formatPounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function BookingAnalysis() {
  const accessToken = useAuthStore((s) => s.accessToken);
  const { selectedVenueId } = useVenueStore();
  const navigate = useNavigate();
  const todayDate = new Date().toISOString().slice(0, 10);
  const [editMode,      setEditMode]      = useState(false);
  const [selectedTable, setSelectedTable] = useState<FPTable | null>(null);
  const [bottomOpen,    setBottomOpen]    = useState(false);
  const [tick,          setTick]          = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);
  const [liveFromDb,    setLiveFromDb]    = useState<FPTable[]>([]);
  const [editorKey,     setEditorKey]     = useState(0);
  const [newBookingDate, setNewBookingDate] = useState(todayDate);
  const [newBookingTime, setNewBookingTime] = useState('19:00');
  const [newBookingGuest, setNewBookingGuest] = useState('');
  const [newBookingParty, setNewBookingParty] = useState('2');
  const [bookingSaveError, setBookingSaveError] = useState<string | null>(null);
  const [bookingSaving, setBookingSaving] = useState(false);
  const [tableOrderHistory, setTableOrderHistory] = useState<TableOrderHistoryItem[]>([]);
  const [tableOrderHistoryLoading, setTableOrderHistoryLoading] = useState(false);
  const [cleaningTimerMinutes, setCleaningTimerMinutes] = useState(15);
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [timerInput, setTimerInput] = useState('15');
  const [timerSaving, setTimerSaving] = useState(false);
  const [tableOrdersMap, setTableOrdersMap] = useState<Record<string, TableOrderInfo>>({});
  const bottomHeight = 288;

  const mapApiTable = (t: any, bookingStateDate: string): FPTable => ({
    id: t.id,
    number: t.number,
    section: t.section,
    capacity: t.capacity,
    shape: (t.shape ?? 'round') as FPTable['shape'],
    x: t.x,
    y: t.y,
    w: t.w ?? undefined,
    h: t.h ?? undefined,
    status: t.status,
    autoStatus: t.autoStatus ?? false,
    cleaningStartedAt: t.cleaningStartedAt ?? undefined,
    color: t.color ?? undefined,
    guestName: t.guestName ?? undefined,
    partySize: t.partySize ?? undefined,
    bookingDate: bookingStateDate,
    bookingTime: t.bookingTime ?? undefined,
    seatedAt: t.seatedAt ?? undefined,
    notes: t.notes ?? undefined,
  });

  async function loadBookingStateForDate(date: string, shouldHydrateLocal = false) {
    if (!selectedVenueId) return;
    const resp = await bookingApi.bookingState(selectedVenueId, date);
    const dateStr = (resp.data.data.date as string) ?? date;
    const tables: FPTable[] = (resp.data.data.tables ?? []).map((t: any) => mapApiTable(t, dateStr));
    if (resp.data.data.cleaningTimerMinutes != null) {
      setCleaningTimerMinutes(resp.data.data.cleaningTimerMinutes);
      setTimerInput(String(resp.data.data.cleaningTimerMinutes));
    }
    setLiveFromDb(tables);
    if (shouldHydrateLocal) {
      persistLayoutToLocal(tables, selectedVenueId);
      setEditorKey((v) => v + 1);
      setTick((v) => v + 1);
    }
  }

  async function loadActiveOrders() {
    if (!selectedVenueId) return;
    try {
      const [ticketsRes, ordersRes] = await Promise.allSettled([
        posApi.activeTickets(selectedVenueId),
        orderApi.list(selectedVenueId, todayDate),
      ]);

      const map: Record<string, TableOrderInfo> = {};

      // Native orders first (POS tickets will override if both exist for same table)
      if (ordersRes.status === 'fulfilled') {
        const rows: any[] = ordersRes.value.data?.data ?? ordersRes.value.data ?? [];
        for (const o of rows) {
          if (o.tableNumber && ['new', 'preparing', 'served'].includes(o.status)) {
            map[o.tableNumber] = {
              orderId: o.id,
              totalPence: o.totalPence ?? 0,
              status: o.status,
              items: (o.items ?? []).map((i: any) => ({
                name: i.name,
                qty: i.qty,
                unitPricePence: i.unitPricePence ?? i.unit_price_pence ?? 0,
              })),
              source: 'order',
            };
          }
        }
      }

      // Active POS tickets override (more current for live tables)
      if (ticketsRes.status === 'fulfilled') {
        const tickets: any[] = ticketsRes.value.data?.data ?? ticketsRes.value.data ?? [];
        for (const t of tickets) {
          const tableNum: string | null = t.table_number ?? t.tableNumber ?? null;
          if (tableNum) {
            map[tableNum] = {
              orderId: t.id,
              ticketRef: t.ticket_ref ?? t.ticketRef ?? null,
              totalPence: t.total_pence ?? t.totalPence ?? 0,
              status: t.status ?? 'open',
              items: (t.items ?? []).map((i: any) => ({
                name: i.name,
                qty: i.qty,
                unitPricePence: i.unit_price_pence ?? i.unitPricePence ?? 0,
              })),
              source: 'pos',
            };
          }
        }
      }

      setTableOrdersMap(map);
    } catch (err) {
      console.error('[BookingAnalysis] Failed to load active orders:', err);
    }
  }

  useEffect(() => {
    async function load() {
      if (!selectedVenueId) return;
      setIsLoading(true);
      try {
        await loadBookingStateForDate(todayDate, true);
        void loadActiveOrders();
      } catch (err) {
        console.error('[BookingAnalysis] Failed to load booking state:', err);
      } finally {
        setIsLoading(false);
      }
    }
    void load();
  }, [selectedVenueId, todayDate]);

  useEffect(() => {
    if (!selectedVenueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(selectedVenueId);

    const refresh = async () => {
      try {
        const resp = await bookingApi.bookingState(selectedVenueId, todayDate);
        const dateStr = (resp.data.data.date as string) ?? todayDate;
        const tables: FPTable[] = (resp.data.data.tables ?? []).map((t: any) => mapApiTable(t, dateStr));
        if (!editMode) {
          setLiveFromDb(tables);
          persistLayoutToLocal(tables, selectedVenueId);
          setEditorKey((v) => v + 1);
        }
        void loadActiveOrders();
      } catch (err) {
        console.error('[BookingAnalysis] Live refresh failed:', err);
      }
    };

    const onBookingsUpdated = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === selectedVenueId) void refresh();
    };
    const onPosUpdated = (payload: { venueId?: string }) => {
      if ((payload?.venueId && payload.venueId !== selectedVenueId) || !selectedTable) return;
      void loadSelectedTableOrderHistory(selectedTable, newBookingDate);
    };
    socket.on('bookings:updated', onBookingsUpdated);
    socket.on('pos:tickets_updated', onPosUpdated);
    socket.on('pos:payments_updated', onPosUpdated);

    const poll = window.setInterval(() => {
      if (!editMode) void refresh();
    }, 15000);

    return () => {
      window.clearInterval(poll);
      socket.off('bookings:updated', onBookingsUpdated);
      socket.off('pos:tickets_updated', onPosUpdated);
      socket.off('pos:payments_updated', onPosUpdated);
      leaveVenueRoom(selectedVenueId);
    };
  }, [selectedVenueId, todayDate, editMode, selectedTable, newBookingDate, accessToken]);

  useEffect(() => {
    if (!selectedTable) {
      setTableOrderHistory([]);
      return;
    }
    void loadSelectedTableOrderHistory(selectedTable, newBookingDate);
  }, [selectedTable, newBookingDate, selectedVenueId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!editMode || !selectedVenueId) return;
    let lastPayload = '';
    const timer = window.setInterval(async () => {
      const saved = readSavedTables(selectedVenueId);
      const payload = JSON.stringify(saved.map((t) => ({
        id: t.id, number: t.number, section: t.section, capacity: t.capacity, shape: t.shape,
        x: t.x, y: t.y, w: t.w ?? null, h: t.h ?? null, status: t.status,
        autoStatus: t.autoStatus ?? false, color: t.color ?? null, notes: t.notes ?? null,
      })));
      if (payload === lastPayload) return;
      lastPayload = payload;
      try {
        await bookingApi.saveTables(
          selectedVenueId,
          saved.map((t, idx) => ({
            id: t.id,
            number: t.number,
            section: t.section,
            capacity: t.capacity,
            shape: t.shape,
            x: t.x,
            y: t.y,
            w: t.w ?? null,
            h: t.h ?? null,
            status: t.status,
            autoStatus: t.autoStatus ?? false,
            color: t.color ?? null,
            notes: t.notes ?? null,
            displayOrder: idx + 1,
          })),
        );
      } catch (err) {
        console.error('[BookingAnalysis] Autosave failed:', err);
      }
    }, 2000);
    return () => window.clearInterval(timer);
  }, [editMode, selectedVenueId]);

  const liveTables = useMemo(() => {
    if (editMode) return readSavedTables(selectedVenueId);
    return liveFromDb;
  }, [editMode, liveFromDb, tick, selectedVenueId]);

  function handleSelectTable(t: FPTable | null) {
    if (t) {
      setSelectedTable(t);
      setBottomOpen(true);
      setBookingSaveError(null);
      setNewBookingParty(String(Math.min(Math.max(1, t.capacity), 20)));
    }
  }

  function handleTableOrderClick(table: FPTable, _order: TableOrderInfo) {
    navigate(`/venues/${selectedVenueId}/orders?table=${encodeURIComponent(table.number)}`);
  }

  async function loadSelectedTableOrderHistory(table: FPTable, date: string) {
    if (!selectedVenueId) return;
    setTableOrderHistoryLoading(true);
    try {
      const resp = await bookingApi.orderHistory(selectedVenueId, {
        date,
        tableNumber: table.number,
      });
      setTableOrderHistory(resp.data.data ?? []);
    } catch (err) {
      console.error('[BookingAnalysis] Failed to load table order history:', err);
      setTableOrderHistory([]);
    } finally {
      setTableOrderHistoryLoading(false);
    }
  }

  async function handleSaveBookingFromSidebar(table: FPTable) {
    if (!selectedVenueId) return;
    if (!table.guestName?.trim()) {
      setBookingSaveError('Guest name is required');
      return;
    }
    const bookingDate =
      table.bookingDate && /^\d{4}-\d{2}-\d{2}$/.test(table.bookingDate)
        ? table.bookingDate
        : todayDate;
    const intendedStatus = table.status === 'occupied' ? 'seated' : 'confirmed';
    const intendedTime = normalizeTime(
      table.status === 'occupied' ? table.seatedAt : table.bookingTime,
    );
    if (!/^\d{4}-\d{2}-\d{2}$/.test(bookingDate) || !/^\d{2}:\d{2}$/.test(intendedTime)) {
      setBookingSaveError('Date/time format is invalid');
      return;
    }

    setBookingSaving(true);
    setBookingSaveError(null);
    try {
      const bookingsResp = await bookingApi.bookingsByDate(selectedVenueId, bookingDate);
      const rows: any[] = bookingsResp.data.data ?? [];
      const existing = rows.find(
        (b) =>
          b.tableNumber === table.number
          && String(b.bookingDate ?? '').slice(0, 10) === bookingDate
          && (b.status === 'confirmed' || b.status === 'pending' || b.status === 'seated'),
      );
      if (existing) {
        await bookingApi.updateBooking(selectedVenueId, existing.id, {
          guestName: table.guestName.trim(),
          partySize: table.partySize ?? Math.max(1, Math.min(table.capacity, 20)),
          status: intendedStatus,
          startTime: intendedTime,
          section: table.section,
          tableId: table.id,
          tableNumber: table.number,
          bookingDate,
          notes: table.notes ?? null,
        });
      } else {
        await bookingApi.createBooking(selectedVenueId, {
          tableId: table.id,
          tableNumber: table.number,
          section: table.section,
          guestName: table.guestName.trim(),
          partySize: table.partySize ?? Math.max(1, Math.min(table.capacity, 20)),
          bookingDate,
          startTime: intendedTime,
          duration: 90,
          status: intendedStatus,
          notes: table.notes ?? null,
        });
      }
      toast.success('Booking saved');
      if (bookingDate === todayDate) {
        void loadBookingStateForDate(todayDate, false);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to save booking';
      setBookingSaveError(msg);
      console.error('[BookingAnalysis] Sidebar booking save failed:', err);
    } finally {
      setBookingSaving(false);
    }
  }

  async function handleCreateBookingFromEditor() {
    if (!selectedVenueId || !selectedTable) return;
    if (!newBookingGuest.trim()) {
      setBookingSaveError('Guest name is required');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(newBookingDate) || !/^\d{2}:\d{2}$/.test(newBookingTime)) {
      setBookingSaveError('Date/time format is invalid');
      return;
    }

    setBookingSaving(true);
    setBookingSaveError(null);
    try {
      await bookingApi.createBooking(selectedVenueId, {
        tableId: selectedTable.id,
        tableNumber: selectedTable.number,
        section: selectedTable.section,
        guestName: newBookingGuest.trim(),
        partySize: Math.max(1, Number(newBookingParty) || 1),
        bookingDate: newBookingDate,
        startTime: newBookingTime,
        duration: 90,
        status: 'confirmed',
      });
      await loadBookingStateForDate(todayDate, true);
      setNewBookingGuest('');
      setNewBookingTime('19:00');
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to save booking';
      setBookingSaveError(msg);
      console.error('[BookingAnalysis] Failed to create booking from editor:', err);
    } finally {
      setBookingSaving(false);
    }
  }

  async function syncEditorBookingFieldsToDatabase(tables: FPTable[]) {
    if (!selectedVenueId) return;
    const candidates = tables.filter((t) => t.guestName && (t.status === 'reserved' || t.status === 'occupied'));
    const datesNeeded = [...new Set(candidates.map((t) => t.bookingDate ?? todayDate))];
    const bookingsByDate = new Map<string, any[]>();
    await Promise.all(
      datesNeeded.map(async (d) => {
        const resp = await bookingApi.bookingsByDate(selectedVenueId, d);
        bookingsByDate.set(d, resp.data.data ?? []);
      }),
    );

    for (const t of candidates) {
      const bookingDate = t.bookingDate ?? todayDate;
      const dayBookings = bookingsByDate.get(bookingDate) ?? [];
      const intendedStatus = t.status === 'occupied' ? 'seated' : 'confirmed';
      const intendedTime = normalizeTime(t.status === 'occupied' ? t.seatedAt : t.bookingTime);
      const existing = dayBookings.find(
        (b) =>
          b.tableNumber === t.number
          && String(b.bookingDate ?? '').slice(0, 10) === bookingDate
          && (b.status === 'confirmed' || b.status === 'pending' || b.status === 'seated'),
      );

      if (existing) {
        await bookingApi.updateBooking(selectedVenueId, existing.id, {
          guestName: t.guestName,
          partySize: t.partySize ?? Math.max(1, Math.min(t.capacity, 20)),
          status: intendedStatus,
          startTime: intendedTime,
          section: t.section,
          tableId: t.id,
          tableNumber: t.number,
          bookingDate,
          notes: t.notes ?? null,
        });
      } else {
        await bookingApi.createBooking(selectedVenueId, {
          tableId: t.id,
          tableNumber: t.number,
          section: t.section,
          guestName: t.guestName,
          partySize: t.partySize ?? Math.max(1, Math.min(t.capacity, 20)),
          bookingDate,
          startTime: intendedTime,
          duration: 90,
          status: intendedStatus,
          notes: t.notes ?? null,
        });
      }
    }
  }

  async function handleExitEdit() {
    if (!selectedVenueId) {
      setEditMode(false);
      return;
    }

    const savedTables = readSavedTables(selectedVenueId);
    try {
      await bookingApi.saveTables(
        selectedVenueId,
        savedTables.map((t, idx) => ({
          id: t.id,
          number: t.number,
          section: t.section,
          capacity: t.capacity,
          shape: t.shape,
          x: t.x,
          y: t.y,
          w: t.w ?? null,
          h: t.h ?? null,
          status: t.status,
          autoStatus: t.autoStatus ?? false,
          color: t.color ?? null,
          notes: t.notes ?? null,
          displayOrder: idx + 1,
        }))
      );
      await syncEditorBookingFieldsToDatabase(savedTables);
    } catch (err) {
      console.error('[BookingAnalysis] Failed to save floor layout:', err);
    }

    setEditMode(false);
    setLiveFromDb(savedTables);
    setTick((t) => t + 1);
    setEditorKey((v) => v + 1);
  }

  async function handleSaveCleaningTimer() {
    if (!selectedVenueId) return;
    const mins = Math.max(1, Math.min(120, Number(timerInput) || 15));
    setTimerSaving(true);
    try {
      await bookingApi.setCleaningTimer(selectedVenueId, mins);
      setCleaningTimerMinutes(mins);
      setTimerInput(String(mins));
      setShowTimerSettings(false);
    } catch (err) {
      console.error('[BookingAnalysis] Failed to save cleaning timer:', err);
    } finally {
      setTimerSaving(false);
    }
  }

  // Periodic refresh for auto-status cleaning countdowns (every 10 seconds)
  useEffect(() => {
    if (editMode) return;
    const hasAutoCleaningTables = liveTables.some(
      (t) => t.autoStatus && t.status === 'cleaning' && t.cleaningStartedAt,
    );
    if (!hasAutoCleaningTables) return;
    const interval = window.setInterval(() => {
      if (selectedVenueId) {
        void loadBookingStateForDate(todayDate, true);
      }
    }, 10000); // check every 10s for timer expiry
    return () => window.clearInterval(interval);
  }, [editMode, liveTables, selectedVenueId, todayDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const occupied      = liveTables.filter(t => t.status === 'occupied').length;
  const reserved      = liveTables.filter(t => t.status === 'reserved').length;
  const available     = liveTables.filter(t => t.status === 'available').length;
  const totalSeats    = liveTables.reduce((s, t) => s + t.capacity, 0);
  const occupiedSeats = liveTables.filter(t => t.status === 'occupied').reduce((s, t) => s + (t.partySize ?? t.capacity), 0);
  const occupancyPct  = totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0;

  const STATS = [
    { label: 'Occupancy', value: `${occupancyPct}%`, color: 'green'  },
    { label: 'Occupied',  value: String(occupied),    color: 'amber'  },
    { label: 'Reserved',  value: String(reserved),    color: 'blue'   },
    { label: 'Available', value: String(available),   color: 'purple' },
  ];

  return (
    <AppLayout>
      <>
        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="h-14 shrink-0 border-b border-border px-4 flex items-center gap-3 bg-background">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            <span>Tonight · {new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </div>

          <div className="flex-1" />

          {/* Stats strip (view mode only) */}
          {!editMode && (
            <div className="hidden md:flex items-center gap-5 mr-2">
              {STATS.map(({ label, value, color }) => (
                <div key={label} className="text-center">
                  <div className={cn('text-[15px] font-bold tabular-nums', STAT_COLORS[color])}>{value}</div>
                  <div className="text-[10px] text-muted-foreground/60">{label}</div>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            {/* Auto table count indicator */}
            {!editMode && liveTables.some((t) => t.autoStatus) && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-2.5 py-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                {liveTables.filter((t) => t.autoStatus).length} Auto
              </div>
            )}

            {/* Cleaning timer settings */}
            <div className="relative">
              <button
                onClick={() => setShowTimerSettings((v) => !v)}
                title={`Cleaning timer: ${cleaningTimerMinutes} min`}
                className={cn(
                  'flex items-center gap-1.5 h-9 px-2.5 rounded-lg border text-xs font-medium transition-colors',
                  showTimerSettings
                    ? 'bg-primary/10 border-primary/20 text-primary'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground',
                )}
              >
                <Timer className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{cleaningTimerMinutes}m</span>
              </button>
              {showTimerSettings && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-background border border-border rounded-xl shadow-xl p-3 w-56">
                  <div className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
                    <Settings2 className="h-3.5 w-3.5" />
                    Cleaning Timer
                  </div>
                  <p className="text-[10px] text-muted-foreground mb-2">
                    How long after a table enters &quot;Cleaning&quot; before it auto-resets to &quot;Available&quot;.
                  </p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={120}
                      value={timerInput}
                      onChange={(e) => setTimerInput(e.target.value)}
                      className="flex-1 h-8 text-xs border border-border rounded-md px-2 bg-background"
                    />
                    <span className="text-xs text-muted-foreground shrink-0">min</span>
                  </div>
                  <button
                    onClick={() => void handleSaveCleaningTimer()}
                    disabled={timerSaving}
                    className="mt-2 w-full h-8 text-xs font-medium rounded-md bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                  >
                    {timerSaving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary border border-border rounded-lg px-3 py-1.5">
              <Clock className="h-3.5 w-3.5" />
              {new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </div>

            {/* Edit / View toggle */}
            <button
              onClick={() => {
                if (editMode) {
                  void handleExitEdit();
                  return;
                }
                setBookingSaveError(null);
                persistLayoutToLocal(liveFromDb, selectedVenueId);
                setEditorKey((v) => v + 1);
                setEditMode(true);
              }}
              className={cn(
                'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors',
                editMode
                  ? 'bg-primary text-white border-primary hover:bg-primary/90'
                  : 'bg-secondary border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {editMode
                ? <><Eye className="h-3.5 w-3.5" /><span className="hidden sm:inline">View mode</span></>
                : <><PencilRuler className="h-3.5 w-3.5" /><span className="hidden sm:inline">Edit layout</span></>
              }
            </button>

            {/* Table list toggle (view mode only) */}
            {!editMode && (
              <button
                onClick={() => setBottomOpen(v => !v)}
                title={bottomOpen ? 'Hide table list' : 'Show table list'}
                className={cn(
                  'flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors',
                  bottomOpen
                    ? 'bg-primary/10 border-primary/20 text-primary hover:bg-primary/15'
                    : 'bg-secondary border-border text-muted-foreground hover:text-foreground',
                )}
              >
                {bottomOpen
                  ? <PanelBottomClose className="h-3.5 w-3.5" />
                  : <PanelBottomOpen  className="h-3.5 w-3.5" />}
                <span className="hidden sm:inline">{bottomOpen ? 'Hide list' : 'Table list'}</span>
              </button>
            )}
          </div>
        </header>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div className="flex-1 flex flex-col overflow-hidden min-h-0">

          {/* Floor plan / editor */}
          <div className="flex-1 overflow-hidden min-h-0">
            {isLoading && !editMode ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                Loading booking layout...
              </div>
            ) : (
              <FloorPlanEditor
                key={editorKey}
                editMode={editMode}
                venueId={selectedVenueId}
                selectedId={editMode ? undefined : (selectedTable?.id ?? null)}
                onSelect={handleSelectTable}
                cleaningTimerMinutes={cleaningTimerMinutes}
                tableOrders={tableOrdersMap}
                onTableOrderClick={handleTableOrderClick}
                defaultBookingDate={todayDate}
                onSaveBooking={editMode ? handleSaveBookingFromSidebar : undefined}
                saveBookingBusy={bookingSaving}
                saveBookingError={bookingSaveError}
              />
            )}
          </div>

          {/* Table list — collapsible (view mode only) */}
          {!editMode && (
            <div
              className="shrink-0 overflow-hidden border-t border-border transition-all duration-300 ease-in-out"
              style={{ height: bottomOpen ? bottomHeight : 0 }}
            >
              <div className="overflow-y-auto" style={{ height: bottomHeight }}>
                {selectedTable && (
                  <div className="px-4 py-3 border-b border-border bg-background/80">
                    <div className="text-xs font-semibold text-foreground mb-2">
                      Book Table {selectedTable.number} ({selectedTable.section})
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                      <input
                        value={newBookingGuest}
                        onChange={(e) => setNewBookingGuest(e.target.value)}
                        placeholder="Guest name"
                        className="h-8 text-xs border border-border rounded px-2 col-span-2"
                      />
                      <input
                        type="date"
                        value={newBookingDate}
                        onChange={(e) => setNewBookingDate(e.target.value)}
                        className="h-8 text-xs border border-border rounded px-2"
                      />
                      <input
                        type="time"
                        value={newBookingTime}
                        onChange={(e) => setNewBookingTime(e.target.value)}
                        className="h-8 text-xs border border-border rounded px-2"
                      />
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={newBookingParty}
                          onChange={(e) => setNewBookingParty(e.target.value)}
                          className="h-8 text-xs border border-border rounded px-2 w-16"
                        />
                        <button
                          onClick={() => void handleCreateBookingFromEditor()}
                          disabled={bookingSaving}
                          className="h-8 px-3 text-xs font-medium rounded bg-primary text-white hover:bg-primary/90 disabled:opacity-60"
                        >
                          {bookingSaving ? 'Saving...' : 'Save booking'}
                        </button>
                      </div>
                    </div>
                    {bookingSaveError && (
                      <div className="text-[11px] text-red-600 mt-2">{bookingSaveError}</div>
                    )}
                    <div className="mt-3 rounded border border-border bg-secondary/20 p-2">
                      <div className="flex items-center justify-between mb-1.5">
                        <div className="text-[11px] font-semibold text-foreground">Order history ({newBookingDate})</div>
                        <a href="/optimizers/pos" className="text-[10px] text-primary hover:underline">Open POS</a>
                      </div>
                      {tableOrderHistoryLoading ? (
                        <div className="text-[11px] text-muted-foreground">Loading linked tickets...</div>
                      ) : tableOrderHistory.length === 0 ? (
                        <div className="text-[11px] text-muted-foreground">No POS tickets for this table/date.</div>
                      ) : (
                        <div className="space-y-1">
                          {tableOrderHistory.map((order) => (
                            <div key={order.id} className="rounded border border-border bg-background px-2 py-1.5 flex items-center justify-between gap-2">
                              <div className="min-w-0">
                                <div className="text-[11px] font-medium truncate">{order.ticketRef ?? `Ticket ${order.id.slice(0, 8)}`}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {formatPounds(order.totalPence)} {order.paidAt ? `· Paid ${new Date(order.paidAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '· Unpaid'}
                                </div>
                              </div>
                              <a href={`/optimizers/pos?ticket=${order.id}`} className="text-[10px] text-primary hover:underline shrink-0">
                                View
                              </a>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <BookingTableList
                  tables={liveTables}
                  selectedId={selectedTable?.id ?? null}
                  onSelect={handleSelectTable}
                />
              </div>
            </div>
          )}
        </div>
      </>
    </AppLayout>
  );
}
