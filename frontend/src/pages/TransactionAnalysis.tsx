import { useEffect, useRef, useState } from 'react';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { ChatPanel } from '@/components/dashboard/ChatPanel';
import { TransactionTable, type Transaction } from '@/components/transactions/TransactionTable';
import { useVenueStore } from '@/store/venueStore';
import { posApi } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  CreditCard, BrainCircuit,
} from 'lucide-react';

// ── Map a POS ticket to the Transaction display type ──────────────────────────
function mapTicket(t: Record<string, unknown>): Transaction {
  const createdAt = t.createdAt as string | undefined;
  const time = createdAt
    ? new Date(createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
    : '--:--';

  const status = t.status === 'paid' ? 'paid'
    : t.status === 'open' ? 'current'
    : 'unpaid';

  // Payment method: use last payment if closed, else tab
  const payments = t.payments as Array<Record<string, unknown>> | undefined;
  const lastPay = payments?.[0];
  const method = (lastPay?.method as string | undefined) ?? 'tab';
  const paymentMethod: Transaction['paymentMethod'] =
    method === 'contactless' ? 'contactless'
    : method === 'cash' ? 'cash'
    : method === 'card' ? 'card'
    : 'tab';
  const last4 = lastPay?.last4 as string | undefined;

  const items = t.items as Array<Record<string, unknown>> | undefined;

  return {
    id: t.id as string,
    time,
    table: (t.tableNumber as string | undefined) ?? (t.tableLabel as string | undefined) ?? 'Walk-in',
    guest: (t.guestName as string | undefined) ?? (t.ref as string | undefined) ?? 'Walk-in',
    items: items?.length ?? (t.itemCount as number | undefined) ?? 0,
    subtotalPence: (t.subtotalPence as number | undefined) ?? (t.totalPence as number | undefined) ?? 0,
    tipPence: (t.tipPence as number | undefined) ?? 0,
    totalPence: (t.totalPence as number | undefined) ?? 0,
    status,
    paymentMethod,
    last4,
  };
}

function formatPence(v: number) {
  return `£${(v / 100).toFixed(2)}`;
}

// ── AI terminal placeholder ────────────────────────────────────────────────────
function TransactionTerminal({ selected }: { selected: Transaction | null }) {
  return (
    <div className="px-4 py-3 font-mono text-xs space-y-2.5">
      <div className="flex items-center gap-2 text-muted-foreground/60">
        <span className="text-primary">›</span>
        <span>Dynamic Transaction Analysis</span>
        <span className="ml-auto text-[10px] border border-border/40 rounded px-1.5 py-0.5 text-muted-foreground/40">
          Coming soon — AI engine
        </span>
      </div>

      {selected ? (
        <div className="space-y-1.5 border-l-2 border-primary/30 pl-3">
          <div className="text-muted-foreground font-sans">
            Ticket <span className="text-foreground font-semibold">{selected.id}</span>
            {' · '}
            <span className="text-foreground font-semibold">{selected.table}</span>
            {' · '}
            {selected.items} item{selected.items !== 1 ? 's' : ''}
          </div>
          <div className="text-muted-foreground/70 font-sans">
            Guest: <span className="text-foreground">{selected.guest || 'Walk-in'}</span>
          </div>
          <div className="text-muted-foreground/70 font-sans">
            Total: <span className="text-emerald-600">{formatPence(selected.totalPence)}</span>
            {selected.tipPence > 0 && (
              <span className="text-muted-foreground/60">
                {' · '}Tip {formatPence(selected.tipPence)}
              </span>
            )}
          </div>
          <div className="pt-1 text-muted-foreground/40 font-sans text-[11px]">
            AI will soon surface checks that are under-tipping, long-open tabs, and high-value tickets
            that justify targeted price experiments.
          </div>
        </div>
      ) : (
        <div className="text-muted-foreground/40 font-sans">
          Click any ticket in the list to see a breakdown here and future AI recommendations about upsell,
          discounts, or payment issues.
        </div>
      )}
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────
export default function TransactionAnalysis() {
  const { selectedVenueId } = useVenueStore();
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(MOCK_TRANSACTIONS[0] ?? null);
  const [bottomHeight, setBottomHeight] = useState(288);
  const [rightWidth, setRightWidth] = useState(288);

  const bottomResizeRef = useRef<{ active: boolean; startY: number; startHeight: number }>({
    active: false,
    startY: 0,
    startHeight: 288,
  });
  const rightResizeRef = useRef<{ active: boolean; startX: number; startWidth: number }>({
    active: false,
    startX: 0,
    startWidth: 288,
  });

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (bottomResizeRef.current.active) {
        const delta = e.clientY - bottomResizeRef.current.startY;
        const next = Math.min(480, Math.max(160, bottomResizeRef.current.startHeight - delta));
        setBottomHeight(next);
      }
      if (rightResizeRef.current.active) {
        const deltaX = rightResizeRef.current.startX - e.clientX;
        const nextW = Math.min(420, Math.max(220, rightResizeRef.current.startWidth + deltaX));
        setRightWidth(nextW);
      }
    }
    function onMouseUp() {
      if (bottomResizeRef.current.active) bottomResizeRef.current.active = false;
      if (rightResizeRef.current.active) rightResizeRef.current.active = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, []);

  const totalRevenue = MOCK_TRANSACTIONS.reduce((s, t) => s + t.totalPence, 0);
  const paidRevenue = MOCK_TRANSACTIONS.filter(t => t.status === 'paid').reduce((s, t) => s + t.totalPence, 0);
  const openValue = MOCK_TRANSACTIONS.filter(t => t.status !== 'paid').reduce((s, t) => s + t.totalPence, 0);
  const avgTicket = MOCK_TRANSACTIONS.length > 0 ? totalRevenue / MOCK_TRANSACTIONS.length : 0;

  return (
    <AppLayout>
      <>
        {/* Header */}
        <header className="h-14 shrink-0 border-b border-border px-4 flex items-center gap-3 bg-background">
          {/* Venue selector */}
          <VenueSwitcher triggerClassName="w-44 h-9 text-sm" />

          {/* Context badge */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <CreditCard className="h-3.5 w-3.5" />
            <span>Live tickets · tonight</span>
          </div>

          <div className="flex-1" />

          {/* Stats strip */}
          <div className="hidden md:flex items-center gap-5">
            <div className="text-center">
              <div className="text-base font-bold tabular-nums text-emerald-600">
                {formatPence(paidRevenue)}
              </div>
              <div className="text-[10px] text-muted-foreground/60">Paid today</div>
            </div>
            <div className="text-center">
              <div className="text-base font-bold tabular-nums text-amber-600">
                {formatPence(openValue)}
              </div>
              <div className="text-[10px] text-muted-foreground/60">Open exposure</div>
            </div>
            <div className="text-center">
              <div className="text-base font-bold tabular-nums text-blue-600">
                {formatPence(avgTicket)}
              </div>
              <div className="text-[10px] text-muted-foreground/60">Avg ticket</div>
            </div>
          </div>
        </header>

        {/* Body: left list + bottom terminal, right chat */} 
        <div className="flex-1 flex overflow-hidden min-h-0">
          {/* Left column */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {/* TOP — transaction table */}
            <div className="flex-1 overflow-hidden border-b border-border min-h-0">
              <TransactionTable
                transactions={MOCK_TRANSACTIONS}
                selectedId={selectedTx?.id ?? null}
                onSelect={setSelectedTx}
              />
            </div>

            {/* Resize between table and terminal */}
            <div
              className="h-px cursor-row-resize bg-border hover:bg-primary/40 transition-colors"
              onMouseDown={(e) => {
                bottomResizeRef.current = {
                  active: true,
                  startY: e.clientY,
                  startHeight: bottomHeight,
                };
              }}
            />

            {/* BOTTOM — single AI analysis terminal */}
            <div
              className="shrink-0 flex flex-col terminal-panel"
              style={{ height: bottomHeight }}
            >
              <div className="shrink-0 flex items-center gap-0 border-b border-border bg-secondary/40 px-3">
                <button
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 border-primary text-primary"
                  type="button"
                >
                  <BrainCircuit className="h-3.5 w-3.5" />
                  AI Analysis
                </button>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <TransactionTerminal selected={selectedTx} />
              </div>
            </div>
          </div>

          {/* Vertical resize between main and right column */}
          <div
            className="w-px cursor-col-resize bg-border hover:bg-primary/40 transition-colors shrink-0"
            onMouseDown={(e) => {
              rightResizeRef.current = {
                active: true,
                startX: e.clientX,
                startWidth: rightWidth,
              };
            }}
          />

          {/* Right: small summary card + chat, resizable width */} 
          <div
            className="shrink-0 border-l border-border flex flex-col overflow-hidden bg-background"
            style={{ width: rightWidth }}
          >
            <div className="shrink-0 border-b border-border px-4 py-3 space-y-2.5 bg-secondary/30">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
                Transactions Snapshot
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  {
                    label: 'Tickets',
                    value: String(MOCK_TRANSACTIONS.length),
                    color: 'text-foreground',
                  },
                  {
                    label: 'Paid share',
                    value: `${Math.round((paidRevenue / (totalRevenue || 1)) * 100)}%`,
                    color: 'text-emerald-600',
                  },
                  {
                    label: 'Open tabs',
                    value: String(MOCK_TRANSACTIONS.filter(t => t.status !== 'paid').length),
                    color: 'text-amber-600',
                  },
                  {
                    label: 'Refund risk',
                    value: 'Low',
                    color: 'text-blue-600',
                  },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-white border border-border rounded-lg px-3 py-2 shadow-sm">
                    <div className="text-[10px] text-muted-foreground/60 mb-0.5 font-medium">{label}</div>
                    <div className={`text-sm font-semibold tabular-nums ${color}`}>{value}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* Chat panel */} 
            <div className="flex-1 flex flex-col overflow-hidden min-h-0">
              {selectedVenueId && <ChatPanel venueId={selectedVenueId} />}
            </div>
          </div>
        </div>
      </>
    </AppLayout>
  );
}

