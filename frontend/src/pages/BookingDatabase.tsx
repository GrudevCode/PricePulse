import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import { bookingApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Plus, X, Calendar, List,
  Clock, Users, Phone, Mail, FileText,
  CalendarDays, AlignLeft, Check, Receipt, ExternalLink,
  Maximize2, Minimize2, Trash2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type BookingStatus = 'confirmed' | 'pending' | 'seated' | 'completed' | 'cancelled' | 'no-show';
type ViewMode = 'month' | 'week' | 'list';

interface Booking {
  id: string;
  tableNumber: string;
  section: string;
  guestName: string;
  partySize: number;
  date: string;       // YYYY-MM-DD
  startTime: string;  // HH:MM
  duration: number;   // minutes
  status: BookingStatus;
  notes?: string;
  phone?: string;
  email?: string;
}

interface VenueTableOption {
  id: string;
  number: string;
  section: string;
  capacity: number;
}

interface BookingOrderHistoryItem {
  id: string;
  ticketRef: string | null;
  status: string;
  totalPence: number;
  tableNumber: string | null;
  bookingId: string | null;
  bookingDate: string | null;
  closedAt: string | null;
  paidAt: string | null;
  paidTotalPence: number;
}

// ─── Status styles ────────────────────────────────────────────────────────────

const STATUS: Record<BookingStatus, { bg: string; border: string; text: string; dot: string; label: string; chip: string }> = {
  confirmed: { bg: '#eff6ff', border: '#93c5fd', text: '#1d4ed8', dot: '#3b82f6', label: 'Confirmed', chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  pending:   { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b', label: 'Pending',   chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  seated:    { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#22c55e', label: 'Seated',    chip: 'bg-green-50 text-green-700 border-green-200' },
  completed: { bg: '#f9fafb', border: '#e5e7eb', text: '#6b7280', dot: '#9ca3af', label: 'Completed', chip: 'bg-gray-50 text-gray-600 border-gray-200'  },
  cancelled: { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444', label: 'Cancelled', chip: 'bg-red-50 text-red-700 border-red-200'     },
  'no-show': { bg: '#fafafa', border: '#d4d4d8', text: '#52525b', dot: '#a1a1aa', label: 'No-show',   chip: 'bg-zinc-50 text-zinc-600 border-zinc-200'  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

function startOfWeek(d: Date) {
  const r = new Date(d);
  r.setDate(r.getDate() - ((r.getDay() + 6) % 7)); // Monday
  return r;
}

function timeToMin(t: string) {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function fmtTime(t: string) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${m.toString().padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

function formatPounds(pence: number) {
  return `£${(pence / 100).toFixed(2)}`;
}

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ bookings, onSelect, selectedId, onDayClick }: {
  bookings: Booking[];
  onSelect: (b: Booking) => void;
  selectedId: string | null;
  onDayClick: (d: Date) => void;
}) {
  const today = fmt(new Date());
  const [cursor, setCursor] = useState(new Date(2026, 2, 1));

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  // Monday-first week start
  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: Date[] = [];
  for (let i = 0; i < startOffset; i++)   cells.push(addDays(firstDay, -(startOffset - i)));
  for (let i = 1; i <= lastDay.getDate(); i++) cells.push(new Date(year, month, i));
  while (cells.length % 7) cells.push(addDays(cells[cells.length - 1], 1));

  const byDay = useMemo(() => {
    const m: Record<string, Booking[]> = {};
    for (const b of bookings) {
      if (!m[b.date]) m[b.date] = [];
      m[b.date].push(b);
    }
    return m;
  }, [bookings]);

  const monthName = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      {/* Month nav */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
        <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold text-gray-700 w-36 text-center">{monthName}</span>
        <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {/* Day headers */}
      <div className="shrink-0 grid grid-cols-7 border-b border-border">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {cells.map((day, i) => {
          const ds = fmt(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday = ds === today;
          const dayBookings = (byDay[ds] ?? []).sort((a, b) => a.startTime.localeCompare(b.startTime));

          return (
            <div
              key={i}
              className={cn(
                'border-b border-r border-border flex flex-col min-h-0',
                isCurrentMonth ? 'bg-white' : 'bg-gray-50/30',
              )}
            >
              {/* Day number — click to jump to week view */}
              <div
                onClick={() => isCurrentMonth && onDayClick(day)}
                className={cn(
                  'shrink-0 flex items-center px-1.5 pt-1.5 pb-0.5',
                  isCurrentMonth && 'cursor-pointer hover:opacity-70',
                )}
              >
                <span className={cn(
                  'text-[11px] font-semibold w-5 h-5 flex items-center justify-center rounded-full',
                  isToday ? 'bg-primary text-white' : isCurrentMonth ? 'text-gray-700' : 'text-gray-300',
                )}>
                  {day.getDate()}
                </span>
                {dayBookings.length > 0 && isCurrentMonth && (
                  <span className="ml-auto text-[9px] text-gray-400 pr-0.5">{dayBookings.length}</span>
                )}
              </div>
              {/* Scrollable booking list */}
              {isCurrentMonth && (
                <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-1 space-y-0.5 scrollbar-thin">
                  {dayBookings.map(b => {
                    const s = STATUS[b.status];
                    return (
                      <button
                        key={b.id}
                        onClick={(e) => { e.stopPropagation(); onSelect(b); }}
                        className={cn(
                          'w-full text-left text-[10px] rounded px-1.5 py-0.5 truncate font-medium border transition-all hover:brightness-95',
                          selectedId === b.id ? 'ring-1 ring-primary ring-offset-0' : '',
                        )}
                        style={{ background: s.bg, borderColor: s.border, color: s.text }}
                      >
                        {fmtTime(b.startTime)} {b.guestName.split(',')[0]}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Week view ────────────────────────────────────────────────────────────────

const WEEK_START_H = 11;
const WEEK_END_H   = 23;
const PX_PER_MIN   = 1.0;
const TIME_COL_W   = 52;

function WeekView({ bookings, onSelect, selectedId, weekStart }: {
  bookings: Booking[];
  onSelect: (b: Booking) => void;
  selectedId: string | null;
  weekStart: Date;
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const today = fmt(new Date());
  const totalMins = (WEEK_END_H - WEEK_START_H) * 60;
  const gridH = totalMins * PX_PER_MIN;

  const hours = Array.from({ length: WEEK_END_H - WEEK_START_H + 1 }, (_, i) => WEEK_START_H + i);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Day header row */}
      <div className="shrink-0 flex border-b border-border bg-white">
        <div style={{ width: TIME_COL_W }} className="shrink-0" />
        {days.map((d) => {
          const ds = fmt(d);
          const isToday = ds === today;
          const count = bookings.filter(b => b.date === ds).length;
          return (
            <div key={ds} className="flex-1 py-2 text-center border-l border-border">
              <div className={cn('text-[11px] font-semibold uppercase tracking-wider', isToday ? 'text-primary' : 'text-gray-400')}>
                {d.toLocaleDateString('en-GB', { weekday: 'short' })}
              </div>
              <div className={cn(
                'text-[18px] font-bold mx-auto w-9 h-9 flex items-center justify-center rounded-full mt-0.5',
                isToday ? 'bg-primary text-white' : 'text-gray-700',
              )}>
                {d.getDate()}
              </div>
              {count > 0 && (
                <div className="text-[9px] text-gray-400 mt-0.5">{count} booking{count !== 1 ? 's' : ''}</div>
              )}
            </div>
          );
        })}
      </div>

      {/* Scrollable grid */}
      <div className="flex-1 overflow-y-auto">
        <div className="flex" style={{ height: gridH + 40 }}>
          {/* Time column */}
          <div style={{ width: TIME_COL_W }} className="shrink-0 relative">
            {hours.map(h => (
              <div
                key={h}
                style={{ position: 'absolute', top: (h - WEEK_START_H) * 60 * PX_PER_MIN, width: '100%' }}
                className="pr-2 text-right"
              >
                <span className="text-[10px] text-gray-400 font-mono leading-none">
                  {h}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d) => {
            const ds = fmt(d);
            const dayBookings = bookings.filter(b => b.date === ds);
            const isToday = ds === today;

            return (
              <div
                key={ds}
                className="flex-1 border-l border-border relative"
                style={{ height: gridH }}
              >
                {/* Hour lines */}
                {hours.map(h => (
                  <div
                    key={h}
                    style={{ position: 'absolute', top: (h - WEEK_START_H) * 60 * PX_PER_MIN, left: 0, right: 0 }}
                    className="border-t border-border/40"
                  />
                ))}
                {/* Today highlight */}
                {isToday && <div className="absolute inset-0 bg-primary/3 pointer-events-none" />}
                {/* Booking blocks */}
                {dayBookings.map(b => {
                  const startMin = timeToMin(b.startTime) - WEEK_START_H * 60;
                  if (startMin < 0 || startMin > totalMins) return null;
                  const top    = startMin * PX_PER_MIN;
                  const height = Math.max(b.duration * PX_PER_MIN, 28);
                  const s = STATUS[b.status];
                  return (
                    <button
                      key={b.id}
                      onClick={() => onSelect(b)}
                      style={{
                        position: 'absolute',
                        top,
                        left: 2,
                        right: 2,
                        height,
                        background: s.bg,
                        borderLeft: `3px solid ${s.dot}`,
                        borderRadius: 6,
                        overflow: 'hidden',
                        boxShadow: selectedId === b.id ? `0 0 0 2px ${s.dot}` : '0 1px 3px rgba(0,0,0,0.08)',
                        zIndex: selectedId === b.id ? 10 : 1,
                      }}
                      className="text-left px-1.5 py-0.5 flex flex-col transition-all hover:brightness-95"
                    >
                      <span style={{ fontSize: 10, fontWeight: 700, color: s.text, lineHeight: 1.3 }} className="truncate">
                        {b.guestName.split(',')[0]}
                      </span>
                      {height > 36 && (
                        <span style={{ fontSize: 9, color: s.text, opacity: 0.7 }} className="truncate">
                          {fmtTime(b.startTime)} · T{b.tableNumber} · {b.partySize}p
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── List view ────────────────────────────────────────────────────────────────

function ListView({ bookings, onSelect, selectedId, filter }: {
  bookings: Booking[];
  onSelect: (b: Booking) => void;
  selectedId: string | null;
  filter: string;
}) {
  const filtered = filter === 'all' ? bookings : bookings.filter(b => b.status === filter);
  const grouped  = useMemo(() => {
    const g: Record<string, Booking[]> = {};
    for (const b of [...filtered].sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime))) {
      if (!g[b.date]) g[b.date] = [];
      g[b.date].push(b);
    }
    return g;
  }, [filtered]);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex-1 overflow-y-auto">
      {Object.entries(grouped).map(([date, bs]) => {
        const d = new Date(date + 'T12:00:00');
        const isToday = date === today;
        const label = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <div key={date}>
            <div className={cn(
              'sticky top-0 z-10 px-4 py-2 flex items-center gap-3 border-b border-border text-xs font-semibold uppercase tracking-wider',
              isToday ? 'bg-primary/5 text-primary' : 'bg-gray-50 text-gray-500',
            )}>
              {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              {label}
              <span className="font-normal normal-case tracking-normal text-gray-400">{bs.length} bookings</span>
            </div>
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col className="w-24" />
                <col className="w-20" />
                <col />
                <col className="w-16" />
                <col className="w-16 hidden md:table-column" />
                <col className="w-28" />
              </colgroup>
              <thead>
                <tr className="border-b border-border/60 bg-muted/30">
                  <th className="py-2 pl-4 pr-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Time</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Table</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Guest</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Covers</th>
                  <th className="py-2 px-3 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 hidden md:table-cell">Duration</th>
                  <th className="py-2 px-3 pr-4 text-left text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60">Status</th>
                </tr>
              </thead>
              <tbody>
                {bs.map(b => {
                  const s = STATUS[b.status];
                  const isSelected = selectedId === b.id;
                  return (
                    <tr
                      key={b.id}
                      onClick={() => onSelect(b)}
                      className={cn(
                        'border-b border-border/50 cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-gray-50',
                      )}
                    >
                      {/* Time */}
                      <td className="py-3 pl-4 pr-3 text-gray-500 font-mono tabular-nums whitespace-nowrap">
                        {fmtTime(b.startTime)}
                      </td>
                      {/* Table */}
                      <td className="py-3 px-3">
                        <span className="font-semibold text-gray-700">T{b.tableNumber}</span>
                        <span className="block text-[10px] text-gray-400">{b.section}</span>
                      </td>
                      {/* Guest */}
                      <td className="py-3 px-3">
                        <span className="font-medium text-gray-800 truncate block">{b.guestName}</span>
                        {b.notes && <span className="block text-[10px] text-gray-400 truncate">{b.notes}</span>}
                      </td>
                      {/* Party */}
                      <td className="py-3 px-3">
                        <span className="flex items-center gap-1 text-gray-500">
                          <Users className="h-3 w-3 shrink-0" />
                          {b.partySize}
                        </span>
                      </td>
                      {/* Duration */}
                      <td className="py-3 px-3 text-gray-400 hidden md:table-cell">
                        {b.duration}m
                      </td>
                      {/* Status */}
                      <td className="py-3 px-3 pr-4">
                        <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border', s.chip)}>
                          {s.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })}
      {Object.keys(grouped).length === 0 && (
        <div className="flex flex-col items-center justify-center h-32 text-gray-400 text-sm">
          No bookings found
        </div>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function DetailPanel({ booking, onClose, onStatusChange, orderHistory, orderHistoryLoading, onDelete, deleteBusy }: {
  booking: Booking;
  onClose: () => void;
  onStatusChange: (id: string, s: BookingStatus) => void;
  orderHistory: BookingOrderHistoryItem[];
  orderHistoryLoading: boolean;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
  const s = STATUS[booking.status];
  const endMin = timeToMin(booking.startTime) + booking.duration;
  const endTime = `${Math.floor(endMin / 60).toString().padStart(2, '0')}:${(endMin % 60).toString().padStart(2, '0')}`;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between px-4 py-4 border-b border-border">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">{booking.guestName}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {new Date(booking.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              type="button"
              title="Delete booking"
              disabled={deleteBusy}
              onClick={onDelete}
              className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button type="button" onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status badge + picker */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-2">Status</label>
          <div className="grid grid-cols-2 gap-1">
            {(Object.keys(STATUS) as BookingStatus[]).map(st => {
              const ss = STATUS[st];
              const isActive = booking.status === st;
              return (
                <button
                  key={st}
                  onClick={() => onStatusChange(booking.id, st)}
                  className={cn(
                    'h-7 text-[11px] font-medium rounded-lg border flex items-center justify-center gap-1.5 transition-colors',
                    isActive ? '' : 'border-border text-gray-400 hover:bg-gray-50',
                  )}
                  style={isActive ? { background: ss.bg, borderColor: ss.border, color: ss.text } : {}}
                >
                  {isActive && <Check className="h-3 w-3" />}
                  {ss.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time */}
        <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3 space-y-2">
          <Row icon={<Clock className="h-3.5 w-3.5 text-gray-400" />} label="Time">
            {fmtTime(booking.startTime)} – {fmtTime(endTime)} ({booking.duration} min)
          </Row>
          <Row icon={<AlignLeft className="h-3.5 w-3.5 text-gray-400" />} label="Table">
            T{booking.tableNumber} · {booking.section}
          </Row>
          <Row icon={<Users className="h-3.5 w-3.5 text-gray-400" />} label="Party">
            {booking.partySize} guest{booking.partySize !== 1 ? 's' : ''}
          </Row>
        </div>

        {/* Contact */}
        {(booking.phone || booking.email) && (
          <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3 space-y-2">
            {booking.phone && (
              <Row icon={<Phone className="h-3.5 w-3.5 text-gray-400" />} label="Phone">
                <a href={`tel:${booking.phone}`} className="text-primary hover:underline">{booking.phone}</a>
              </Row>
            )}
            {booking.email && (
              <Row icon={<Mail className="h-3.5 w-3.5 text-gray-400" />} label="Email">
                <a href={`mailto:${booking.email}`} className="text-primary hover:underline truncate">{booking.email}</a>
              </Row>
            )}
          </div>
        )}

        {/* Notes */}
        {booking.notes && (
          <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3">
            <Row icon={<FileText className="h-3.5 w-3.5 text-gray-400" />} label="Notes">
              <span className="text-gray-600">{booking.notes}</span>
            </Row>
          </div>
        )}

        <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">Order history</div>
            <Receipt className="h-3.5 w-3.5 text-gray-400" />
          </div>
          {orderHistoryLoading ? (
            <div className="text-[11px] text-gray-500">Loading linked tickets...</div>
          ) : orderHistory.length === 0 ? (
            <div className="text-[11px] text-gray-500">No POS tickets linked for this booking/table date.</div>
          ) : (
            <div className="space-y-2">
              {orderHistory.map((order) => (
                <div key={order.id} className="rounded-lg border border-border bg-white px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-gray-800">{order.ticketRef ?? `Ticket ${order.id.slice(0, 8)}`}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded border border-border text-gray-600">{order.status}</span>
                  </div>
                  <div className="mt-1 text-[11px] text-gray-600">
                    {formatPounds(order.totalPence)} {order.paidAt ? `· Paid ${new Date(order.paidAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : '· Unpaid'}
                  </div>
                  <a
                    href={`/optimizers/pos?ticket=${order.id}`}
                    className="mt-1 inline-flex items-center gap-1 text-[10px] text-primary hover:underline"
                  >
                    Open in POS
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        {onDelete && (
          <button
            type="button"
            disabled={deleteBusy}
            onClick={onDelete}
            className="w-full h-9 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleteBusy ? 'Deleting…' : 'Delete booking'}
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span className="text-[10px] text-gray-400 w-10 shrink-0 mt-0.5">{label}</span>
      <span className="text-[12px] text-gray-700 min-w-0">{children}</span>
    </div>
  );
}

// ─── Day bookings pop-up (month view) ─────────────────────────────────────────

function DayBookingsModal({
  dateKey,
  bookings,
  onClose,
  onSelectBooking,
  onOpenWeekView,
}: {
  dateKey: string;
  bookings: Booking[];
  onClose: () => void;
  onSelectBooking: (b: Booking) => void;
  onOpenWeekView: (d: Date) => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const sorted = useMemo(
    () => [...bookings].sort((a, b) => a.startTime.localeCompare(b.startTime)),
    [bookings],
  );
  const label = useMemo(() => {
    const d = new Date(dateKey + 'T12:00:00');
    return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  }, [dateKey]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ paddingLeft: 'var(--sidebar-w, 0)', paddingTop: 56 }}
    >
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="day-bookings-title"
        className={cn(
          'relative bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-border transition-[width,height,max-width] duration-200',
          maximized
            ? 'w-[calc(100vw-var(--sidebar-w)-2rem)] h-[calc(100vh-4rem)] max-w-[1600px]'
            : 'w-[min(100%,440px)] max-h-[min(85vh,720px)]',
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-border">
          <div className="min-w-0 flex-1">
            <h2 id="day-bookings-title" className="text-[15px] font-semibold text-gray-900 truncate">
              {label}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {sorted.length} booking{sorted.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setMaximized((m) => !m)}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 shrink-0"
            title={maximized ? 'Restore size' : 'Maximize'}
            aria-label={maximized ? 'Restore size' : 'Maximize'}
          >
            {maximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </button>
          <button
            type="button"
            onClick={() => {
              onOpenWeekView(new Date(dateKey + 'T12:00:00'));
              onClose();
            }}
            className="inline-flex h-8 px-2 sm:px-2.5 rounded-lg text-[10px] sm:text-[11px] font-medium text-primary hover:bg-primary/10 shrink-0 items-center"
          >
            Week
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-8 w-8 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 shrink-0"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto min-h-0 p-3 space-y-2">
          {sorted.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No bookings on this day.</p>
          ) : (
            sorted.map((b) => {
              const s = STATUS[b.status];
              return (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    onSelectBooking(b);
                    onClose();
                  }}
                  className="w-full text-left rounded-xl border px-3 py-3 transition-all hover:brightness-[0.98] hover:shadow-sm"
                  style={{ background: s.bg, borderColor: s.border }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold" style={{ color: s.text }}>
                        {b.guestName}
                      </div>
                      <div className="text-[12px] text-gray-700 mt-1 font-mono tabular-nums">
                        {fmtTime(b.startTime)}
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">
                        Table {b.tableNumber} · {b.section} · {b.partySize} covers · {b.duration}m
                      </div>
                    </div>
                    <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border shrink-0', s.chip)}>
                      {s.label}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Add Booking Modal ─────────────────────────────────────────────────────────

function AddModal({
  onClose,
  onAdd,
  defaultDate,
  tableOptions,
  existingBookings,
}: {
  onClose: () => void;
  onAdd: (b: Booking) => void;
  defaultDate?: string;
  tableOptions: VenueTableOption[];
  existingBookings: Booking[];
}) {
  const [form, setForm] = useState({
    guestName: '', partySize: '2', date: defaultDate ?? new Date().toISOString().slice(0, 10),
    startTime: '19:00', duration: '90',
    tableNumber: tableOptions[0]?.number ?? '1',
    section: tableOptions[0]?.section ?? 'Main Floor',
    status: 'confirmed' as BookingStatus, notes: '', phone: '', email: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [activeField, setActiveField] = useState<string | null>(null);
  const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null>>({});
  const selectedTable = tableOptions.find((t) => t.number === form.tableNumber);
  const selectedStart = timeToMin(form.startTime);
  const selectedEnd = selectedStart + (Number(form.duration) || 90);
  const availableTables = tableOptions.filter((t) => !existingBookings.some((b) => {
    if (b.date !== form.date || b.tableNumber !== t.number) return false;
    if (b.status === 'cancelled' || b.status === 'no-show') return false;
    const bStart = timeToMin(b.startTime);
    const bEnd = bStart + b.duration;
    return selectedStart < bEnd && selectedEnd > bStart;
  }));

  function submit(e: FormEvent) {
    e.preventDefault();
    const nextErrors: Record<string, string> = {};
    if (!form.guestName.trim()) nextErrors.guestName = 'Guest name is required';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date)) nextErrors.date = 'Use YYYY-MM-DD';
    if (!/^\d{2}:\d{2}$/.test(form.startTime)) nextErrors.startTime = 'Use HH:MM';
    if (Number(form.partySize) < 1 || Number(form.partySize) > 30) nextErrors.partySize = 'Party size must be 1-30';
    if (Number(form.duration) < 30 || Number(form.duration) > 300) nextErrors.duration = 'Duration must be 30-300 mins';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) nextErrors.email = 'Invalid email address';
    if (!selectedTable) nextErrors.tableNumber = 'Choose an available table';
    if (selectedTable && Number(form.partySize) > selectedTable.capacity) nextErrors.partySize = `Capacity is ${selectedTable.capacity}`;
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;

    onAdd({
      id: `b_${Date.now()}`,
      guestName: form.guestName,
      partySize: Number(form.partySize),
      date: form.date,
      startTime: form.startTime,
      duration: Number(form.duration),
      tableNumber: form.tableNumber,
      section: form.section,
      status: form.status,
      notes: form.notes || undefined,
      phone: form.phone || undefined,
      email: form.email || undefined,
    });
    onClose();
  }

  const F = ({ label, children }: { label: string; children: ReactNode }) => (
    <div>
      <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">{label}</label>
      {children}
    </div>
  );

  const inputCls = 'w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50';

  useEffect(() => {
    if (!activeField) return;
    const el = fieldRefs.current[activeField];
    if (el && document.activeElement !== el) {
      el.focus({ preventScroll: true });
    }
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ paddingLeft: 'var(--sidebar-w, 0)', paddingTop: 56 }}>
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[440px] max-h-[90vh] flex flex-col overflow-hidden">
        <div className="shrink-0 flex items-center justify-between px-5 py-4 border-b border-border">
          <span className="text-[14px] font-semibold text-gray-900">New Booking</span>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          <F label="Guest name">
            <input
              ref={(el) => { fieldRefs.current.guestName = el; }}
              onFocus={() => setActiveField('guestName')}
              required
              value={form.guestName}
              onChange={e => setForm(f => ({ ...f, guestName: e.target.value }))}
              placeholder="Smith, John"
              className={inputCls}
            />
            {errors.guestName && <p className="text-[10px] text-red-600 mt-1">{errors.guestName}</p>}
          </F>
          <div className="grid grid-cols-2 gap-3">
            <F label="Date">
              <input ref={(el) => { fieldRefs.current.date = el; }} onFocus={() => setActiveField('date')} type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} className={inputCls} />
              {errors.date && <p className="text-[10px] text-red-600 mt-1">{errors.date}</p>}
            </F>
            <F label="Time">
              <input ref={(el) => { fieldRefs.current.startTime = el; }} onFocus={() => setActiveField('startTime')} type="time" value={form.startTime} onChange={e => setForm(f => ({ ...f, startTime: e.target.value }))} className={inputCls} />
              {errors.startTime && <p className="text-[10px] text-red-600 mt-1">{errors.startTime}</p>}
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Party size">
              <input ref={(el) => { fieldRefs.current.partySize = el; }} onFocus={() => setActiveField('partySize')} type="number" min={1} max={30} value={form.partySize} onChange={e => setForm(f => ({ ...f, partySize: e.target.value }))} className={inputCls} />
              {errors.partySize && <p className="text-[10px] text-red-600 mt-1">{errors.partySize}</p>}
            </F>
            <F label="Duration (min)">
              <input ref={(el) => { fieldRefs.current.duration = el; }} onFocus={() => setActiveField('duration')} type="number" min={30} max={300} step={15} value={form.duration} onChange={e => setForm(f => ({ ...f, duration: e.target.value }))} className={inputCls} />
              {errors.duration && <p className="text-[10px] text-red-600 mt-1">{errors.duration}</p>}
            </F>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <F label="Table #">
              <Select
                value={form.tableNumber}
                onValueChange={(value) => {
                  const t = tableOptions.find((opt) => opt.number === value);
                  setForm(f => ({ ...f, tableNumber: value, section: t?.section ?? f.section }));
                }}
              >
                <SelectTrigger className={inputCls}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {availableTables.map((t) => (
                    <SelectItem key={t.id} value={t.number}>
                      {`T${t.number} (${t.section}, ${t.capacity} seats)`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.tableNumber && <p className="text-[10px] text-red-600 mt-1">{errors.tableNumber}</p>}
            </F>
            <F label="Section">
              <input value={selectedTable?.section ?? form.section} readOnly className={inputCls} />
            </F>
          </div>
          {availableTables.length === 0 && (
            <p className="text-[10px] text-amber-700">No tables available for selected time.</p>
          )}
          <F label="Status">
            <Select value={form.status} onValueChange={(value) => setForm(f => ({ ...f, status: value as BookingStatus }))}>
              <SelectTrigger className={inputCls}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(STATUS) as BookingStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{STATUS[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </F>
          <F label="Phone">
            <input ref={(el) => { fieldRefs.current.phone = el; }} onFocus={() => setActiveField('phone')} value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+44 7700 900000" className={inputCls} />
          </F>
          <F label="Email">
            <input ref={(el) => { fieldRefs.current.email = el; }} onFocus={() => setActiveField('email')} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="guest@email.com" className={inputCls} />
            {errors.email && <p className="text-[10px] text-red-600 mt-1">{errors.email}</p>}
          </F>
          <F label="Notes">
            <textarea ref={(el) => { fieldRefs.current.notes = el; }} onFocus={() => setActiveField('notes')} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-gray-300" placeholder="Special requests…" />
          </F>
          <button type="submit" className="w-full h-9 bg-primary text-white rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
            Add Booking
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BookingDatabase() {
  const { id: venueId } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [view,        setView]        = useState<ViewMode>('month');
  const [bookings,    setBookings]    = useState<Booking[]>([]);
  const [selected,    setSelected]    = useState<Booking | null>(null);
  const [filter,      setFilter]      = useState('all');
  const [showAdd,     setShowAdd]     = useState(false);
  const [addDate,     setAddDate]     = useState<string | undefined>();
  const [weekCursor,  setWeekCursor]  = useState(() => startOfWeek(new Date()));
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tableOptions, setTableOptions] = useState<VenueTableOption[]>([]);
  const [needsRefreshAfterModal, setNeedsRefreshAfterModal] = useState(false);
  const [orderHistory, setOrderHistory] = useState<BookingOrderHistoryItem[]>([]);
  const [orderHistoryLoading, setOrderHistoryLoading] = useState(false);
  const [deleteBookingBusy, setDeleteBookingBusy] = useState(false);

  async function loadBookings(date?: string, opts?: { silent?: boolean }) {
    if (!venueId) return;
    if (!opts?.silent) {
      setLoading(true);
      setLoadError(null);
    }
    try {
      const resp = await bookingApi.bookingsByDate(venueId, date);
      const mapped: Booking[] = (resp.data.data ?? []).map((b: any) => ({
        id: b.id,
        tableNumber: b.tableNumber,
        section: b.section,
        guestName: b.guestName,
        partySize: b.partySize,
        date: b.bookingDate,
        startTime: b.startTime,
        duration: b.duration,
        status: b.status,
        notes: b.notes ?? undefined,
        phone: b.phone ?? undefined,
        email: b.email ?? undefined,
      }));
      setBookings(mapped);
    } catch (err) {
      console.error('[BookingDatabase] Failed to load bookings:', err);
      if (!opts?.silent) {
        setLoadError('Failed to load bookings — check your connection and try again');
      }
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }

  useEffect(() => { void loadBookings(); }, [venueId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    async function loadTables() {
      if (!venueId) return;
      try {
        const resp = await bookingApi.tables(venueId);
        const mapped: VenueTableOption[] = (resp.data.data ?? []).map((t: any) => ({
          id: t.id,
          number: t.number,
          section: t.section,
          capacity: t.capacity,
        }));
        setTableOptions(mapped);
      } catch (err) {
        console.error('[BookingDatabase] Failed to load table options:', err);
      }
    }
    void loadTables();
  }, [venueId]);

  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const handler = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) {
        if (showAdd) {
          setNeedsRefreshAfterModal(true);
          return;
        }
        void loadBookings(undefined, { silent: true });
      }
    };
    socket.on('bookings:updated', handler);
    const onPosChanged = (payload: { venueId?: string }) => {
      if (!selected || (payload?.venueId && payload.venueId !== venueId)) return;
      void loadOrderHistory(selected);
    };
    socket.on('pos:tickets_updated', onPosChanged);
    socket.on('pos:payments_updated', onPosChanged);
    return () => {
      socket.off('bookings:updated', handler);
      socket.off('pos:tickets_updated', onPosChanged);
      socket.off('pos:payments_updated', onPosChanged);
      leaveVenueRoom(venueId);
    };
  }, [venueId, showAdd, selected, accessToken]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!showAdd && needsRefreshAfterModal) {
      setNeedsRefreshAfterModal(false);
      void loadBookings(undefined, { silent: true });
    }
  }, [showAdd, needsRefreshAfterModal]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const todayBs = bookings.filter(b => b.date === today);
    return {
      total:   bookings.length,
      today:   todayBs.length,
      seated:  bookings.filter(b => b.status === 'seated').length,
      pending: bookings.filter(b => b.status === 'pending').length,
      covers:  todayBs.reduce((s, b) => s + b.partySize, 0),
    };
  }, [bookings]);

  async function handleStatusChange(id: string, status: BookingStatus) {
    setBookings(bs => bs.map(b => b.id === id ? { ...b, status } : b));
    setSelected(s => s?.id === id ? { ...s, status } : s);
    if (!venueId) return;
    try {
      await bookingApi.updateBooking(venueId, id, { status });
    } catch (err) {
      console.error('[BookingDatabase] Failed to update booking status:', err);
      void loadBookings();
    }
  }

  async function handleDeleteSelectedBooking() {
    if (!venueId || !selected) return;
    if (!window.confirm(`Delete booking for ${selected.guestName}? This cannot be undone.`)) return;
    setDeleteBookingBusy(true);
    try {
      await bookingApi.deleteBooking(venueId, selected.id);
      setBookings((bs) => bs.filter((b) => b.id !== selected.id));
      setSelected(null);
    } catch (err) {
      console.error('[BookingDatabase] Failed to delete booking:', err);
      window.alert('Failed to delete booking');
    } finally {
      setDeleteBookingBusy(false);
    }
  }

  async function loadOrderHistory(booking: Booking) {
    if (!venueId) return;
    setOrderHistoryLoading(true);
    try {
      const resp = await bookingApi.orderHistory(venueId, {
        date: booking.date,
        tableNumber: booking.tableNumber,
        bookingId: booking.id,
      });
      setOrderHistory(resp.data.data ?? []);
    } catch (err) {
      console.error('[BookingDatabase] Failed to load order history:', err);
      setOrderHistory([]);
    } finally {
      setOrderHistoryLoading(false);
    }
  }

  function handleDayClick(d: Date) {
    setDayModalDate(fmt(d));
  }

  const VIEWS: { v: ViewMode; icon: ReactNode; label: string }[] = [
    { v: 'month', icon: <Calendar className="h-3.5 w-3.5" />,     label: 'Month' },
    { v: 'week',  icon: <CalendarDays className="h-3.5 w-3.5" />, label: 'Week'  },
    { v: 'list',  icon: <List className="h-3.5 w-3.5" />,         label: 'List'  },
  ];

  const weekLabel = `${weekCursor.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(weekCursor, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  useEffect(() => {
    if (!selected) {
      setOrderHistory([]);
      return;
    }
    void loadOrderHistory(selected);
  }, [selected, venueId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Header ── */}
        <header className="shrink-0 border-b border-border px-4 py-3 bg-background">
          <div className="flex items-center gap-3 mb-3">
            <div>
              <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">Booking Database</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">All reservations — The Crown</p>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => { setAddDate(undefined); setShowAdd(true); }}
              className="flex items-center gap-1.5 h-8 px-3 bg-primary text-white text-xs font-medium rounded-lg hover:bg-primary/90 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              New booking
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mb-3">
            {[
              { label: "Today's bookings", value: String(stats.today), color: 'text-primary'        },
              { label: 'Covers today',     value: String(stats.covers), color: 'text-emerald-600'   },
              { label: 'Seated now',       value: String(stats.seated), color: 'text-green-600'     },
              { label: 'Pending confirm',  value: String(stats.pending), color: 'text-amber-600'    },
              { label: 'Total on record',  value: String(stats.total),  color: 'text-gray-500'      },
            ].map(({ label, value, color }) => (
              <div key={label} className="bg-white border border-border rounded-xl px-3 py-2 shadow-sm">
                <div className={cn('text-[16px] font-bold tabular-nums', color)}>{value}</div>
                <div className="text-[10px] text-gray-400 mt-0.5">{label}</div>
              </div>
            ))}
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* View toggle */}
            <div className="flex items-center gap-0.5 bg-secondary border border-border rounded-lg p-0.5">
              {VIEWS.map(({ v, icon, label }) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    'flex items-center gap-1.5 h-7 px-2.5 rounded-md text-xs font-medium transition-colors',
                    view === v ? 'bg-white text-primary shadow-sm' : 'text-gray-500 hover:text-gray-700',
                  )}
                >
                  {icon}{label}
                </button>
              ))}
            </div>

            {/* Week navigation */}
            {view === 'week' && (
              <div className="flex items-center gap-1 ml-2">
                <button onClick={() => setWeekCursor(d => addDays(d, -7))} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-xs text-gray-600 font-medium w-44 text-center">{weekLabel}</span>
                <button onClick={() => setWeekCursor(d => addDays(d, 7))}  className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors">
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex-1" />

            {/* Status filter (list view) */}
            {view === 'list' && (
              <div className="flex items-center gap-1">
                {['all', ...Object.keys(STATUS)].map(s => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={cn(
                      'h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors capitalize',
                      filter === s
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'border-border text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    {s === 'all' ? 'All' : STATUS[s as BookingStatus].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Calendar / list */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {loadError && (
              <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50">
                {loadError} (showing fallback data)
              </div>
            )}
            {loading ? (
              <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                Loading bookings...
              </div>
            ) : (
              <>
            {view === 'month' && (
              <MonthView
                bookings={bookings}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                onDayClick={handleDayClick}
              />
            )}
            {view === 'week' && (
              <WeekView
                bookings={bookings}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                weekStart={weekCursor}
              />
            )}
            {view === 'list' && (
              <ListView
                bookings={bookings}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                filter={filter}
              />
            )}
              </>
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="shrink-0 w-64 border-l border-border bg-white overflow-hidden flex flex-col">
              <DetailPanel
                booking={selected}
                onClose={() => setSelected(null)}
                onStatusChange={handleStatusChange}
                orderHistory={orderHistory}
                orderHistoryLoading={orderHistoryLoading}
                onDelete={venueId ? () => void handleDeleteSelectedBooking() : undefined}
                deleteBusy={deleteBookingBusy}
              />
            </div>
          )}
        </div>
      </div>

      {/* Day list pop-up (month grid) */}
      {dayModalDate && (
        <DayBookingsModal
          key={dayModalDate}
          dateKey={dayModalDate}
          bookings={bookings.filter((b) => b.date === dayModalDate)}
          onClose={() => setDayModalDate(null)}
          onSelectBooking={setSelected}
          onOpenWeekView={(d) => {
            setWeekCursor(startOfWeek(d));
            setView('week');
          }}
        />
      )}

      {/* Add modal */}
      {showAdd && (
        <AddModal
          onClose={() => setShowAdd(false)}
          tableOptions={tableOptions}
          existingBookings={bookings}
          onAdd={async (b) => {
            if (!venueId) { setBookings(bs => [...bs, b]); return; }
            try {
              const resp = await bookingApi.createBooking(venueId, {
                tableId: tableOptions.find((t) => t.number === b.tableNumber)?.id ?? null,
                tableNumber: b.tableNumber,
                section: b.section,
                guestName: b.guestName,
                partySize: b.partySize,
                bookingDate: b.date,
                startTime: b.startTime,
                duration: b.duration,
                status: b.status,
                notes: b.notes ?? null,
                phone: b.phone ?? null,
                email: b.email ?? null,
              });
              const created = resp.data.data;
              setBookings(bs => [...bs, {
                id: created.id,
                tableNumber: created.tableNumber,
                section: created.section,
                guestName: created.guestName,
                partySize: created.partySize,
                date: created.bookingDate,
                startTime: created.startTime,
                duration: created.duration,
                status: created.status,
                notes: created.notes ?? undefined,
                phone: created.phone ?? undefined,
                email: created.email ?? undefined,
              }]);
            } catch (err) {
              console.error('[BookingDatabase] Failed to create booking:', err);
              setLoadError('Failed to create booking');
            }
          }}
          defaultDate={addDate}
        />
      )}
    </AppLayout>
  );
}
