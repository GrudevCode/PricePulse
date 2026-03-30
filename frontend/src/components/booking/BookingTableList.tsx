import { cn } from '@/lib/utils';
import { Users, Clock, User, ChevronRight } from 'lucide-react';
import type { FPTable, TableStatus } from './FloorPlanEditor';

// Re-export for callers that still use the old name
export type { FPTable as BookingTable };

const STATUS_LABEL: Record<TableStatus, { label: string; cls: string }> = {
  available: { label: 'Available', cls: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
  occupied:  { label: 'Occupied',  cls: 'text-red-600    bg-red-50      border-red-200'     },
  reserved:  { label: 'Reserved',  cls: 'text-amber-700  bg-amber-50    border-amber-200'   },
  cleaning:  { label: 'Cleaning',  cls: 'text-zinc-600   bg-zinc-100    border-zinc-200'    },
};

interface BookingTableListProps {
  tables: FPTable[];
  selectedId: string | null;
  onSelect: (t: FPTable) => void;
}

export function BookingTableList({ tables, selectedId, onSelect }: BookingTableListProps) {
  const sections = [...new Set(tables.map((t) => t.section))];

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-background">
        <span className="text-xs text-muted-foreground/60">
          {tables.length} tables ·{' '}
          <span className="text-emerald-600">{tables.filter(t => t.status === 'available').length} free</span>
          {' · '}
          <span className="text-red-500">{tables.filter(t => t.status === 'occupied').length} occupied</span>
          {' · '}
          <span className="text-amber-600">{tables.filter(t => t.status === 'reserved').length} reserved</span>
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-2 px-4">Table</th>
              <th className="text-left font-medium py-2 px-3">Section</th>
              <th className="text-center font-medium py-2 px-3">Seats</th>
              <th className="text-center font-medium py-2 px-3">Status</th>
              <th className="text-left font-medium py-2 px-3 hidden sm:table-cell">Guest</th>
              <th className="text-left font-medium py-2 px-3 hidden md:table-cell">Time</th>
              <th className="text-left font-medium py-2 px-3 hidden lg:table-cell">Notes</th>
              <th className="py-2 px-3 w-6" />
            </tr>
          </thead>
          <tbody>
            {sections.map((section) => {
              const sectionTables = tables.filter(t => t.section === section);
              return (
                <>
                  <tr key={`sec-${section}`} className="bg-secondary/40 border-y border-border">
                    <td colSpan={8} className="px-4 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                      {section} ({sectionTables.length})
                    </td>
                  </tr>
                  {sectionTables.map((table) => {
                    const st = STATUS_LABEL[table.status];
                    const isSelected = selectedId === table.id;
                    return (
                      <tr
                        key={table.id}
                        onClick={() => onSelect(table)}
                        className={cn(
                          'border-b border-border/50 transition-colors cursor-pointer',
                          isSelected
                            ? 'bg-primary/8 border-l-2 border-l-primary'
                            : 'hover:bg-secondary/30'
                        )}
                      >
                        <td className="py-2.5 px-4">
                          <span className="font-bold text-foreground">T{table.number}</span>
                        </td>
                        <td className="py-2.5 px-3 text-muted-foreground/70">{table.section}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="flex items-center justify-center gap-1 text-muted-foreground">
                            <Users className="h-3 w-3" />{table.capacity}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={cn('text-[10px] font-semibold border rounded-full px-2 py-0.5', st.cls)}>
                            {st.label}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 hidden sm:table-cell">
                          {table.guestName ? (
                            <span className="flex items-center gap-1 text-foreground">
                              <User className="h-3 w-3 text-muted-foreground/60 shrink-0" />
                              {table.guestName}
                              {table.partySize && (
                                <span className="text-muted-foreground/50 ml-1">({table.partySize})</span>
                              )}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 hidden md:table-cell">
                          {(table.bookingTime || table.seatedAt) ? (
                            <span className="flex items-center gap-1 text-muted-foreground/70">
                              <Clock className="h-3 w-3 shrink-0" />
                              {table.status === 'occupied' ? table.seatedAt : table.bookingTime}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 hidden lg:table-cell text-muted-foreground/50 max-w-[160px] truncate">
                          {table.notes ?? '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <ChevronRight className={cn(
                            'h-3.5 w-3.5 transition-colors',
                            isSelected ? 'text-primary' : 'text-muted-foreground/20'
                          )} />
                        </td>
                      </tr>
                    );
                  })}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
