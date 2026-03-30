import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { useInventoryStore, deriveStatus } from '@/store/inventoryStore';
import { mergeInventorySectionNames } from '@/lib/inventorySectionNames';
import { useParams } from 'react-router-dom';
import { inventoryApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ChevronLeft, ChevronRight, Calendar, List, X,
  AlertTriangle, CheckCircle2, Package, Plus,
  Maximize2, Minimize2, Trash2,
} from 'lucide-react';

// ─── Status derivation (maps store status → database InvStatus) ───────────────
// The database additionally distinguishes "critical" (< 40% of par) from "low".

function deriveInvStatus(onHand: number, parLevel: number): InvStatus {
  if (parLevel === 0) return 'ok';
  const ratio = onHand / parLevel;
  if (ratio < 0.4) return 'critical';
  const base = deriveStatus(onHand, parLevel);
  if (base === 'low') return 'low';
  return 'ok'; // 'ok' and 'high' both map to healthy in the database view
}

// ─── Types ────────────────────────────────────────────────────────────────────

type InvStatus = 'critical' | 'low' | 'ok';
type ViewMode  = 'month' | 'list';

interface InvEvent {
  id: string;
  productName: string;
  section: string;
  date: string;       // YYYY-MM-DD
  onHand: number;
  parLevel: number;
  status: InvStatus;
  unit: string;
  notes?: string;
}

// ─── Status styles ─────────────────────────────────────────────────────────────

const INV_STATUS: Record<InvStatus, { bg: string; border: string; text: string; dot: string; label: string; chip: string }> = {
  critical: { bg: '#fef2f2', border: '#fca5a5', text: '#b91c1c', dot: '#ef4444', label: 'Critical', chip: 'bg-red-50 text-red-700 border-red-200'     },
  low:      { bg: '#fffbeb', border: '#fcd34d', text: '#92400e', dot: '#f59e0b', label: 'Low',      chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  ok:       { bg: '#f0fdf4', border: '#86efac', text: '#15803d', dot: '#22c55e', label: 'Healthy',  chip: 'bg-green-50 text-green-700 border-green-200'  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (d: Date) => d.toISOString().slice(0, 10);

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}

// ─── Sort inventory events for a day (critical → low → ok, then name) ──────────

function sortInvEventsForDay(events: InvEvent[]): InvEvent[] {
  const order: Record<InvStatus, number> = { critical: 0, low: 1, ok: 2 };
  return [...events].sort(
    (a, b) => order[a.status] - order[b.status] || a.productName.localeCompare(b.productName),
  );
}

// ─── Day events pop-up (month view) ───────────────────────────────────────────

function DayInventoryEventsModal({
  dateKey,
  events,
  onClose,
  onSelectEvent,
  onOpenListView,
}: {
  dateKey: string;
  events: InvEvent[];
  onClose: () => void;
  onSelectEvent: (e: InvEvent) => void;
  onOpenListView: () => void;
}) {
  const [maximized, setMaximized] = useState(false);
  const sorted = useMemo(() => sortInvEventsForDay(events), [events]);
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
        aria-labelledby="day-inventory-title"
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
            <h2 id="day-inventory-title" className="text-[15px] font-semibold text-gray-900 truncate">
              {label}
            </h2>
            <p className="text-[11px] text-gray-400 mt-0.5">
              {sorted.length} stock event{sorted.length !== 1 ? 's' : ''}
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
              onOpenListView();
              onClose();
            }}
            className="inline-flex h-8 px-2 sm:px-2.5 rounded-lg text-[10px] sm:text-[11px] font-medium text-primary hover:bg-primary/10 shrink-0 items-center"
          >
            List
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
            <p className="text-sm text-gray-400 text-center py-8">No inventory events on this day.</p>
          ) : (
            sorted.map((ev) => {
              const s = INV_STATUS[ev.status];
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={() => {
                    onSelectEvent(ev);
                    onClose();
                  }}
                  className="w-full text-left rounded-xl border px-3 py-3 transition-all hover:brightness-[0.98] hover:shadow-sm"
                  style={{ background: s.bg, borderColor: s.border }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-semibold" style={{ color: s.text }}>
                        {ev.productName}
                      </div>
                      <div className="text-[12px] text-gray-700 mt-1">
                        <span className="font-mono tabular-nums font-semibold">{ev.onHand}</span>
                        <span className="text-gray-400"> / </span>
                        <span className="font-mono tabular-nums">{ev.parLevel}</span>
                        <span className="text-gray-500 text-[11px] ml-1">{ev.unit}</span>
                      </div>
                      <div className="text-[11px] text-gray-600 mt-0.5">{ev.section}</div>
                      {ev.notes && (
                        <div className="text-[11px] text-gray-500 mt-1 line-clamp-2">{ev.notes}</div>
                      )}
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

// ─── Month view ───────────────────────────────────────────────────────────────

function MonthView({ events, onSelect, selectedId, onDayClick }: {
  events: InvEvent[];
  onSelect: (e: InvEvent) => void;
  selectedId: string | null;
  onDayClick: (d: Date) => void;
}) {
  const today  = TODAY;
  const now    = new Date();
  const [cursor, setCursor] = useState(new Date(now.getFullYear(), now.getMonth(), 1));

  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);

  const startOffset = (firstDay.getDay() + 6) % 7;
  const cells: Date[] = [];
  for (let i = 0; i < startOffset; i++) cells.push(addDays(firstDay, -(startOffset - i)));
  for (let i = 1; i <= lastDay.getDate(); i++) cells.push(new Date(year, month, i));
  while (cells.length % 7) cells.push(addDays(cells[cells.length - 1], 1));

  const byDay = useMemo(() => {
    const m: Record<string, InvEvent[]> = {};
    for (const e of events) {
      if (!m[e.date]) m[e.date] = [];
      m[e.date].push(e);
    }
    return m;
  }, [events]);

  const monthName = cursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

  return (
    <div className="flex flex-col h-full">
      {/* Month nav */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border">
        <button
          onClick={() => setCursor(new Date(year, month - 1, 1))}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <span className="text-[13px] font-semibold text-gray-700 w-36 text-center">{monthName}</span>
        <button
          onClick={() => setCursor(new Date(year, month + 1, 1))}
          className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-500 transition-colors"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {/* Legend */}
        <div className="ml-4 flex items-center gap-3 text-[10px] text-gray-400">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Critical</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Low</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 inline-block" />Healthy</span>
        </div>
      </div>

      {/* Day headers */}
      <div className="shrink-0 grid grid-cols-7 border-b border-border">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400 uppercase tracking-wider">{d}</div>
        ))}
      </div>

      {/* Cells */}
      <div className="flex-1 grid grid-cols-7 auto-rows-fr overflow-hidden">
        {cells.map((day, i) => {
          const ds = fmt(day);
          const isCurrentMonth = day.getMonth() === month;
          const isToday  = ds === today;
          const dayEvents = sortInvEventsForDay(byDay[ds] ?? []);
          const hasCritical = dayEvents.some((e) => e.status === 'critical');
          const hasLow      = !hasCritical && dayEvents.some((e) => e.status === 'low');

          return (
            <div
              key={i}
              className={cn(
                'border-b border-r border-border flex flex-col min-h-0',
                isCurrentMonth ? 'bg-white' : 'bg-gray-50/30',
              )}
            >
              {/* Day number — click opens full-day list */}
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
                {isCurrentMonth && (hasCritical || hasLow) && (
                  <span className={cn(
                    'ml-1 w-1.5 h-1.5 rounded-full shrink-0',
                    hasCritical ? 'bg-red-500' : 'bg-amber-400',
                  )} />
                )}
                {dayEvents.length > 0 && isCurrentMonth && (
                  <span className="ml-auto text-[9px] text-gray-400 pr-0.5">{dayEvents.length}</span>
                )}
              </div>

              {/* Scrollable event list */}
              {isCurrentMonth && (
                <div className="flex-1 overflow-y-auto min-h-0 px-1 pb-1 space-y-0.5 scrollbar-thin">
                  {dayEvents.map((ev) => {
                    const s = INV_STATUS[ev.status];
                    return (
                      <button
                        key={ev.id}
                        onClick={(e) => { e.stopPropagation(); onSelect(ev); }}
                        className={cn(
                          'w-full text-left text-[10px] rounded px-1.5 py-0.5 truncate font-medium border transition-all hover:brightness-95',
                          selectedId === ev.id ? 'ring-1 ring-primary ring-offset-0' : '',
                        )}
                        style={{ background: s.bg, borderColor: s.border, color: s.text }}
                      >
                        {ev.productName} · {ev.onHand}/{ev.parLevel}
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

// ─── List view ─────────────────────────────────────────────────────────────────

function ListView({ events, onSelect, selectedId, filter }: {
  events: InvEvent[];
  onSelect: (e: InvEvent) => void;
  selectedId: string | null;
  filter: string;
}) {
  const filtered = filter === 'all' ? events : events.filter((e) => e.status === filter);

  const grouped = useMemo(() => {
    const g: Record<string, InvEvent[]> = {};
    for (const ev of [...filtered].sort((a, b) => a.date.localeCompare(b.date))) {
      if (!g[ev.date]) g[ev.date] = [];
      g[ev.date].push(ev);
    }
    return g;
  }, [filtered]);

  return (
    <div className="flex-1 overflow-y-auto">
      {Object.entries(grouped).map(([date, evs]) => {
        const d = new Date(date + 'T12:00:00');
        const isToday = date === TODAY;
        const label   = d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
        return (
          <div key={date}>
            <div className={cn(
              'sticky top-0 z-10 px-4 py-2 flex items-center gap-3 border-b border-border text-xs font-semibold uppercase tracking-wider',
              isToday ? 'bg-primary/5 text-primary' : 'bg-gray-50 text-gray-500',
            )}>
              {isToday && <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />}
              {label}
              <span className="font-normal normal-case tracking-normal text-gray-400">
                {evs.length} event{evs.length !== 1 ? 's' : ''}
              </span>
            </div>
            <table className="w-full text-xs table-fixed">
              <colgroup>
                <col />                             {/* product — takes remaining space */}
                <col style={{ width: 220 }} />     {/* bar + number */}
                <col style={{ width: 180 }} />     {/* notes */}
                <col style={{ width: 100 }} />     {/* status */}
              </colgroup>
              <tbody>
                {evs.map((ev) => {
                  const s = INV_STATUS[ev.status];
                  const isSelected = selectedId === ev.id;
                  const fillPct = Math.min(100, Math.round((ev.onHand / ev.parLevel) * 100));
                  return (
                    <tr
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      className={cn(
                        'border-b border-border/50 cursor-pointer transition-colors',
                        isSelected ? 'bg-primary/5' : 'hover:bg-gray-50',
                      )}
                    >
                      {/* Product */}
                      <td className="py-3 pl-4 pr-3">
                        <span className="font-medium text-gray-700 truncate block">{ev.productName}</span>
                        <span className="block text-[10px] text-gray-400">{ev.section}</span>
                      </td>
                      {/* Stock level */}
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                            <div
                              className={cn('h-full rounded-full', {
                                'bg-red-400':     ev.status === 'critical',
                                'bg-amber-400':   ev.status === 'low',
                                'bg-emerald-400': ev.status === 'ok',
                              })}
                              style={{ width: `${fillPct}%` }}
                            />
                          </div>
                          <span className="text-gray-500 tabular-nums font-mono shrink-0 w-14 text-right">
                            {ev.onHand}/{ev.parLevel}
                          </span>
                        </div>
                        <span className="block text-[10px] text-gray-400 mt-0.5">{ev.unit}</span>
                      </td>
                      {/* Notes */}
                      <td className="py-3 px-3 text-gray-400 text-[10px] hidden md:table-cell truncate">
                        {ev.notes ?? ''}
                      </td>
                      {/* Status */}
                      <td className="py-3 px-3 pr-4">
                        <span className={cn('text-[10px] font-semibold rounded-full px-2 py-0.5 border whitespace-nowrap', s.chip)}>
                          {ev.status === 'ok'
                            ? <CheckCircle2 className="h-2.5 w-2.5 inline mr-1" />
                            : <AlertTriangle className="h-2.5 w-2.5 inline mr-1" />
                          }
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
          No events found
        </div>
      )}
    </div>
  );
}

// ─── Detail panel ─────────────────────────────────────────────────────────────

function liveInventoryItemId(ev: InvEvent): string | null {
  return ev.id.startsWith('live-') ? ev.id.slice(5) : null;
}

function DetailPanel({ event: ev, onClose, onDeleteItem, deleteBusy }: {
  event: InvEvent;
  onClose: () => void;
  onDeleteItem?: (itemId: string) => void;
  deleteBusy?: boolean;
}) {
  const s = INV_STATUS[ev.status];
  const fillPct = Math.min(100, Math.round((ev.onHand / ev.parLevel) * 100));
  const backendItemId = liveInventoryItemId(ev);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between px-4 py-4 border-b border-border">
        <div>
          <h3 className="text-[14px] font-semibold text-gray-900">{ev.productName}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">
            {new Date(ev.date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {backendItemId && onDeleteItem && (
            <button
              type="button"
              title="Remove from inventory"
              disabled={deleteBusy}
              onClick={() => onDeleteItem(backendItemId)}
              className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Status badge */}
        <span className={cn('inline-flex items-center gap-1.5 text-[11px] font-semibold rounded-full px-3 py-1 border', s.chip)}>
          {ev.status === 'ok'
            ? <CheckCircle2 className="h-3 w-3" />
            : <AlertTriangle className="h-3 w-3" />
          }
          {s.label}
        </span>

        {/* Stock level bar */}
        <div>
          <div className="flex items-center justify-between mb-1.5 text-xs">
            <span className="text-gray-500">Stock level</span>
            <span className="font-semibold text-gray-800 tabular-nums">
              {ev.onHand} / {ev.parLevel} {ev.unit}
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', {
                'bg-red-400':     ev.status === 'critical',
                'bg-amber-400':   ev.status === 'low',
                'bg-emerald-400': ev.status === 'ok',
              })}
              style={{ width: `${fillPct}%` }}
            />
          </div>
          <p className="text-[10px] text-gray-400 mt-1">{fillPct}% of par level</p>
        </div>

        {/* Details grid */}
        <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3 space-y-2.5">
          <PanelRow label="Section">{ev.section}</PanelRow>
          <PanelRow label="Unit">{ev.unit}</PanelRow>
          <PanelRow label="On hand"><span className="font-semibold">{ev.onHand}</span></PanelRow>
          <PanelRow label="Par level">{ev.parLevel}</PanelRow>
          <PanelRow label="Deficit">
            {ev.onHand < ev.parLevel
              ? <span className="text-red-600 font-semibold">−{ev.parLevel - ev.onHand} needed</span>
              : <span className="text-emerald-600">At or above par</span>
            }
          </PanelRow>
        </div>

        {ev.notes && (
          <div className="rounded-xl border border-border bg-gray-50/50 px-3 py-3">
            <PanelRow label="Notes"><span className="text-gray-600">{ev.notes}</span></PanelRow>
          </div>
        )}

        {backendItemId && onDeleteItem && (
          <button
            type="button"
            disabled={deleteBusy}
            onClick={() => onDeleteItem(backendItemId)}
            className="w-full h-9 rounded-lg border border-red-200 text-xs font-medium text-red-700 hover:bg-red-50 transition-colors disabled:opacity-50"
          >
            {deleteBusy ? 'Deleting…' : 'Delete item from inventory'}
          </button>
        )}
      </div>
    </div>
  );
}

function PanelRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-[10px] text-gray-400 w-16 shrink-0 mt-0.5">{label}</span>
      <span className="text-[12px] text-gray-700 min-w-0">{children}</span>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const TODAY = new Date().toISOString().slice(0, 10);

export default function InventoryDatabase() {
  const { id: venueId } = useParams<{ id: string }>();
  const accessToken = useAuthStore((s) => s.accessToken);
  const [view,     setView]     = useState<ViewMode>('month');
  const [selected, setSelected] = useState<InvEvent | null>(null);
  const [filter,   setFilter]   = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [dayModalDate, setDayModalDate] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [addForm, setAddForm] = useState({
    name: '',
    category: '',
    unit: '',
    onHand: '0',
    parLevel: '0',
    unitCost: '0.00',
    velocity: '0',
  });
  const [deleteBusy, setDeleteBusy] = useState(false);

  // All store items → today's snapshot (every item, not just below-par)
  const storeItems = useInventoryStore((s) => s.items);
  const setItems = useInventoryStore((s) => s.setItems);

  function mapInventoryResponse(resp: any) {
    return (resp.data.data ?? []).map((it: any) => ({
      id: it.id,
      name: it.name,
      category: it.category,
      onHand: it.onHand,
      parLevel: it.parLevel,
      unit: it.unit,
      unitCostPence: it.unitCostPence,
      velocityPerNight: Number(it.velocityPerNight),
      status: it.liveAvailabilityStatus === 'critical'
        ? 'low'
        : it.liveAvailabilityStatus === 'low'
          ? 'low'
          : deriveStatus(it.onHand, it.parLevel),
    }));
  }

  const refreshInventory = useCallback(async () => {
    if (!venueId) return;
    try {
      const resp = await inventoryApi.list(venueId, TODAY);
      const items = mapInventoryResponse(resp);
      setItems(items);
      const sectionsResp = await inventoryApi.sections(venueId);
      const apiNames = (sectionsResp.data.data ?? []).map((s: any) => s.name).filter(Boolean);
      const itemCats = items.map((it: { category: string }) => it.category).filter(Boolean);
      const merged = mergeInventorySectionNames(apiNames, itemCats);
      setSections(merged);
      setAddForm((f) => {
        const cat = f.category.trim();
        if (cat && merged.includes(cat)) return f;
        return { ...f, category: merged[0] ?? '' };
      });
    } catch (err) {
      console.error('[InventoryDatabase] Failed to refresh inventory:', err);
    }
  }, [venueId]);

  useEffect(() => {
    void refreshInventory();
  }, [refreshInventory]);
  useEffect(() => {
    if (showAddModal && venueId) void refreshInventory();
  }, [showAddModal, venueId, refreshInventory]);
  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const refresh = async () => {
      await refreshInventory();
    };
    const handler = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) void refresh();
    };
    socket.on('inventory:updated', handler);
    socket.on('bookings:updated', handler);
    const poll = window.setInterval(() => void refresh(), 20000);
    return () => {
      window.clearInterval(poll);
      socket.off('inventory:updated', handler);
      socket.off('bookings:updated', handler);
      leaveVenueRoom(venueId);
    };
  }, [venueId, accessToken, refreshInventory]);
  const todayEvents = useMemo<InvEvent[]>(() =>
    storeItems.map((item) => ({
      id:          `live-${item.id}`,
      productName: item.name,
      section:     item.category,
      date:        TODAY,
      onHand:      item.onHand,
      parLevel:    item.parLevel,
      status:      deriveInvStatus(item.onHand, item.parLevel),
      unit:        item.unit,
    })),
    [storeItems],
  );

  // Live snapshot for today only (no demo seed). Backend has no per-day history table yet.
  const stats = useMemo(() => ({
    total:    todayEvents.length,
    critical: todayEvents.filter((e) => e.status === 'critical').length,
    low:      todayEvents.filter((e) => e.status === 'low').length,
    ok:       todayEvents.filter((e) => e.status === 'ok').length,
    today:    todayEvents.filter((e) => e.date === TODAY).length,
  }), [todayEvents]);

  const VIEWS: { v: ViewMode; icon: ReactNode; label: string }[] = [
    { v: 'month', icon: <Calendar className="h-3.5 w-3.5" />, label: 'Month' },
    { v: 'list',  icon: <List     className="h-3.5 w-3.5" />, label: 'List'  },
  ];

  function handleDayClick(d: Date) {
    setDayModalDate(fmt(d));
  }

  async function handleCreateInventoryItem() {
    if (!venueId) return;
    setAddError(null);
    const onHand = Math.max(0, Number(addForm.onHand) || 0);
    const parLevel = Math.max(0, Number(addForm.parLevel) || 0);
    const velocity = Math.max(0, Number(addForm.velocity) || 0);
    const unitCostPence = Math.round((Number(addForm.unitCost) || 0) * 100);

    if (!addForm.name.trim()) {
      setAddError('Item name is required');
      return;
    }
    if (!addForm.category.trim()) {
      setAddError('Section is required');
      return;
    }
    if (!addForm.unit.trim()) {
      setAddError('Unit is required');
      return;
    }

    try {
      await inventoryApi.create(venueId, {
        name: addForm.name.trim(),
        category: addForm.category.trim(),
        unit: addForm.unit.trim(),
        onHand,
        parLevel,
        unitCostPence,
        velocityPerNight: velocity,
        status: deriveStatus(onHand, parLevel),
      });
      setShowAddModal(false);
      setAddForm({
        name: '',
        category: sections[0] ?? '',
        unit: '',
        onHand: '0',
        parLevel: '0',
        unitCost: '0.00',
        velocity: '0',
      });
      await refreshInventory();
    } catch (err: any) {
      setAddError(err?.response?.data?.error ?? 'Failed to create inventory item');
    }
  }

  async function handleDeleteInventoryItem(itemId: string) {
    if (!venueId) return;
    if (!window.confirm('Delete this item from inventory? This cannot be undone.')) return;
    setDeleteBusy(true);
    try {
      await inventoryApi.remove(venueId, itemId);
      setSelected(null);
      await refreshInventory();
    } catch (err: any) {
      window.alert(err?.response?.data?.error ?? 'Failed to delete item');
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Header ── */}
        <header className="shrink-0 border-b border-border px-4 py-3 bg-background">
          <div className="flex items-center gap-3 mb-3">
            <div>
              <h1 className="text-[15px] font-bold text-gray-900 tracking-tight">Inventory Database</h1>
              <p className="text-[11px] text-gray-400 mt-0.5">Stock events &amp; status log · Restaurant &amp; Bar</p>
            </div>
            <div className="flex-1" />
            <button
              onClick={() => {
                setAddError(null);
                setShowAddModal(true);
              }}
              className="h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-3 mb-3">
            {[
              { label: "Today's events",  value: String(stats.today),    color: 'text-primary'     },
              { label: 'Critical',        value: String(stats.critical), color: 'text-red-600'     },
              { label: 'Low stock',       value: String(stats.low),      color: 'text-amber-600'   },
              { label: 'Healthy',         value: String(stats.ok),       color: 'text-emerald-600' },
              { label: 'Total on record', value: String(stats.total),    color: 'text-gray-500'    },
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

            <div className="flex-1" />

            {/* Status filter (list view only) */}
            {view === 'list' && (
              <div className="flex items-center gap-1">
                {(['all', 'critical', 'low', 'ok'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={cn(
                      'h-7 px-2.5 rounded-lg text-[11px] font-medium border transition-colors',
                      filter === s
                        ? 'bg-primary/10 border-primary/20 text-primary'
                        : 'border-border text-gray-500 hover:bg-gray-50',
                    )}
                  >
                    {s === 'all' ? 'All' : INV_STATUS[s].label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Main view */}
          <div className="flex-1 overflow-hidden flex flex-col min-w-0">
            {view === 'month' && (
              <MonthView
                events={todayEvents}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                onDayClick={handleDayClick}
              />
            )}
            {view === 'list' && (
              <ListView
                events={todayEvents}
                onSelect={setSelected}
                selectedId={selected?.id ?? null}
                filter={filter}
              />
            )}
          </div>

          {/* Detail panel */}
          {selected && (
            <div className="shrink-0 w-64 border-l border-border bg-white overflow-hidden flex flex-col">
              <DetailPanel
                event={selected}
                onClose={() => setSelected(null)}
                onDeleteItem={venueId ? (id) => void handleDeleteInventoryItem(id) : undefined}
                deleteBusy={deleteBusy}
              />
            </div>
          )}
        </div>

      </div>

      {dayModalDate && (
        <DayInventoryEventsModal
          key={dayModalDate}
          dateKey={dayModalDate}
          events={todayEvents.filter((e) => e.date === dayModalDate)}
          onClose={() => setDayModalDate(null)}
          onSelectEvent={setSelected}
          onOpenListView={() => setView('list')}
        />
      )}

      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white border border-border shadow-xl overflow-hidden">
            <div className="h-12 border-b border-border px-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Add Inventory Item</h3>
              <button onClick={() => setShowAddModal(false)} className="h-7 w-7 rounded-lg hover:bg-gray-100 inline-flex items-center justify-center">
                <X className="h-4 w-4 text-gray-500" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              {addError && <p className="text-xs text-red-600">{addError}</p>}
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Item name</label>
                <input className="w-full h-9 text-sm border rounded-lg px-3" value={addForm.name} onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))} />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Section</label>
                <Select value={addForm.category || '__none__'} onValueChange={(v) => setAddForm((f) => ({ ...f, category: v === '__none__' ? '' : v }))}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Select section</SelectItem>
                    {sections.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">On hand</label>
                  <input type="number" min={0} className="w-full h-9 text-sm border rounded-lg px-3" value={addForm.onHand} onChange={(e) => setAddForm((f) => ({ ...f, onHand: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Par level</label>
                  <input type="number" min={0} className="w-full h-9 text-sm border rounded-lg px-3" value={addForm.parLevel} onChange={(e) => setAddForm((f) => ({ ...f, parLevel: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Unit</label>
                  <input className="w-full h-9 text-sm border rounded-lg px-3" placeholder="e.g. bottle" value={addForm.unit} onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))} />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Unit cost (£)</label>
                  <input type="number" step="0.01" min={0} className="w-full h-9 text-sm border rounded-lg px-3" value={addForm.unitCost} onChange={(e) => setAddForm((f) => ({ ...f, unitCost: e.target.value }))} />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">Nightly usage</label>
                <input type="number" step="0.1" min={0} className="w-full h-9 text-sm border rounded-lg px-3" value={addForm.velocity} onChange={(e) => setAddForm((f) => ({ ...f, velocity: e.target.value }))} />
              </div>
            </div>
            <div className="h-12 border-t border-border px-4 flex items-center gap-2">
              <button onClick={() => setShowAddModal(false)} className="flex-1 h-8 border rounded-lg text-xs">Cancel</button>
              <button onClick={() => void handleCreateInventoryItem()} className="flex-1 h-8 bg-primary text-white rounded-lg text-xs font-semibold">Add item</button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
