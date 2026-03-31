import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { floorStorageKey } from '@/lib/bookingFloorStorage';
import {
  Trash2, Save, Undo2, Redo2, Type, Users, Plus,
  Grid3X3, Circle, Square, RectangleHorizontal, Minus,
  Check, X, Pencil, Eraser, Link2, Unlink2, Zap, Copy, UserCheck,
  FileText, ArrowUpRight,
} from 'lucide-react';

// ─── Align icons (inline SVG) ──────────────────────────────────────────────────
const IconAlignLeft    = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="1.5" height="12" fill="currentColor" rx="0.5"/><rect x="3" y="2.5" width="5" height="3" fill="currentColor" rx="1" opacity="0.65"/><rect x="3" y="8.5" width="9" height="3" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconAlignRight   = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="11.5" y="1" width="1.5" height="12" fill="currentColor" rx="0.5"/><rect x="6" y="2.5" width="5" height="3" fill="currentColor" rx="1" opacity="0.65"/><rect x="2" y="8.5" width="9" height="3" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconAlignCenterH = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="6.25" y="1" width="1.5" height="12" fill="currentColor" rx="0.5"/><rect x="3.5" y="2.5" width="7" height="3" fill="currentColor" rx="1" opacity="0.65"/><rect x="2" y="8.5" width="10" height="3" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconAlignTop     = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="1" width="12" height="1.5" fill="currentColor" rx="0.5"/><rect x="2.5" y="3" width="3" height="5" fill="currentColor" rx="1" opacity="0.65"/><rect x="8.5" y="3" width="3" height="9" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconAlignBottom  = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="11.5" width="12" height="1.5" fill="currentColor" rx="0.5"/><rect x="2.5" y="6" width="3" height="5" fill="currentColor" rx="1" opacity="0.65"/><rect x="8.5" y="2" width="3" height="9" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconAlignCenterV = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="6.25" width="12" height="1.5" fill="currentColor" rx="0.5"/><rect x="2.5" y="3.5" width="3" height="7" fill="currentColor" rx="1" opacity="0.65"/><rect x="8.5" y="2" width="3" height="10" fill="currentColor" rx="1" opacity="0.65"/></svg>;
const IconDistributeH  = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="0.5" y="1" width="1.5" height="12" fill="currentColor" rx="0.5"/><rect x="12" y="1" width="1.5" height="12" fill="currentColor" rx="0.5"/><rect x="5" y="4" width="4" height="6" fill="currentColor" rx="1" opacity="0.5"/></svg>;
const IconDistributeV  = () => <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="0.5" width="12" height="1.5" fill="currentColor" rx="0.5"/><rect x="1" y="12" width="12" height="1.5" fill="currentColor" rx="0.5"/><rect x="4" y="5" width="6" height="4" fill="currentColor" rx="1" opacity="0.5"/></svg>;

// ─── Types ───────────────────────────────────────────────────────────────────

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';
export type TableShape  = 'round' | 'square' | 'rect-h' | 'rect-v';

export interface FPTable {
  id: string;
  number: string;
  section: string;
  capacity: number;
  shape: TableShape;
  x: number;
  y: number;
  w?: number;
  h?: number;
  status: TableStatus;
  autoStatus?: boolean;
  cleaningStartedAt?: string;
  color?: string;
  guestName?: string;
  partySize?: number;
  /** ISO date YYYY-MM-DD for the reservation (defaults to venue “tonight” in parent) */
  bookingDate?: string;
  bookingTime?: string;
  seatedAt?: string;
  notes?: string;
  joinedWith?: string[];
}

export interface FPSection {
  id: string;
  label: string;
  x: number;
  y: number;
}

export interface TableOrderInfo {
  orderId: string;
  ticketRef?: string | null;
  totalPence: number;
  status: string;
  items: Array<{ name: string; qty: number; unitPricePence: number }>;
  source?: 'order' | 'pos';
}

// ─── Constants ───────────────────────────────────────────────────────────────

export const TABLE_SIZE: Record<TableShape, { w: number; h: number }> = {
  round:    { w: 80,  h: 80  },
  square:   { w: 90,  h: 90  },
  'rect-h': { w: 160, h: 80  },
  'rect-v': { w: 80,  h: 160 },
};

const GRID      = 20;
const CANVAS_W  = 1400;
const CANVAS_H  = 900;
const CHAIR_PAD = 14;
const snapV     = (v: number) => Math.round(v / GRID) * GRID;

/** Normalise DB/API time strings for `<input type="time" />` (HH:MM). */
function bookingTimeForInput(value?: string | null): string {
  if (!value) return '19:00';
  const m = String(value).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?/);
  if (!m) return '19:00';
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export const STATUS_STYLE: Record<TableStatus, { bg: string; border: string; accent: string; label: string }> = {
  available: { bg: '#f0fdf4', border: '#86efac', accent: '#16a34a', label: 'Available' },
  occupied:  { bg: '#fef2f2', border: '#fca5a5', accent: '#dc2626', label: 'Occupied'  },
  reserved:  { bg: '#fffbeb', border: '#fcd34d', accent: '#d97706', label: 'Reserved'  },
  cleaning:  { bg: '#fafafa', border: '#d4d4d8', accent: '#71717a', label: 'Cleaning'  },
};

const PALETTE = [
  '#6366f1','#8b5cf6','#ec4899','#f43f5e','#f97316',
  '#eab308','#22c55e','#06b6d4','#0ea5e9','#64748b',
];

function formatCleaningRemaining(cleaningStartedAt: string | undefined, timerMinutes: number): string | null {
  if (!cleaningStartedAt) return null;
  const startMs = new Date(cleaningStartedAt).getTime();
  if (isNaN(startMs)) return null;
  const elapsedMs = Date.now() - startMs;
  const totalMs   = timerMinutes * 60 * 1000;
  const remainMs  = totalMs - elapsedMs;
  if (remainMs <= 0) return 'done';
  const mins = Math.floor(remainMs / 60000);
  const secs = Math.floor((remainMs % 60000) / 1000);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function getTableSize(t: FPTable) {
  return { w: t.w ?? TABLE_SIZE[t.shape].w, h: t.h ?? TABLE_SIZE[t.shape].h };
}

function getChairPositions(table: FPTable): Array<{ x: number; y: number; vertical: boolean }> {
  const { w, h } = getTableSize(table);
  const isRound    = table.shape === 'round';
  const MAX_CHAIRS = 12;
  const N = Math.min(table.capacity, MAX_CHAIRS);
  const chairs: Array<{ x: number; y: number; vertical: boolean }> = [];

  if (isRound) {
    const radius = w / 2 + 7;
    const cx = w / 2, cy = h / 2;
    for (let i = 0; i < N; i++) {
      const angle = (2 * Math.PI * i) / N - Math.PI / 2;
      chairs.push({ x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle), vertical: false });
    }
  } else if (w >= h) {
    const top = Math.ceil(N / 2), bot = N - top;
    const xStep = w / (top + 1);
    for (let i = 0; i < top; i++) chairs.push({ x: xStep * (i + 1), y: 0, vertical: false });
    const xStepB = w / (bot + 1);
    for (let i = 0; i < bot; i++) chairs.push({ x: xStepB * (i + 1), y: h, vertical: false });
  } else {
    const left = Math.ceil(N / 2), right = N - left;
    const yStep = h / (left + 1);
    for (let i = 0; i < left; i++)  chairs.push({ x: 0, y: yStep  * (i + 1), vertical: true });
    const yStepR = h / (right + 1);
    for (let i = 0; i < right; i++) chairs.push({ x: w, y: yStepR * (i + 1), vertical: true });
  }
  return chairs.map(c => ({ x: c.x + CHAIR_PAD, y: c.y + CHAIR_PAD, vertical: c.vertical }));
}

function freshDemoLayout(): { tables: FPTable[]; sections: FPSection[] } {
  return { tables: [], sections: [] };
}

function loadLayout(venueId: string | null | undefined): { tables: FPTable[]; sections: FPSection[] } | null {
  try {
    const raw = localStorage.getItem(floorStorageKey(venueId));
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return null;
}

function persistLayout(venueId: string | null | undefined, tables: FPTable[], sections: FPSection[]) {
  try {
    localStorage.setItem(floorStorageKey(venueId), JSON.stringify({ tables, sections }));
  } catch { /* ignore */ }
}

// ─── Tooltip ─────────────────────────────────────────────────────────────────

function TableTooltip({ table, orderInfo, style }: {
  table: FPTable;
  orderInfo?: TableOrderInfo | null;
  style: React.CSSProperties;
}) {
  const s = STATUS_STYLE[table.status];
  const hasOrder = !!orderInfo && orderInfo.items !== undefined;
  return (
    <div style={{ ...style, position: 'absolute', zIndex: 100, pointerEvents: 'none' }}
      className={cn('rounded-xl bg-white border border-gray-200/80 shadow-2xl p-3 text-xs', hasOrder ? 'w-64' : 'w-52')}>
      <div className="flex items-center justify-between mb-2">
        <span className="font-bold text-[13px] text-gray-900">Table {table.number}</span>
        <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border"
          style={{ color: s.accent, background: s.bg, borderColor: s.border }}>{s.label}</span>
      </div>
      <div className="space-y-1 text-gray-500">
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3 shrink-0" />
          <span>{table.capacity} seats · {table.section}</span>
        </div>
        {table.guestName && (
          <div className="text-gray-700 font-medium">
            {table.guestName}{table.partySize ? ` · party of ${table.partySize}` : ''}
          </div>
        )}
        {(table.bookingTime || table.seatedAt) && (
          <div style={{ color: s.accent }}>
            {table.status === 'occupied' ? 'Seated' : 'Arriving'}: {table.bookingTime ?? table.seatedAt}
          </div>
        )}
        {table.autoStatus && (
          <div className="flex items-center gap-1 mt-1 pt-1 border-t border-gray-100">
            <Zap style={{ width: 9, height: 9, color: '#10b981' }} />
            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 600 }}>Auto Status ON</span>
          </div>
        )}
        {table.notes && (
          <div className="pt-1 mt-1 border-t border-gray-100 text-gray-400 italic">{table.notes}</div>
        )}
      </div>

      {/* ── Active order section ── */}
      {hasOrder && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100">
          <div className="flex items-center gap-1.5 mb-1.5">
            <FileText style={{ width: 10, height: 10, color: '#6366f1' }} />
            <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-widest">
              {orderInfo!.source === 'pos' ? 'POS Ticket' : 'Active Order'}
            </span>
            {orderInfo!.ticketRef && (
              <span className="ml-auto text-[10px] text-gray-400 font-mono">{orderInfo!.ticketRef}</span>
            )}
          </div>
          {orderInfo!.items.length > 0 ? (
            <div className="space-y-0.5 mb-1.5">
              {orderInfo!.items.slice(0, 3).map((item, i) => (
                <div key={i} className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-gray-700 truncate">{item.name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">×{item.qty}</span>
                </div>
              ))}
              {orderInfo!.items.length > 3 && (
                <div className="text-[10px] text-gray-400">+{orderInfo!.items.length - 3} more items</div>
              )}
            </div>
          ) : (
            <div className="text-[11px] text-gray-400 mb-1.5 italic">No items yet</div>
          )}
          <div className="flex items-center justify-between pt-1 border-t border-gray-100">
            <span className="text-[12px] font-bold text-gray-900">
              £{(orderInfo!.totalPence / 100).toFixed(2)}
            </span>
            <span className="text-[9px] text-indigo-500 flex items-center gap-0.5 font-medium">
              Click to open <ArrowUpRight style={{ width: 9, height: 9 }} />
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

interface CtxMenuProps {
  table: FPTable;
  x: number;
  y: number;
  onClose: () => void;
  onDuplicate: () => void;
  onSetStatus: (s: TableStatus) => void;
  onDelete: () => void;
}

function TableContextMenu({ table, x, y, onClose, onDuplicate, onSetStatus, onDelete }: CtxMenuProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  const STATUSES: TableStatus[] = ['available', 'reserved', 'occupied', 'cleaning'];

  return (
    <div ref={ref}
      style={{ position: 'absolute', left: x, top: y, zIndex: 200 }}
      className="min-w-[172px] bg-white rounded-xl border border-gray-200 shadow-2xl py-1 text-xs"
      onMouseDown={(e) => e.stopPropagation()}>
      {/* Header */}
      <div className="px-3 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-widest border-b border-gray-100 mb-1">
        Table {table.number}
      </div>

      {/* Duplicate */}
      <button onClick={() => { onDuplicate(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-gray-700 hover:bg-gray-50 transition-colors">
        <Copy className="h-3 w-3" /> Duplicate
      </button>

      {/* Status section */}
      <div className="px-3 pt-1.5 pb-0.5 text-[9px] font-semibold text-gray-400 uppercase tracking-widest">Status</div>
      {STATUSES.map(st => {
        const ss = STATUS_STYLE[st];
        const isCurrent = table.status === st;
        return (
          <button key={st} onClick={() => { onSetStatus(st); onClose(); }}
            className={cn('w-full flex items-center gap-2 px-3 py-1.5 transition-colors',
              isCurrent ? 'bg-gray-50' : 'hover:bg-gray-50')}>
            <span className="w-2.5 h-2.5 rounded-sm border shrink-0 flex items-center justify-center"
              style={{ background: ss.bg, borderColor: ss.border }}>
              {isCurrent && <span style={{ width: 5, height: 5, borderRadius: 1, background: ss.accent }} />}
            </span>
            <span style={{ color: isCurrent ? ss.accent : undefined }}
              className={cn('flex-1 text-left', isCurrent ? 'font-semibold' : 'text-gray-600')}>
              {ss.label}
            </span>
          </button>
        );
      })}

      {/* Delete */}
      <div className="border-t border-gray-100 my-1" />
      <button onClick={() => { onDelete(); onClose(); }}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-red-500 hover:bg-red-50 transition-colors">
        <Trash2 className="h-3 w-3" /> Delete table
      </button>
    </div>
  );
}

// ─── TableNode ───────────────────────────────────────────────────────────────

interface TableNodeProps {
  table: FPTable;
  selected: boolean;
  multiSelected: boolean;
  editMode: boolean;
  cleaningTimerMinutes: number;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onHover: (t: FPTable | null, el: HTMLDivElement | null) => void;
  onResizeStart: (e: React.MouseEvent, id: string, handle: string) => void;
  onRightClick: (e: React.MouseEvent, id: string) => void;
}

const RESIZE_HANDLES = ['nw','n','ne','e','se','s','sw','w'] as const;
type ResizeHandle = typeof RESIZE_HANDLES[number];

function getHandleStyle(handle: ResizeHandle, w: number, h: number): React.CSSProperties {
  const size = 10, half = size / 2;
  const positions: Record<ResizeHandle, { left: number; top: number }> = {
    nw: { left: CHAIR_PAD - half,         top: CHAIR_PAD - half         },
    n:  { left: CHAIR_PAD + w / 2 - half, top: CHAIR_PAD - half         },
    ne: { left: CHAIR_PAD + w - half,     top: CHAIR_PAD - half         },
    e:  { left: CHAIR_PAD + w - half,     top: CHAIR_PAD + h / 2 - half },
    se: { left: CHAIR_PAD + w - half,     top: CHAIR_PAD + h - half     },
    s:  { left: CHAIR_PAD + w / 2 - half, top: CHAIR_PAD + h - half     },
    sw: { left: CHAIR_PAD - half,         top: CHAIR_PAD + h - half     },
    w:  { left: CHAIR_PAD - half,         top: CHAIR_PAD + h / 2 - half },
  };
  const cursors: Record<ResizeHandle, string> = {
    nw: 'nw-resize', n: 'n-resize', ne: 'ne-resize', e: 'e-resize',
    se: 'se-resize', s: 's-resize', sw: 'sw-resize', w: 'w-resize',
  };
  const p = positions[handle];
  return {
    position: 'absolute', left: p.left, top: p.top, width: size, height: size,
    background: 'white', border: '1.5px solid #6366f1', borderRadius: 2,
    cursor: cursors[handle], pointerEvents: 'all', zIndex: 20,
  };
}

function TableNode({ table, selected, multiSelected, editMode, cleaningTimerMinutes,
  onMouseDown, onClick, onHover, onResizeStart, onRightClick }: TableNodeProps) {
  const { w, h }    = getTableSize(table);
  const isRound     = table.shape === 'round';
  const s           = STATUS_STYLE[table.status];
  const accentColor = table.color ?? s.accent;
  const bgColor     = table.color ? table.color + '22' : s.bg;
  const borderColor = (selected || multiSelected) ? '#6366f1' : (table.color ? table.color + 'aa' : s.border);
  const isJoined    = (table.joinedWith?.length ?? 0) > 0;
  const chairPositions = getChairPositions(table);

  const shadow = selected
    ? '0 0 0 3px rgba(99,102,241,0.35), 0 8px 24px rgba(0,0,0,0.14)'
    : multiSelected
      ? '0 0 0 2px rgba(99,102,241,0.2), 0 4px 12px rgba(0,0,0,0.08)'
      : '0 2px 10px rgba(0,0,0,0.09), 0 1px 3px rgba(0,0,0,0.06)';

  return (
    <div style={{
      position: 'absolute',
      left: table.x - CHAIR_PAD, top: table.y - CHAIR_PAD,
      width: w + CHAIR_PAD * 2, height: h + CHAIR_PAD * 2,
      overflow: 'visible', pointerEvents: 'none',
      zIndex: selected ? 15 : 1,
    }}>
      {/* Chairs */}
      {chairPositions.map((cp, i) => {
        const chairW = isRound ? 8 : cp.vertical ? 8 : 12;
        const chairH = isRound ? 8 : cp.vertical ? 12 : 8;
        return (
          <div key={i} style={{
            position: 'absolute',
            left: cp.x - chairW / 2, top: cp.y - chairH / 2,
            width: chairW, height: chairH,
            borderRadius: isRound ? '50%' : 4,
            background: '#e5e7eb', border: `1.5px solid ${borderColor}`,
            opacity: 0.85, pointerEvents: 'none',
          }} />
        );
      })}

      {/* Table surface — data-table lets canvas mousedown detect table hits */}
      <div
        data-table="true"
        style={{
          position: 'absolute', left: CHAIR_PAD, top: CHAIR_PAD, width: w, height: h,
          borderRadius: isRound ? '50%' : 10,
          background: `radial-gradient(ellipse at 40% 35%, #ffffff 0%, ${bgColor} 100%)`,
          border: `2.5px solid ${borderColor}`, boxShadow: shadow,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          cursor: editMode ? 'grab' : 'pointer', userSelect: 'none',
          overflow: 'hidden', pointerEvents: 'all',
        }}
        onMouseDown={(e) => { if (editMode) onMouseDown(e, table.id); }}
        onClick={(e) => onClick(e, table.id)}
        onContextMenu={(e) => { if (editMode) onRightClick(e, table.id); }}
        onMouseEnter={(e) => onHover(table, e.currentTarget as HTMLDivElement)}
        onMouseLeave={() => onHover(null, null)}
      >
        {/* Status strip */}
        {!isRound && (
          <div style={{
            position: 'absolute', top: 0, left: 0, right: 0, height: 3,
            background: accentColor, borderRadius: '8px 8px 0 0', opacity: 0.7,
          }} />
        )}
        {/* Drag dots */}
        {editMode && !isJoined && (
          <div style={{ position: 'absolute', top: isRound ? '25%' : 8, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 2 }}>
            {[0,1,2].map(i => <span key={i} style={{ width: 3, height: 3, borderRadius: '50%', background: '#d1d5db' }} />)}
          </div>
        )}
        {/* Number */}
        <span style={{ fontSize: 15, fontWeight: 700, color: accentColor, lineHeight: 1, zIndex: 1 }}>
          {table.number}
        </span>
        {/* Guest name */}
        {!editMode && table.guestName && (
          <span style={{ fontSize: 8, color: accentColor, marginTop: 2,
            maxWidth: w - 12, overflow: 'hidden', textOverflow: 'ellipsis',
            whiteSpace: 'nowrap', textAlign: 'center' }}>
            {table.guestName}
          </span>
        )}
        {/* Capacity */}
        {(!table.guestName || editMode) && (
          <span style={{ fontSize: 9, color: '#9ca3af', marginTop: 2 }}>{table.capacity}p</span>
        )}
        {/* Joined badge */}
        {isJoined && (
          <span style={{
            position: 'absolute', bottom: isRound ? 6 : 4, right: isRound ? 6 : 4,
            width: 14, height: 14, borderRadius: '50%', background: '#6366f1',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Link2 style={{ width: 8, height: 8, color: 'white' }} />
          </span>
        )}
        {/* Auto-status badge */}
        {!editMode && table.autoStatus && (
          <span style={{
            // Keep the auto-status chip away from round-table clipping/chair overlap.
            position: 'absolute', top: isRound ? 9 : 3, left: isRound ? 9 : 3,
            width: 12, height: 12, borderRadius: '50%', background: '#10b981',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            boxShadow: '0 0 4px rgba(16,185,129,0.4)',
            zIndex: 2,
          }}>
            <Zap style={{ width: 7, height: 7, color: 'white' }} />
          </span>
        )}
        {/* Cleaning countdown */}
        {!editMode && table.autoStatus && table.status === 'cleaning' && table.cleaningStartedAt && (() => {
          const remaining = formatCleaningRemaining(table.cleaningStartedAt, cleaningTimerMinutes);
          if (!remaining || remaining === 'done') return null;
          return (
            <span style={{
              position: 'absolute', bottom: isRound ? 2 : 1, left: '50%',
              transform: 'translateX(-50%)', fontSize: 8, fontWeight: 700, color: '#71717a',
              background: 'rgba(255,255,255,0.85)', borderRadius: 3,
              padding: '0 3px', whiteSpace: 'nowrap', lineHeight: '14px',
            }}>{remaining}</span>
          );
        })()}
      </div>

      {/* Resize handles */}
      {editMode && selected && RESIZE_HANDLES.map(handle => (
        <div key={handle} style={getHandleStyle(handle, w, h)}
          onMouseDown={(e) => { e.stopPropagation(); onResizeStart(e, table.id, handle); }} />
      ))}
    </div>
  );
}

// ─── SectionLabel ─────────────────────────────────────────────────────────────

interface SectionLabelProps {
  section: FPSection;
  editMode: boolean;
  selected: boolean;
  onMouseDown: (e: React.MouseEvent, id: string) => void;
  onClick: (e: React.MouseEvent, id: string) => void;
  onEdit: (id: string, label: string) => void;
}

function SectionLabel({ section, editMode, selected, onMouseDown, onClick, onEdit }: SectionLabelProps) {
  const [editing, setEditing] = useState(false);
  const [val, setVal]         = useState(section.label);
  const inputRef              = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.select(); }, [editing]);

  function commit() {
    const trimmed = val.trim();
    if (trimmed) onEdit(section.id, trimmed);
    else setVal(section.label);
    setEditing(false);
  }

  return (
    <div
      data-section-label="true"
      style={{ position: 'absolute', left: section.x, top: section.y,
        cursor: editMode ? 'grab' : 'default', userSelect: 'none', zIndex: selected ? 20 : 5 }}
      onMouseDown={(e) => { if (editMode && !editing) onMouseDown(e, section.id); }}
      onClick={(e)      => { if (editMode) onClick(e, section.id); }}
      onDoubleClick={()  => { if (editMode) { setEditing(true); setVal(section.label); } }}
    >
      {editing ? (
        <input ref={inputRef} value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setVal(section.label); setEditing(false); } }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="text-[10px] font-bold uppercase tracking-widest text-gray-400 bg-transparent border-b border-primary outline-none w-28"
        />
      ) : (
        <span
          className={cn('text-[10px] font-bold uppercase tracking-widest', selected ? 'text-primary' : 'text-gray-300')}
          style={{ outline: selected ? '1.5px dashed rgba(99,102,241,0.4)' : 'none', outlineOffset: 4, borderRadius: 3, padding: '1px 3px' }}
        >
          {section.label}
        </span>
      )}
    </div>
  );
}

// ─── Toolbar ─────────────────────────────────────────────────────────────────

interface ToolbarProps {
  snapEnabled: boolean;
  onToggleSnap: () => void;
  onAddTable: (shape: TableShape) => void;
  onAddSection: () => void;
  onDelete: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onReset: () => void;
  onJoin: () => void;
  onSeparate: () => void;
  onDuplicate: () => void;
  onBulkReserve: () => void;
  onBulkFree: () => void;
  onAlign: (type: 'left'|'right'|'cx'|'top'|'bottom'|'cy') => void;
  onDistribute: (dir: 'h'|'v') => void;
  canDelete: boolean;
  canUndo: boolean;
  canRedo: boolean;
  canJoin: boolean;
  canSeparate: boolean;
  canDuplicate: boolean;
  canBulkChange: boolean;
  multiSelCount: number;
  dirty: boolean;
}

function Toolbar({
  snapEnabled, onToggleSnap, onAddTable, onAddSection,
  onDelete, onUndo, onRedo, onSave, onReset, onJoin, onSeparate,
  onDuplicate, onBulkReserve, onBulkFree, onAlign, onDistribute,
  canDelete, canUndo, canRedo, canJoin, canSeparate,
  canDuplicate, canBulkChange, multiSelCount, dirty,
}: ToolbarProps) {
  const [addOpen, setAddOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAddOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const SHAPES: { shape: TableShape; icon: React.ReactNode; label: string }[] = [
    { shape: 'round',   icon: <Circle className="h-3.5 w-3.5" />,                        label: 'Round table'   },
    { shape: 'square',  icon: <Square className="h-3.5 w-3.5" />,                        label: 'Square table'  },
    { shape: 'rect-h',  icon: <RectangleHorizontal className="h-3.5 w-3.5" />,           label: 'Rectangle (H)' },
    { shape: 'rect-v',  icon: <RectangleHorizontal className="h-3.5 w-3.5 rotate-90" />, label: 'Rectangle (V)' },
  ];

  return (
    <>
      {/* ── Main toolbar row ── */}
      <div className="shrink-0 flex items-center gap-1.5 px-3 py-2 border-b border-border bg-background">
        {/* Add Table */}
        <div className="relative" ref={ref}>
          <button onClick={() => setAddOpen(v => !v)}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg bg-primary text-white text-xs font-medium hover:bg-primary/90 transition-colors">
            <Plus className="h-3.5 w-3.5" /> Add Table
          </button>
          {addOpen && (
            <div className="absolute top-full mt-1 left-0 z-50 bg-white border border-border rounded-xl shadow-xl py-1 min-w-[160px]">
              {SHAPES.map(({ shape, icon, label }) => (
                <button key={shape} onClick={() => { onAddTable(shape); setAddOpen(false); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-gray-700 hover:bg-gray-50 transition-colors">
                  {icon}{label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Add Section */}
        <button onClick={onAddSection}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-gray-600 hover:bg-gray-50 transition-colors">
          <Type className="h-3.5 w-3.5" /> Section
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Undo / Redo */}
        <button onClick={onUndo} disabled={!canUndo} title="Undo (⌘Z)"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <Undo2 className="h-3.5 w-3.5" />
        </button>
        <button onClick={onRedo} disabled={!canRedo} title="Redo (⌘⇧Z)"
          className="h-8 w-8 rounded-lg flex items-center justify-center text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors">
          <Redo2 className="h-3.5 w-3.5" />
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Duplicate */}
        <button onClick={onDuplicate} disabled={!canDuplicate} title="Duplicate (⌘D)"
          className={cn('flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors',
            canDuplicate
              ? 'bg-violet-50 border border-violet-200 text-violet-700 hover:bg-violet-100'
              : 'border border-border text-gray-300 cursor-not-allowed')}>
          <Copy className="h-3.5 w-3.5" />
          {multiSelCount > 1 ? `Copy ${multiSelCount}` : 'Copy'}
        </button>

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Join / Separate */}
        <button onClick={onJoin} disabled={!canJoin} title="Join selected tables"
          className={cn('flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors',
            canJoin
              ? 'bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              : 'border border-border text-gray-300 cursor-not-allowed')}>
          <Link2 className="h-3.5 w-3.5" /> Join
        </button>
        <button onClick={onSeparate} disabled={!canSeparate} title="Separate joined tables"
          className={cn('flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium transition-colors',
            canSeparate
              ? 'bg-orange-50 border border-orange-200 text-orange-700 hover:bg-orange-100'
              : 'border border-border text-gray-300 cursor-not-allowed')}>
          <Unlink2 className="h-3.5 w-3.5" /> Separate
        </button>

        {/* Bulk status — when selection active */}
        {canBulkChange && (
          <>
            <div className="w-px h-5 bg-border mx-0.5" />
            <button onClick={onBulkReserve}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ background: STATUS_STYLE.reserved.bg, borderColor: STATUS_STYLE.reserved.border, color: STATUS_STYLE.reserved.accent }}>
              Reserve{multiSelCount > 1 ? ` ${multiSelCount}` : ''}
            </button>
            <button onClick={onBulkFree}
              className="flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-xs font-medium border transition-colors"
              style={{ background: STATUS_STYLE.available.bg, borderColor: STATUS_STYLE.available.border, color: STATUS_STYLE.available.accent }}>
              Free{multiSelCount > 1 ? ` ${multiSelCount}` : ''}
            </button>
          </>
        )}

        <div className="w-px h-5 bg-border mx-0.5" />

        {/* Delete */}
        <button onClick={onDelete} disabled={!canDelete} title="Delete selected (⌫)"
          className={cn('h-8 px-2.5 rounded-lg flex items-center gap-1.5 text-xs font-medium transition-colors',
            canDelete
              ? 'text-red-500 border border-red-200 hover:bg-red-50'
              : 'text-gray-300 border border-border cursor-not-allowed')}>
          <Trash2 className="h-3.5 w-3.5" />
          {multiSelCount > 1 ? `Delete ${multiSelCount}` : 'Delete'}
        </button>

        {/* Snap */}
        <button onClick={onToggleSnap} title={snapEnabled ? 'Grid snap on' : 'Grid snap off'}
          className={cn('h-8 w-8 rounded-lg flex items-center justify-center transition-colors',
            snapEnabled ? 'bg-primary/10 text-primary' : 'text-gray-400 hover:bg-gray-100')}>
          <Grid3X3 className="h-3.5 w-3.5" />
        </button>

        <div className="flex-1" />

        {/* Reset */}
        <button onClick={onReset}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-border text-xs text-gray-500 hover:bg-gray-50 transition-colors">
          <Eraser className="h-3.5 w-3.5" /> Reset
        </button>

        {/* Save */}
        <button onClick={onSave}
          className={cn('flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-colors',
            dirty ? 'bg-primary text-white hover:bg-primary/90' : 'bg-secondary text-muted-foreground hover:bg-secondary/80')}>
          <Save className="h-3.5 w-3.5" />
          {dirty ? 'Save*' : 'Saved'}
        </button>
      </div>

      {/* ── Align row — only when 2+ tables selected ── */}
      {multiSelCount >= 2 && (
        <div className="shrink-0 flex items-center gap-0.5 px-3 py-1.5 border-b border-indigo-100 bg-indigo-50/50">
          <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest mr-1.5">Align</span>

          {/* Horizontal alignment */}
          {[
            { title: 'Align left edges',   fn: () => onAlign('left'),   Icon: IconAlignLeft    },
            { title: 'Centre horizontally', fn: () => onAlign('cx'),     Icon: IconAlignCenterH },
            { title: 'Align right edges',   fn: () => onAlign('right'),  Icon: IconAlignRight   },
          ].map(({ title, fn, Icon }) => (
            <button key={title} onClick={fn} title={title}
              className="h-7 w-7 rounded-md flex items-center justify-center text-indigo-500 hover:bg-indigo-200/60 transition-colors">
              <Icon />
            </button>
          ))}

          <div className="w-px h-4 bg-indigo-200 mx-1" />

          {/* Vertical alignment */}
          {[
            { title: 'Align top edges',     fn: () => onAlign('top'),    Icon: IconAlignTop     },
            { title: 'Centre vertically',   fn: () => onAlign('cy'),     Icon: IconAlignCenterV },
            { title: 'Align bottom edges',  fn: () => onAlign('bottom'), Icon: IconAlignBottom  },
          ].map(({ title, fn, Icon }) => (
            <button key={title} onClick={fn} title={title}
              className="h-7 w-7 rounded-md flex items-center justify-center text-indigo-500 hover:bg-indigo-200/60 transition-colors">
              <Icon />
            </button>
          ))}

          {/* Distribute — only 3+ tables */}
          {multiSelCount >= 3 && (
            <>
              <div className="w-px h-4 bg-indigo-200 mx-1" />
              <span className="text-[9px] font-semibold text-indigo-400 uppercase tracking-widest mr-1">Space</span>
              <button onClick={() => onDistribute('h')} title="Distribute horizontally (equal spacing)"
                className="h-7 w-7 rounded-md flex items-center justify-center text-indigo-500 hover:bg-indigo-200/60 transition-colors">
                <IconDistributeH />
              </button>
              <button onClick={() => onDistribute('v')} title="Distribute vertically (equal spacing)"
                className="h-7 w-7 rounded-md flex items-center justify-center text-indigo-500 hover:bg-indigo-200/60 transition-colors">
                <IconDistributeV />
              </button>
            </>
          )}

          <div className="flex-1" />
          <span className="text-[9px] text-indigo-300">{multiSelCount} selected · drag canvas to re-select</span>
        </div>
      )}
    </>
  );
}

// ─── MultiSelectPanel ────────────────────────────────────────────────────────

interface MultiSelectPanelProps {
  selectedTables: FPTable[];
  allTables: FPTable[];
  onBulkSetStatus: (s: TableStatus) => void;
  onBulkSetOwner: (name: string, partySize?: number) => void;
  onDuplicate: () => void;
  onDeleteAll: () => void;
  onClose: () => void;
}

function MultiSelectPanel({ selectedTables, onBulkSetStatus, onBulkSetOwner, onDuplicate, onDeleteAll, onClose }: MultiSelectPanelProps) {
  const [guestName, setGuestName] = useState('');
  const [partySize, setPartySize] = useState(0);
  const STATUSES: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning'];
  const n = selectedTables.length;

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <div className="flex items-center gap-2">
          <span className="h-5 min-w-[20px] px-1 rounded-full bg-primary/10 text-primary text-[10px] font-bold flex items-center justify-center">
            {n}
          </span>
          <span className="text-[12px] font-semibold text-gray-700">tables selected</span>
        </div>
        <button onClick={onClose} className="h-6 w-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {/* Status */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Set Status</label>
          <div className="grid grid-cols-2 gap-1">
            {STATUSES.map((st) => {
              const ss = STATUS_STYLE[st];
              return (
                <button key={st} onClick={() => onBulkSetStatus(st)}
                  className="h-8 text-[11px] font-medium rounded-lg border hover:opacity-80 transition-opacity"
                  style={{ background: ss.bg, borderColor: ss.border, color: ss.accent }}>
                  {ss.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Assign owner */}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Assign Owner</label>
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)}
            placeholder="Guest name…"
            className="w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-gray-300 mb-2" />
          <div className="flex items-center gap-2 mb-2.5">
            <span className="text-[10px] text-gray-400 shrink-0">Party</span>
            <div className="flex items-center gap-1 flex-1">
              <button onClick={() => setPartySize(p => Math.max(0, p - 1))}
                className="h-7 w-7 rounded border border-border flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <Minus className="h-3 w-3" />
              </button>
              <span className="flex-1 text-center text-xs font-semibold text-gray-700">{partySize || '—'}</span>
              <button onClick={() => setPartySize(p => p + 1)}
                className="h-7 w-7 rounded border border-border flex items-center justify-center text-gray-500 hover:bg-gray-50">
                <Plus className="h-3 w-3" />
              </button>
            </div>
          </div>
          <button
            onClick={() => { if (guestName.trim()) onBulkSetOwner(guestName.trim(), partySize || undefined); }}
            disabled={!guestName.trim()}
            className="w-full h-8 flex items-center justify-center gap-2 text-xs font-medium bg-primary/10 text-primary rounded-lg border border-primary/20 hover:bg-primary/15 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            <UserCheck className="h-3.5 w-3.5" />
            Apply to all {n} tables
          </button>
        </div>

        <div className="border-t border-border" />

        <div className="space-y-1.5">
          <button onClick={onDuplicate}
            className="w-full h-8 flex items-center justify-center gap-2 text-xs text-gray-600 border border-border rounded-lg hover:bg-gray-50 transition-colors">
            <Copy className="h-3.5 w-3.5" /> Duplicate {n} tables
          </button>
          <button onClick={onDeleteAll}
            className="w-full h-8 flex items-center justify-center gap-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" /> Delete {n} tables
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── SidePanel ───────────────────────────────────────────────────────────────

interface SidePanelProps {
  table: FPTable | null;
  section: FPSection | null;
  sections: FPSection[];
  allTables: FPTable[];
  multiSelTables: FPTable[];
  onUpdateTable: (id: string, patch: Partial<FPTable>) => void;
  onUpdateSection: (id: string, patch: Partial<FPSection>) => void;
  onDeleteTable: (id: string) => void;
  onDeleteSection: (id: string) => void;
  onBulkSetStatus: (s: TableStatus) => void;
  onBulkSetOwner: (name: string, partySize?: number) => void;
  onDuplicate: () => void;
  onDeleteAll: () => void;
  onClose: () => void;
  defaultBookingDate: string;
  onSaveBooking?: (table: FPTable) => void;
  saveBookingBusy?: boolean;
  saveBookingError?: string | null;
}

function SidePanel({
  table, section, sections, allTables, multiSelTables,
  onUpdateTable, onUpdateSection, onDeleteTable, onDeleteSection,
  onBulkSetStatus, onBulkSetOwner, onDuplicate, onDeleteAll, onClose,
  defaultBookingDate,
  onSaveBooking,
  saveBookingBusy,
  saveBookingError,
}: SidePanelProps) {
  const SHAPES: { v: TableShape; icon: React.ReactNode }[] = [
    { v: 'round',   icon: <Circle className="h-3 w-3" /> },
    { v: 'square',  icon: <Square className="h-3 w-3" /> },
    { v: 'rect-h',  icon: <RectangleHorizontal className="h-3 w-3" /> },
    { v: 'rect-v',  icon: <RectangleHorizontal className="h-3 w-3 rotate-90" /> },
  ];
  const STATUSES: TableStatus[] = ['available', 'occupied', 'reserved', 'cleaning'];

  if (multiSelTables.length >= 2) {
    return (
      <MultiSelectPanel
        selectedTables={multiSelTables} allTables={allTables}
        onBulkSetStatus={onBulkSetStatus} onBulkSetOwner={onBulkSetOwner}
        onDuplicate={onDuplicate} onDeleteAll={onDeleteAll} onClose={onClose}
      />
    );
  }

  if (!table && !section) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-4">
        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center mb-3">
          <Pencil className="h-4 w-4 text-gray-400" />
        </div>
        <p className="text-[12px] text-gray-500 font-medium">Select a table or section</p>
        <p className="text-[11px] text-gray-400 mt-1">Click · Shift+click · Drag to select</p>
        <p className="text-[11px] text-gray-400 mt-0.5">Right-click for quick actions</p>
      </div>
    );
  }

  if (section) {
    return (
      <div className="flex flex-col h-full">
        <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
          <span className="text-[12px] font-semibold text-gray-700">Section Label</span>
          <button onClick={onClose} className="h-6 w-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Label</label>
            <input value={section.label}
              onChange={(e) => onUpdateSection(section.id, { label: e.target.value })}
              className="w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50" />
          </div>
          <button onClick={() => onDeleteSection(section.id)}
            className="w-full h-8 flex items-center justify-center gap-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
            <Trash2 className="h-3.5 w-3.5" />Delete section
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-[12px] font-semibold text-gray-700">Table {table!.number}</span>
        <button onClick={onClose} className="h-6 w-6 rounded flex items-center justify-center hover:bg-gray-100 text-gray-400">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Table #</label>
          <input value={table!.number}
            onChange={(e) => onUpdateTable(table!.id, { number: e.target.value })}
            className="w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Capacity</label>
          <div className="flex items-center gap-2">
            <button onClick={() => onUpdateTable(table!.id, { capacity: Math.max(1, table!.capacity - 1) })}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <Minus className="h-3.5 w-3.5" />
            </button>
            <span className="flex-1 text-center text-sm font-semibold text-gray-800">{table!.capacity}</span>
            <button onClick={() => onUpdateTable(table!.id, { capacity: Math.min(20, table!.capacity + 1) })}
              className="h-8 w-8 rounded-lg border border-border flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors">
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Shape</label>
          <div className="grid grid-cols-4 gap-1">
            {SHAPES.map(({ v, icon }) => (
              <button key={v} onClick={() => onUpdateTable(table!.id, { shape: v })}
                className={cn('h-9 rounded-lg border flex items-center justify-center transition-colors',
                  table!.shape === v ? 'border-primary bg-primary/8 text-primary' : 'border-border text-gray-400 hover:bg-gray-50')}>
                {icon}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Section</label>
          <div className="space-y-1">
            {[...new Set(sections.map(s => s.label))].map((label) => (
              <button key={label} onClick={() => onUpdateTable(table!.id, { section: label })}
                className={cn('w-full h-8 text-left px-3 text-xs rounded-lg border transition-colors',
                  table!.section === label
                    ? 'border-primary bg-primary/8 text-primary font-medium'
                    : 'border-transparent text-gray-600 hover:bg-gray-50')}>
                {label}
              </button>
            ))}
            <input placeholder="+ New section…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const v = (e.target as HTMLInputElement).value.trim();
                  if (v) { onUpdateTable(table!.id, { section: v }); (e.target as HTMLInputElement).value = ''; }
                }
              }}
              className="w-full h-8 text-xs px-3 border border-dashed border-border rounded-lg bg-transparent outline-none focus:border-primary/50 text-gray-400 placeholder:text-gray-300" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Colour</label>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => onUpdateTable(table!.id, { color: undefined })} title="Default"
              className={cn('w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all',
                !table!.color ? 'border-primary scale-110' : 'border-gray-200')}>
              <span className="text-[8px] text-gray-400">A</span>
            </button>
            {PALETTE.map((c) => (
              <button key={c} onClick={() => onUpdateTable(table!.id, { color: c })}
                style={{ background: c }}
                className={cn('w-6 h-6 rounded-full border-2 transition-all',
                  table!.color === c ? 'border-white scale-110 shadow-md' : 'border-transparent')}>
                {table!.color === c && <Check className="h-3 w-3 text-white mx-auto" />}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Status</label>
          <div className="grid grid-cols-2 gap-1">
            {STATUSES.map((st) => {
              const ss = STATUS_STYLE[st];
              return (
                <button key={st} onClick={() => onUpdateTable(table!.id, { status: st })}
                  className={cn('h-8 text-[11px] font-medium rounded-lg border transition-colors',
                    table!.status === st ? 'border-current font-semibold' : 'border-border hover:bg-gray-50')}
                  style={table!.status === st ? { background: ss.bg, borderColor: ss.border, color: ss.accent } : {}}>
                  {ss.label}
                </button>
              );
            })}
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Auto Status</label>
          <button onClick={() => onUpdateTable(table!.id, { autoStatus: !table!.autoStatus })}
            className={cn('w-full h-9 text-[11px] font-medium rounded-lg border flex items-center justify-center gap-2 transition-colors',
              table!.autoStatus
                ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                : 'border-border bg-gray-50 text-gray-500 hover:bg-gray-100')}>
            <span className={cn('w-2 h-2 rounded-full', table!.autoStatus ? 'bg-emerald-500' : 'bg-gray-300')} />
            {table!.autoStatus ? 'Auto: ON' : 'Auto: OFF'}
          </button>
          <p className="text-[9px] text-gray-400 mt-1">
            {table!.autoStatus ? 'Status auto-changes via POS lifecycle' : 'Manual status control (default)'}
          </p>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Guest</label>
          <input value={table!.guestName ?? ''}
            onChange={(e) => onUpdateTable(table!.id, { guestName: e.target.value || undefined })}
            placeholder="Guest name"
            className="w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-gray-300 mb-1" />
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400 shrink-0">Party</span>
            <input type="number" min={1} max={20}
              value={table!.partySize ?? ''}
              onChange={(e) => onUpdateTable(table!.id, { partySize: e.target.value ? Number(e.target.value) : undefined })}
              placeholder="—"
              className="w-full h-8 text-xs border border-border rounded-lg px-3 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 placeholder:text-gray-300" />
          </div>
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Booking date</label>
          <input
            type="date"
            value={table!.bookingDate || defaultBookingDate}
            onChange={(e) => onUpdateTable(table!.id, { bookingDate: e.target.value || undefined })}
            className="w-full h-8 text-xs border border-border rounded-lg px-2 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">
            {table!.status === 'occupied' ? 'Seated time' : 'Arrival time'}
          </label>
          <input
            type="time"
            value={bookingTimeForInput(table!.status === 'occupied' ? table!.seatedAt : table!.bookingTime)}
            onChange={(e) => {
              const v = e.target.value;
              if (table!.status === 'occupied') onUpdateTable(table!.id, { seatedAt: v || undefined });
              else onUpdateTable(table!.id, { bookingTime: v || undefined });
            }}
            className="w-full h-8 text-xs border border-border rounded-lg px-2 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50"
          />
        </div>
        {onSaveBooking && (
          <div>
            <button
              type="button"
              disabled={!!saveBookingBusy}
              onClick={() => onSaveBooking(table!)}
              className="w-full h-9 text-[11px] font-semibold rounded-lg bg-primary text-white hover:bg-primary/90 disabled:opacity-60 transition-colors"
            >
              {saveBookingBusy ? 'Saving…' : 'Save booking'}
            </button>
            {saveBookingError && (
              <p className="text-[10px] text-red-600 mt-1.5">{saveBookingError}</p>
            )}
          </div>
        )}
        <div>
          <label className="block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1.5">Notes</label>
          <textarea value={table!.notes ?? ''}
            onChange={(e) => onUpdateTable(table!.id, { notes: e.target.value || undefined })}
            placeholder="Special requests…" rows={2}
            className="w-full text-xs border border-border rounded-lg px-3 py-2 bg-white outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 resize-none placeholder:text-gray-300" />
        </div>
        {(table!.joinedWith?.length ?? 0) > 0 && (
          <div className="rounded-lg border border-indigo-100 bg-indigo-50 px-3 py-2">
            <div className="flex items-center gap-1.5 mb-1">
              <Link2 className="h-3 w-3 text-indigo-500" />
              <p className="text-[10px] font-semibold text-indigo-600 uppercase tracking-widest">Joined with</p>
            </div>
            <p className="text-xs text-indigo-700 font-medium">
              {table!.joinedWith!.map(id => {
                const t = allTables.find(x => x.id === id);
                return t ? `Table ${t.number}` : id;
              }).join(', ')}
            </p>
            <p className="text-[10px] text-indigo-400 mt-1">Click Separate in toolbar to unlink</p>
          </div>
        )}
        <button onClick={() => onDeleteTable(table!.id)}
          className="w-full h-8 flex items-center justify-center gap-2 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition-colors">
          <Trash2 className="h-3.5 w-3.5" />Delete table
        </button>
      </div>
    </div>
  );
}

// ─── Legend ─────────────────────────────────────────────────────────────────

function Legend({ tables }: { tables: FPTable[] }) {
  const counts = tables.reduce<Record<string, number>>((a, t) => {
    a[t.status] = (a[t.status] ?? 0) + 1; return a;
  }, {});
  return (
    <div className="flex items-center gap-5">
      {(Object.entries(STATUS_STYLE) as [TableStatus, typeof STATUS_STYLE[TableStatus]][]).map(([st, s]) => (
        <div key={st} className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-sm border" style={{ background: s.bg, borderColor: s.border }} />
          <span className="text-[11px] text-gray-500">{s.label}</span>
          <span className="text-[11px] font-semibold text-gray-700">{counts[st] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface FloorPlanEditorProps {
  editMode: boolean;
  venueId?: string | null;
  selectedId?: string | null;
  onSelect?: (t: FPTable | null) => void;
  cleaningTimerMinutes?: number;
  /** Map of tableNumber → live order/ticket for tooltip enrichment and click-through */
  tableOrders?: Record<string, TableOrderInfo>;
  /** Called instead of onSelect when clicking an occupied table that has a live order */
  onTableOrderClick?: (table: FPTable, order: TableOrderInfo) => void;
  /** Default YYYY-MM-DD for booking date in edit sidebar (e.g. tonight). */
  defaultBookingDate?: string;
  /** Persist guest booking to API from edit sidebar (same behaviour as table list). */
  onSaveBooking?: (table: FPTable) => void | Promise<void>;
  saveBookingBusy?: boolean;
  saveBookingError?: string | null;
}

export function FloorPlanEditor({
  editMode,
  venueId = null,
  selectedId: externalSelected,
  onSelect,
  cleaningTimerMinutes = 15,
  tableOrders,
  onTableOrderClick,
  defaultBookingDate = new Date().toISOString().slice(0, 10),
  onSaveBooking,
  saveBookingBusy,
  saveBookingError,
}: FloorPlanEditorProps) {
  const [tables,   setTables]   = useState<FPTable[]>(() => {
    const saved = loadLayout(venueId);
    return saved?.tables?.length ? saved.tables : freshDemoLayout().tables;
  });
  const [sections, setSections] = useState<FPSection[]>(() => {
    const saved = loadLayout(venueId);
    return saved?.sections?.length ? saved.sections : freshDemoLayout().sections;
  });

  // Mirror tables into a ref so global event handlers always see current data
  const tablesRef = useRef(tables);
  useEffect(() => { tablesRef.current = tables; }, [tables]);

  useEffect(() => {
    const saved = loadLayout(venueId);
    if (saved?.tables?.length) {
      setTables(saved.tables);
      setSections(saved.sections?.length ? saved.sections : freshDemoLayout().sections);
    } else {
      const demo = freshDemoLayout();
      setTables(demo.tables);
      setSections(demo.sections);
    }
    setHistory([]);
    setRedoStack([]);
    setSelTableId(null);
    setSelSectionId(null);
    setMultiSel(new Set());
    setDirty(false);
  }, [venueId]);

  const [history,    setHistory]    = useState<{ tables: FPTable[]; sections: FPSection[] }[]>([]);
  const [redoStack,  setRedoStack]  = useState<{ tables: FPTable[]; sections: FPSection[] }[]>([]);
  const [dirty,      setDirty]      = useState(false);

  const [selTableId,   setSelTableId]   = useState<string | null>(null);
  const [selSectionId, setSelSectionId] = useState<string | null>(null);
  const [multiSel,     setMultiSel]     = useState<Set<string>>(new Set());

  const [snapEnabled, setSnapEnabled] = useState(true);

  const [_cleaningTick, setCleaningTick] = useState(0);
  useEffect(() => {
    if (editMode) return;
    const hasCleaning = tables.some(t => t.autoStatus && t.status === 'cleaning' && t.cleaningStartedAt);
    if (!hasCleaning) return;
    const id = window.setInterval(() => setCleaningTick(v => v + 1), 1000);
    return () => window.clearInterval(id);
  }, [editMode, tables]);

  const [hovered,      setHovered]      = useState<FPTable | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [contextMenu,  setContextMenu]  = useState<{ tableId: string; x: number; y: number } | null>(null);

  // Marquee drag-to-select
  const [marqueeRect, setMarqueeRect] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  const marqueeTrackRef = useRef<{ startX: number; startY: number; curX: number; curY: number; moved: boolean } | null>(null);

  const canvasRef = useRef<HTMLDivElement>(null);

  const dragRef = useRef<{
    id: string; type: 'table' | 'section';
    startMX: number; startMY: number;
    origPositions: Record<string, { x: number; y: number }>;
  } | null>(null);

  const resizeRef = useRef<{
    tableId: string; handle: string;
    startMX: number; startMY: number;
    origW: number; origH: number; origX: number; origY: number;
  } | null>(null);

  // ── Snapshot / history ────────────────────────────────────────────────────

  function snapshot() {
    setHistory(h => [...h.slice(-30), { tables, sections }]);
    setRedoStack([]);
    setDirty(true);
  }

  // ── Drag ──────────────────────────────────────────────────────────────────

  const handleTableMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (!editMode) return;
    e.preventDefault();
    const t = tables.find(x => x.id === id);
    if (!t) return;

    const groupIds = new Set([id, ...(t.joinedWith ?? [])]);
    const origPositions: Record<string, { x: number; y: number }> = {};
    const dragSet = (!e.shiftKey && multiSel.has(id) && multiSel.size > 1) ? multiSel : groupIds;
    for (const gid of dragSet) {
      const gt = tables.find(x => x.id === gid);
      if (gt) origPositions[gid] = { x: gt.x, y: gt.y };
    }

    dragRef.current = { id, type: 'table', startMX: e.clientX, startMY: e.clientY, origPositions };

    if (!e.shiftKey) {
      setMultiSel(dragSet);
      setSelTableId(id);
      setSelSectionId(null);
    }
  }, [editMode, tables, multiSel]);

  const handleSectionMouseDown = useCallback((e: React.MouseEvent, id: string) => {
    if (!editMode) return;
    e.preventDefault();
    const s = sections.find(x => x.id === id);
    if (!s) return;
    dragRef.current = { id, type: 'section', startMX: e.clientX, startMY: e.clientY, origPositions: { [id]: { x: s.x, y: s.y } } };
    setSelSectionId(id);
    setSelTableId(null);
    setMultiSel(new Set());
  }, [editMode, sections]);

  const handleResizeStart = useCallback((e: React.MouseEvent, id: string, handle: string) => {
    if (!editMode) return;
    e.preventDefault();
    const t = tables.find(x => x.id === id);
    if (!t) return;
    const { w, h } = getTableSize(t);
    resizeRef.current = { tableId: id, handle, startMX: e.clientX, startMY: e.clientY, origW: w, origH: h, origX: t.x, origY: t.y };
  }, [editMode, tables]);

  // Canvas mousedown → start marquee if clicking empty space
  function handleCanvasMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    if (!editMode) return;
    const target = e.target as Element;
    if (target.closest('[data-table]') || target.closest('[data-section-label]')) return;

    const canvas = canvasRef.current!;
    const cr = canvas.getBoundingClientRect();
    const x = e.clientX - cr.left + canvas.scrollLeft;
    const y = e.clientY - cr.top  + canvas.scrollTop;
    marqueeTrackRef.current = { startX: x, startY: y, curX: x, curY: y, moved: false };
    setContextMenu(null);
  }

  // Global mousemove / mouseup
  useEffect(() => {
    function onMove(e: MouseEvent) {
      // ── resize ──
      if (resizeRef.current) {
        const r = resizeRef.current;
        const dx = e.clientX - r.startMX, dy = e.clientY - r.startMY;
        let newW = r.origW, newH = r.origH, newX = r.origX, newY = r.origY;
        if (r.handle.includes('e')) newW = Math.max(60, r.origW + dx);
        if (r.handle.includes('w')) { newW = Math.max(60, r.origW - dx); newX = r.origX + (r.origW - newW); }
        if (r.handle.includes('s')) newH = Math.max(60, r.origH + dy);
        if (r.handle.includes('n')) { newH = Math.max(60, r.origH - dy); newY = r.origY + (r.origH - newH); }
        if (snapEnabled) { newW = snapV(newW); newH = snapV(newH); newX = snapV(newX); newY = snapV(newY); if (newW < 60) newW = 60; if (newH < 60) newH = 60; }
        setTables(prev => prev.map(t => t.id === r.tableId ? { ...t, w: newW, h: newH, x: newX, y: newY } : t));
        setDirty(true);
        return;
      }

      // ── marquee ──
      if (marqueeTrackRef.current) {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const cr = canvas.getBoundingClientRect();
        const cx = e.clientX - cr.left + canvas.scrollLeft;
        const cy = e.clientY - cr.top  + canvas.scrollTop;
        marqueeTrackRef.current.curX = cx;
        marqueeTrackRef.current.curY = cy;
        const { startX, startY } = marqueeTrackRef.current;
        if (Math.abs(cx - startX) > 4 || Math.abs(cy - startY) > 4) {
          marqueeTrackRef.current.moved = true;
          setMarqueeRect({
            x: Math.min(cx, startX), y: Math.min(cy, startY),
            w: Math.abs(cx - startX), h: Math.abs(cy - startY),
          });
        }
        return;
      }

      // ── drag ──
      if (!dragRef.current) return;
      const d = dragRef.current;
      const dx = e.clientX - d.startMX, dy = e.clientY - d.startMY;
      if (d.type === 'table') {
        setTables(prev => prev.map(t => {
          const orig = d.origPositions[t.id];
          if (!orig) return t;
          return { ...t, x: Math.max(0, snapEnabled ? snapV(orig.x + dx) : orig.x + dx), y: Math.max(0, snapEnabled ? snapV(orig.y + dy) : orig.y + dy) };
        }));
      } else {
        const orig = d.origPositions[d.id];
        if (orig) setSections(prev => prev.map(s => s.id === d.id ? {
          ...s,
          x: Math.max(0, snapEnabled ? snapV(orig.x + dx) : orig.x + dx),
          y: Math.max(0, snapEnabled ? snapV(orig.y + dy) : orig.y + dy),
        } : s));
      }
      setDirty(true);
    }

    function onUp() {
      // ── resize done ──
      if (resizeRef.current) { snapshot(); resizeRef.current = null; return; }

      // ── marquee done ──
      if (marqueeTrackRef.current) {
        const m = marqueeTrackRef.current;
        if (m.moved) {
          const rx = Math.min(m.startX, m.curX), ry = Math.min(m.startY, m.curY);
          const rw = Math.abs(m.curX - m.startX), rh = Math.abs(m.curY - m.startY);
          const hit = tablesRef.current.filter(t => {
            const { w: tw, h: th } = getTableSize(t);
            return t.x < rx + rw && t.x + tw > rx && t.y < ry + rh && t.y + th > ry;
          });
          if (hit.length > 0) {
            const ids = new Set(hit.map(t => t.id));
            setMultiSel(ids);
            setSelTableId(hit[0].id);
            setSelSectionId(null);
          } else {
            setMultiSel(new Set());
            setSelTableId(null);
            setSelSectionId(null);
          }
        } else {
          // Plain click on empty canvas → deselect
          setMultiSel(new Set());
          setSelTableId(null);
          setSelSectionId(null);
          setContextMenu(null);
        }
        setMarqueeRect(null);
        marqueeTrackRef.current = null;
        return;
      }

      // ── drag done ──
      if (dragRef.current) { snapshot(); dragRef.current = null; }
    }

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup',   onUp);
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapEnabled]);

  // ── Hover tooltip ──────────────────────────────────────────────────────────

  function handleHover(t: FPTable | null, el: HTMLDivElement | null) {
    setHovered(t);
    if (t && el && canvasRef.current) {
      const cr  = canvasRef.current.getBoundingClientRect();
      const er  = el.getBoundingClientRect();
      const cx  = er.left - cr.left + er.width / 2 + canvasRef.current.scrollLeft;
      const topY = er.top - cr.top + canvasRef.current.scrollTop;
      const bottomY = er.bottom - cr.top + canvasRef.current.scrollTop;
      const tipW = 208;
      const TIP_FLIP_THRESHOLD = 120;
      const showBelow = topY < TIP_FLIP_THRESHOLD;
      setTooltipStyle({
        left: Math.min(Math.max(cx - tipW / 2, 4), CANVAS_W - tipW - 4),
        top: showBelow ? bottomY + 8 : Math.max(topY - 8, 4),
        transform: showBelow ? 'none' : 'translateY(-100%)',
      });
    }
  }

  // ── Click handlers ─────────────────────────────────────────────────────────

  function handleTableClick(e: React.MouseEvent, id: string) {
    if (editMode) {
      e.stopPropagation();
      if (e.shiftKey) {
        setMultiSel(prev => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
        setSelTableId(id);
        setSelSectionId(null);
      } else {
        const t = tables.find(x => x.id === id);
        const groupIds = new Set([id, ...(t?.joinedWith ?? [])]);
        setMultiSel(groupIds);
        setSelTableId(id);
        setSelSectionId(null);
      }
    } else {
      const t = tables.find(x => x.id === id) ?? null;
      // Occupied tables with a live order → open order editor
      if (t && t.status === 'occupied' && onTableOrderClick) {
        const order = tableOrders?.[t.number];
        if (order) { onTableOrderClick(t, order); return; }
      }
      onSelect?.(t);
    }
  }

  function handleTableRightClick(e: React.MouseEvent, id: string) {
    e.preventDefault(); e.stopPropagation();
    if (!editMode) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cr = canvas.getBoundingClientRect();
    setContextMenu({ tableId: id, x: e.clientX - cr.left + canvas.scrollLeft, y: e.clientY - cr.top + canvas.scrollTop });
    setSelTableId(id);
    setSelSectionId(null);
    if (!multiSel.has(id)) setMultiSel(new Set([id]));
  }

  function handleSectionClick(e: React.MouseEvent, id: string) {
    if (!editMode) return;
    e.stopPropagation();
    setSelSectionId(id);
    setSelTableId(null);
    setMultiSel(new Set());
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  function addTable(shape: TableShape) {
    snapshot();
    const id      = crypto.randomUUID();
    const nextNum = tables.length + 1;
    const { w, h } = TABLE_SIZE[shape];
    setTables(prev => [...prev, {
      id, shape, x: 100, y: 100, number: String(nextNum),
      section: sections[0]?.label ?? 'Main Floor',
      capacity: shape === 'round' ? 2 : shape === 'square' ? 4 : 6,
      status: 'available',
      ...(canvasRef.current ? { x: Math.min(100, CANVAS_W - w - 20), y: Math.min(100, CANVAS_H - h - 20) } : {}),
    }]);
    setSelTableId(id);
    setSelSectionId(null);
    setMultiSel(new Set([id]));
  }

  function addSection() {
    snapshot();
    const id = `sec_${Date.now()}`;
    setSections(prev => [...prev, { id, label: 'New Section', x: 80, y: 80 }]);
    setSelSectionId(id);
    setSelTableId(null);
  }

  function updateTable(id: string, patch: Partial<FPTable>) {
    snapshot();
    setTables(prev => prev.map(t => t.id === id ? { ...t, ...patch } : t));
  }

  function updateSection(id: string, patch: Partial<FPSection>) {
    setSections(prev => prev.map(s => s.id === id ? { ...s, ...patch } : s));
    setDirty(true);
  }

  function deleteSelected() {
    if (multiSel.size > 0) {
      snapshot();
      const toDelete = new Set(multiSel);
      setTables(prev => prev.filter(t => !toDelete.has(t.id)));
      setSelTableId(null);
      setMultiSel(new Set());
      return;
    }
    if (selSectionId) {
      snapshot();
      setSections(prev => prev.filter(s => s.id !== selSectionId));
      setSelSectionId(null);
    }
  }

  function duplicateTables() {
    const ids = multiSel.size > 0 ? Array.from(multiSel) : (selTableId ? [selTableId] : []);
    if (!ids.length) return;
    snapshot();
    const newTs: FPTable[] = [];
    ids.forEach(id => {
      const t = tables.find(x => x.id === id);
      if (!t) return;
      newTs.push({ ...t, id: crypto.randomUUID(), x: t.x + 20, y: t.y + 20, number: String(tables.length + newTs.length + 1), joinedWith: undefined });
    });
    setTables(prev => [...prev, ...newTs]);
    const newIds = new Set(newTs.map(t => t.id));
    setMultiSel(newIds);
    setSelTableId(newTs[0]?.id ?? null);
  }

  function bulkSetStatus(status: TableStatus) {
    const ids = multiSel.size > 0 ? multiSel : (selTableId ? new Set([selTableId]) : new Set<string>());
    if (!ids.size) return;
    snapshot();
    setTables(prev => prev.map(t => ids.has(t.id) ? { ...t, status } : t));
  }

  function bulkSetOwner(guestName: string, partySize?: number) {
    if (!multiSel.size) return;
    snapshot();
    setTables(prev => prev.map(t => multiSel.has(t.id)
      ? { ...t, guestName: guestName || undefined, partySize: partySize || undefined, status: guestName ? 'reserved' : t.status }
      : t));
  }

  function joinTables() {
    if (multiSel.size < 2) return;
    snapshot();
    const ids = Array.from(multiSel);
    setTables(prev => prev.map(t => {
      if (!ids.includes(t.id)) return t;
      return { ...t, joinedWith: Array.from(new Set([...(t.joinedWith ?? []), ...ids.filter(i => i !== t.id)])) };
    }));
  }

  function separateTables() {
    if (!selTableId) return;
    snapshot();
    const t = tables.find(x => x.id === selTableId);
    if (!t) return;
    const group = new Set([selTableId, ...(t.joinedWith ?? [])]);
    setTables(prev => prev.map(tbl => {
      if (!group.has(tbl.id)) return tbl;
      const remaining = (tbl.joinedWith ?? []).filter(id => !group.has(id));
      return { ...tbl, joinedWith: remaining.length ? remaining : undefined };
    }));
    setMultiSel(new Set([selTableId]));
  }

  // ── Align / distribute ─────────────────────────────────────────────────────

  function alignTables(type: 'left'|'right'|'cx'|'top'|'bottom'|'cy') {
    if (multiSel.size < 2) return;
    snapshot();
    const sel = tables.filter(t => multiSel.has(t.id));
    let target = 0;
    if (type === 'left')   target = Math.min(...sel.map(t => t.x));
    if (type === 'right')  target = Math.max(...sel.map(t => t.x + getTableSize(t).w));
    if (type === 'top')    target = Math.min(...sel.map(t => t.y));
    if (type === 'bottom') target = Math.max(...sel.map(t => t.y + getTableSize(t).h));
    if (type === 'cx')     target = sel.reduce((s, t) => s + t.x + getTableSize(t).w / 2, 0) / sel.length;
    if (type === 'cy')     target = sel.reduce((s, t) => s + t.y + getTableSize(t).h / 2, 0) / sel.length;

    setTables(prev => prev.map(t => {
      if (!multiSel.has(t.id)) return t;
      const { w, h } = getTableSize(t);
      if (type === 'left')   return { ...t, x: target };
      if (type === 'right')  return { ...t, x: target - w };
      if (type === 'top')    return { ...t, y: target };
      if (type === 'bottom') return { ...t, y: target - h };
      if (type === 'cx')     return { ...t, x: target - w / 2 };
      if (type === 'cy')     return { ...t, y: target - h / 2 };
      return t;
    }));
  }

  function distributeTables(dir: 'h'|'v') {
    if (multiSel.size < 3) return;
    snapshot();
    const sel = tables.filter(t => multiSel.has(t.id));

    if (dir === 'h') {
      const sorted = [...sel].sort((a, b) => a.x - b.x);
      const minX   = sorted[0].x;
      const last   = sorted[sorted.length - 1];
      const maxX   = last.x + getTableSize(last).w;
      const totalW = sorted.reduce((s, t) => s + getTableSize(t).w, 0);
      const gap    = (maxX - minX - totalW) / (sorted.length - 1);
      const pos: Record<string, number> = {};
      let cx = minX;
      for (const t of sorted) { pos[t.id] = cx; cx += getTableSize(t).w + gap; }
      setTables(prev => prev.map(t => multiSel.has(t.id) ? { ...t, x: pos[t.id] } : t));
    } else {
      const sorted = [...sel].sort((a, b) => a.y - b.y);
      const minY   = sorted[0].y;
      const last   = sorted[sorted.length - 1];
      const maxY   = last.y + getTableSize(last).h;
      const totalH = sorted.reduce((s, t) => s + getTableSize(t).h, 0);
      const gap    = (maxY - minY - totalH) / (sorted.length - 1);
      const pos: Record<string, number> = {};
      let cy = minY;
      for (const t of sorted) { pos[t.id] = cy; cy += getTableSize(t).h + gap; }
      setTables(prev => prev.map(t => multiSel.has(t.id) ? { ...t, y: pos[t.id] } : t));
    }
  }

  // ── History ────────────────────────────────────────────────────────────────

  function undo() {
    if (!history.length) return;
    const prev = history[history.length - 1];
    setRedoStack(r => [{ tables, sections }, ...r.slice(0, 30)]);
    setTables(prev.tables); setSections(prev.sections);
    setHistory(h => h.slice(0, -1)); setDirty(true);
  }

  function redo() {
    if (!redoStack.length) return;
    const next = redoStack[0];
    setHistory(h => [...h, { tables, sections }]);
    setTables(next.tables); setSections(next.sections);
    setRedoStack(r => r.slice(1)); setDirty(true);
  }

  function save() { persistLayout(venueId, tables, sections); setDirty(false); }

  function reset() {
    snapshot();
    const demo = freshDemoLayout();
    setTables(demo.tables); setSections(demo.sections);
    setSelTableId(null); setSelSectionId(null); setMultiSel(new Set());
  }

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!editMode) return;
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); redo(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 's') { e.preventDefault(); save(); }
      if ((e.metaKey || e.ctrlKey) && e.key === 'd') { e.preventDefault(); duplicateTables(); }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (multiSel.size > 0 || selSectionId) deleteSelected(); }
      if (e.key === 'Escape') { setSelTableId(null); setSelSectionId(null); setMultiSel(new Set()); setContextMenu(null); setMarqueeRect(null); marqueeTrackRef.current = null; }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, selTableId, selSectionId, multiSel, history, redoStack, tables, sections]);

  // ── Derived ────────────────────────────────────────────────────────────────

  const dotGrid     = editMode ? `radial-gradient(circle, #d1d5db 1px, transparent 1px)` : undefined;
  const dotGridSize = `${GRID}px ${GRID}px`;

  const selTable   = tables.find(t => t.id === selTableId) ?? null;
  const selSection = sections.find(s => s.id === selSectionId) ?? null;
  const effectiveSelected = editMode ? selTableId : (externalSelected ?? null);

  const joinPairs = useMemo(() => {
    const pairs: [string, string][] = [];
    const seen = new Set<string>();
    for (const t of tables) {
      for (const otherId of (t.joinedWith ?? [])) {
        const key = [t.id, otherId].sort().join(':');
        if (!seen.has(key)) { seen.add(key); pairs.push([t.id, otherId]); }
      }
    }
    return pairs;
  }, [tables]);

  const canJoin       = multiSel.size >= 2;
  const canSeparate   = !!(selTableId && (selTable?.joinedWith?.length ?? 0) > 0);
  const canDuplicate  = multiSel.size > 0 || !!selTableId;
  const canBulkChange = multiSel.size > 0;
  const multiSelCount = multiSel.size;
  const multiSelTables = tables.filter(t => multiSel.has(t.id));
  const ctxTable = contextMenu ? tables.find(t => t.id === contextMenu.tableId) ?? null : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-border bg-secondary/10">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
          {editMode ? 'Edit Floor Plan' : 'Floor Plan'}
        </span>
        {!editMode && <><div className="flex-1" /><Legend tables={tables} /></>}
        {editMode && (
          <p className="text-[11px] text-gray-400">
            Click to select · Shift+click to add · <strong>Drag empty area</strong> to marquee-select · Right-click table for quick actions · ⌘Z undo · ⌘D duplicate
          </p>
        )}
      </div>

      {/* Toolbar (edit only) */}
      {editMode && (
        <Toolbar
          snapEnabled={snapEnabled}
          onToggleSnap={() => setSnapEnabled(v => !v)}
          onAddTable={addTable}
          onAddSection={addSection}
          onDelete={deleteSelected}
          onUndo={undo}
          onRedo={redo}
          onSave={save}
          onReset={reset}
          onJoin={joinTables}
          onSeparate={separateTables}
          onDuplicate={duplicateTables}
          onBulkReserve={() => bulkSetStatus('reserved')}
          onBulkFree={() => bulkSetStatus('available')}
          onAlign={alignTables}
          onDistribute={distributeTables}
          canDelete={multiSel.size > 0 || !!selSectionId}
          canUndo={history.length > 0}
          canRedo={redoStack.length > 0}
          canJoin={canJoin}
          canSeparate={canSeparate}
          canDuplicate={canDuplicate}
          canBulkChange={canBulkChange}
          multiSelCount={multiSelCount}
          dirty={dirty}
        />
      )}

      {/* Body */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Canvas */}
        <div
          ref={canvasRef}
          className="flex-1 overflow-auto"
          style={{ background: editMode ? 'white' : '#fafafa', backgroundImage: dotGrid, backgroundSize: dotGridSize,
            cursor: editMode && marqueeTrackRef.current ? 'crosshair' : undefined }}
          onMouseDown={handleCanvasMouseDown}
        >
          <div style={{ position: 'relative', width: CANVAS_W, height: CANVAS_H, minWidth: '100%', minHeight: '100%' }}>
            {/* Section labels */}
            {sections.map(sec => (
              <SectionLabel key={sec.id} section={sec} editMode={editMode}
                selected={selSectionId === sec.id}
                onMouseDown={handleSectionMouseDown}
                onClick={handleSectionClick}
                onEdit={(id, label) => updateSection(id, { label })} />
            ))}

            {/* Join connectors */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 2 }}>
              {joinPairs.map(([id1, id2]) => {
                const t1 = tables.find(t => t.id === id1);
                const t2 = tables.find(t => t.id === id2);
                if (!t1 || !t2) return null;
                const s1 = getTableSize(t1), s2 = getTableSize(t2);
                const isHighlighted = multiSel.has(id1) || multiSel.has(id2);
                return (
                  <line key={`${id1}-${id2}`}
                    x1={t1.x + s1.w / 2} y1={t1.y + s1.h / 2}
                    x2={t2.x + s2.w / 2} y2={t2.y + s2.h / 2}
                    stroke={isHighlighted ? '#6366f1' : '#a5b4fc'}
                    strokeWidth={isHighlighted ? 2.5 : 1.5}
                    strokeDasharray="6 3"
                    opacity={isHighlighted ? 0.8 : 0.45}
                  />
                );
              })}
            </svg>

            {/* Tables */}
            {tables.map(t => (
              <TableNode key={t.id} table={t}
                selected={effectiveSelected === t.id}
                multiSelected={editMode && multiSel.has(t.id) && effectiveSelected !== t.id}
                editMode={editMode}
                cleaningTimerMinutes={cleaningTimerMinutes}
                onMouseDown={handleTableMouseDown}
                onClick={handleTableClick}
                onHover={!editMode ? handleHover : () => {}}
                onResizeStart={handleResizeStart}
                onRightClick={handleTableRightClick}
              />
            ))}

            {/* Hover tooltip */}
            {!editMode && hovered && (
              <TableTooltip
                table={hovered}
                orderInfo={tableOrders?.[hovered.number] ?? null}
                style={tooltipStyle}
              />
            )}

            {/* Marquee selection rectangle */}
            {editMode && marqueeRect && (
              <div style={{
                position: 'absolute',
                left: marqueeRect.x, top: marqueeRect.y,
                width: marqueeRect.w, height: marqueeRect.h,
                border: '1.5px dashed #6366f1',
                background: 'rgba(99,102,241,0.06)',
                borderRadius: 4,
                pointerEvents: 'none',
                zIndex: 50,
              }} />
            )}

            {/* Context menu */}
            {editMode && contextMenu && ctxTable && (
              <TableContextMenu
                table={ctxTable}
                x={contextMenu.x} y={contextMenu.y}
                onClose={() => setContextMenu(null)}
                onDuplicate={() => {
                  if (!multiSel.has(contextMenu.tableId)) setMultiSel(new Set([contextMenu.tableId]));
                  duplicateTables();
                }}
                onSetStatus={(st) => {
                  if (!multiSel.has(contextMenu.tableId)) setMultiSel(new Set([contextMenu.tableId]));
                  bulkSetStatus(st);
                }}
                onDelete={() => {
                  snapshot();
                  setTables(prev => prev.filter(t => t.id !== contextMenu.tableId));
                  setSelTableId(null);
                  setMultiSel(new Set());
                }}
              />
            )}
          </div>
        </div>

        {/* Side panel */}
        {editMode && (
          <div className="shrink-0 w-56 border-l border-border bg-white overflow-hidden flex flex-col">
            <SidePanel
              table={multiSelTables.length >= 2 ? null : selTable}
              section={selSection}
              sections={sections}
              allTables={tables}
              multiSelTables={multiSelTables}
              onUpdateTable={updateTable}
              onUpdateSection={updateSection}
              onDeleteTable={(id) => { snapshot(); setTables(prev => prev.filter(t => t.id !== id)); setSelTableId(null); setMultiSel(new Set()); }}
              onDeleteSection={(id) => { snapshot(); setSections(prev => prev.filter(s => s.id !== id)); setSelSectionId(null); }}
              onBulkSetStatus={bulkSetStatus}
              onBulkSetOwner={bulkSetOwner}
              onDuplicate={duplicateTables}
              onDeleteAll={deleteSelected}
              onClose={() => { setSelTableId(null); setSelSectionId(null); setMultiSel(new Set()); }}
              defaultBookingDate={defaultBookingDate}
              onSaveBooking={onSaveBooking}
              saveBookingBusy={saveBookingBusy}
              saveBookingError={saveBookingError}
            />
          </div>
        )}
      </div>
    </div>
  );
}
