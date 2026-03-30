import { useState, useRef, useEffect } from 'react';
import { Users, Clock, User } from 'lucide-react';
import { cn } from '@/lib/utils';

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'cleaning';

export interface BookingTable {
  id: string;
  number: string;
  section: string;
  capacity: number;
  status: TableStatus;
  shape: 'square' | 'rect-h' | 'rect-v' | 'round';
  // grid position (col, row), 1-based in a 16×10 grid
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
  // booking info (when occupied / reserved)
  guestName?: string;
  partySize?: number;
  bookingTime?: string;
  seatedAt?: string;
  notes?: string;
}

const STATUS_STYLES: Record<TableStatus, { bg: string; border: string; text: string; dot: string; label: string }> = {
  available: { bg: 'bg-green-500/15',  border: 'border-green-500/50', text: 'text-green-300',  dot: 'bg-green-400',  label: 'Available' },
  occupied:  { bg: 'bg-red-500/15',    border: 'border-red-500/50',   text: 'text-red-300',    dot: 'bg-red-400',    label: 'Occupied'  },
  reserved:  { bg: 'bg-amber-500/15',  border: 'border-amber-500/50', text: 'text-amber-300',  dot: 'bg-amber-400',  label: 'Reserved'  },
  cleaning:  { bg: 'bg-zinc-500/15',   border: 'border-zinc-500/40',  text: 'text-zinc-400',   dot: 'bg-zinc-500',   label: 'Cleaning'  },
};

interface TooltipProps {
  table: BookingTable;
  style: React.CSSProperties;
}

function Tooltip({ table, style }: TooltipProps) {
  const s = STATUS_STYLES[table.status];
  return (
    <div
      style={style}
      className="absolute z-50 w-56 rounded-xl bg-card border border-border/60 shadow-2xl p-3 pointer-events-none"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="font-semibold text-sm text-foreground">Table {table.number}</span>
        <span className={cn('text-[10px] font-medium border rounded-full px-2 py-0.5', s.text, s.border, s.bg)}>
          {s.label}
        </span>
      </div>

      <div className="space-y-1.5 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3 shrink-0" />
          <span>{table.capacity} seats · {table.section}</span>
        </div>

        {table.guestName && (
          <div className="flex items-center gap-1.5">
            <User className="h-3 w-3 shrink-0" />
            <span className="text-foreground font-medium">{table.guestName}</span>
            {table.partySize && <span>({table.partySize} guests)</span>}
          </div>
        )}

        {table.bookingTime && (
          <div className="flex items-center gap-1.5">
            <Clock className="h-3 w-3 shrink-0" />
            <span>
              {table.status === 'reserved' ? 'Arriving' : 'Seated'}
              &nbsp;{table.status === 'occupied' ? table.seatedAt : table.bookingTime}
            </span>
          </div>
        )}

        {table.notes && (
          <div className="mt-1.5 pt-1.5 border-t border-border/40 text-muted-foreground/70 italic">
            {table.notes}
          </div>
        )}
      </div>
    </div>
  );
}

interface TableSquareProps {
  table: BookingTable;
  cellW: number;
  cellH: number;
  onHover: (t: BookingTable | null, el: HTMLDivElement | null) => void;
  onClick: (t: BookingTable) => void;
  selected: boolean;
}

function TableSquare({ table, cellW, cellH, onHover, onClick, selected }: TableSquareProps) {
  const s = STATUS_STYLES[table.status];
  const colSpan = table.colSpan ?? 1;
  const rowSpan = table.rowSpan ?? 1;

  const style: React.CSSProperties = {
    gridColumn: `${table.col} / span ${colSpan}`,
    gridRow:    `${table.row} / span ${rowSpan}`,
  };

  const isRound = table.shape === 'round';

  return (
    <div
      style={style}
      className="flex items-center justify-center p-1"
    >
      <div
        ref={(el) => {
          if (el) {
            el.addEventListener('mouseenter', () => onHover(table, el));
            el.addEventListener('mouseleave', () => onHover(null, null));
          }
        }}
        onClick={() => onClick(table)}
        className={cn(
          'w-full h-full border-2 flex flex-col items-center justify-center cursor-pointer transition-all select-none',
          isRound ? 'rounded-full' : 'rounded-xl',
          s.bg, s.border,
          selected && 'ring-2 ring-primary ring-offset-1 ring-offset-background scale-105',
          'hover:scale-105 hover:brightness-110'
        )}
      >
        {/* Pulse dot for occupied */}
        {table.status === 'occupied' && (
          <span className={cn('w-1.5 h-1.5 rounded-full mb-1', s.dot, 'live-pulse')} />
        )}
        <span className={cn('text-xs font-bold', s.text)}>{table.number}</span>
        <span className="text-[9px] text-muted-foreground/60 mt-0.5 flex items-center gap-0.5">
          <Users className="h-2 w-2" />{table.capacity}
        </span>
      </div>
    </div>
  );
}

interface TableFloorPlanProps {
  tables: BookingTable[];
  selectedId: string | null;
  onSelect: (t: BookingTable) => void;
}

export function TableFloorPlan({ tables, selectedId, onSelect }: TableFloorPlanProps) {
  const [hovered, setHovered] = useState<BookingTable | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);

  const handleHover = (t: BookingTable | null, el: HTMLDivElement | null) => {
    setHovered(t);
    if (t && el && containerRef.current) {
      const cRect = containerRef.current.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      const left  = eRect.left - cRect.left + eRect.width / 2;
      const top   = eRect.top  - cRect.top  - 8;
      const tipW  = 224; // w-56
      const clampedLeft = Math.min(Math.max(left - tipW / 2, 4), cRect.width - tipW - 4);
      setTooltipStyle({
        left: clampedLeft,
        top,
        transform: 'translateY(-100%)',
      });
    }
  };

  // Group tables by section for labels
  const sections = [...new Set(tables.map((t) => t.section))];

  // Grid dimensions
  const COLS = 18;
  const ROWS = 9;
  const cellW = 100 / COLS;
  const cellH = 100 / ROWS;

  // Legend counts
  const counts = tables.reduce<Record<TableStatus, number>>((acc, t) => {
    acc[t.status] = (acc[t.status] ?? 0) + 1;
    return acc;
  }, {} as Record<TableStatus, number>);

  return (
    <div className="h-full flex flex-col">
      {/* Header bar */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2.5 border-b border-border/50 bg-secondary/10">
        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-widest">
          Floor Plan
        </span>
        <div className="flex-1" />
        {/* Legend */}
        <div className="flex items-center gap-4">
          {(Object.entries(STATUS_STYLES) as [TableStatus, typeof STATUS_STYLES[TableStatus]][]).map(([status, st]) => (
            <div key={status} className="flex items-center gap-1.5">
              <span className={cn('w-2.5 h-2.5 rounded-sm border', st.bg, st.border)} />
              <span className="text-[11px] text-muted-foreground">{st.label}</span>
              <span className="text-[11px] font-semibold text-foreground">
                {counts[status] ?? 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Floor plan grid */}
      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden p-3 bg-background/50"
      >
        {/* Section labels */}
        {[
          { label: 'Main Floor',      col: 1,  row: 1, cols: 8 },
          { label: 'Bar Area',        col: 10, row: 1, cols: 5 },
          { label: 'Private Dining',  col: 1,  row: 6, cols: 6 },
          { label: 'Terrace',         col: 10, row: 6, cols: 6 },
        ].map(({ label, col, row, cols }) => (
          <div
            key={label}
            className="absolute text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/30 pointer-events-none"
            style={{
              left:  `${((col - 1) / COLS) * 100}%`,
              top:   `${((row - 1) / ROWS) * 100}%`,
              width: `${(cols / COLS) * 100}%`,
              padding: '2px 4px',
            }}
          >
            {label}
          </div>
        ))}

        {/* Table grid */}
        <div
          className="w-full h-full"
          style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${COLS}, 1fr)`,
            gridTemplateRows:    `repeat(${ROWS}, 1fr)`,
          }}
        >
          {tables.map((table) => (
            <TableSquare
              key={table.id}
              table={table}
              cellW={cellW}
              cellH={cellH}
              onHover={handleHover}
              onClick={onSelect}
              selected={selectedId === table.id}
            />
          ))}
        </div>

        {/* Tooltip */}
        {hovered && <Tooltip table={hovered} style={tooltipStyle} />}
      </div>
    </div>
  );
}
