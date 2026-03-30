import { cn } from '@/lib/utils';
import { CreditCard, Smartphone, WalletCards, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export type TransactionStatus = 'current' | 'paid' | 'unpaid';

export interface Transaction {
  id: string;
  time: string;
  table: string;
  guest: string;
  items: number;
  subtotalPence: number;
  tipPence: number;
  totalPence: number;
  status: TransactionStatus;
  paymentMethod: 'card' | 'cash' | 'contactless' | 'tab';
  last4?: string;
}

const STATUS_BADGE: Record<TransactionStatus, { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  current: {
    label: 'In progress',
    cls: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: Clock,
  },
  paid: {
    label: 'Paid',
    cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: CheckCircle2,
  },
  unpaid: {
    label: 'Unpaid',
    cls: 'bg-red-50 text-red-600 border-red-200',
    icon: AlertCircle,
  },
};

function formatPence(v: number) {
  return `£${(v / 100).toFixed(2)}`;
}

function PaymentIcon({ method }: { method: Transaction['paymentMethod'] }) {
  if (method === 'cash') return <WalletCards className="h-3.5 w-3.5" />;
  if (method === 'contactless') return <Smartphone className="h-3.5 w-3.5" />;
  return <CreditCard className="h-3.5 w-3.5" />;
}

interface TransactionTableProps {
  transactions: Transaction[];
  selectedId: string | null;
  onSelect: (tx: Transaction) => void;
}

export function TransactionTable({ transactions, selectedId, onSelect }: TransactionTableProps) {
  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Toolbar */}
      <div className="shrink-0 flex items-center gap-3 px-4 py-2 border-b border-border bg-background">
        <span className="text-xs text-muted-foreground/60">
          {transactions.length} ticket{transactions.length !== 1 ? 's' : ''}{' · '}
          <span className="text-emerald-600">
            {transactions.filter(t => t.status === 'paid').length} paid
          </span>
          {' · '}
          <span className="text-amber-600">
            {transactions.filter(t => t.status === 'current').length} open
          </span>
          {' · '}
          <span className="text-red-500">
            {transactions.filter(t => t.status === 'unpaid').length} unpaid
          </span>
        </span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-background border-b border-border">
            <tr className="text-muted-foreground">
              <th className="text-left font-medium py-2 px-4">Time</th>
              <th className="text-left font-medium py-2 px-3">Table</th>
              <th className="text-left font-medium py-2 px-3 hidden sm:table-cell">Guest</th>
              <th className="text-center font-medium py-2 px-3">Items</th>
              <th className="text-right font-medium py-2 px-3">Total</th>
              <th className="text-left font-medium py-2 px-3 hidden md:table-cell">Payment</th>
              <th className="text-center font-medium py-2 px-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx) => {
              const badge = STATUS_BADGE[tx.status];
              const isSelected = selectedId === tx.id;
              const isCurrent = tx.status === 'current';
              return (
                <tr
                  key={tx.id}
                  onClick={() => onSelect(tx)}
                  className={cn(
                    'border-b border-border/50 cursor-pointer transition-colors',
                    isSelected
                      ? 'bg-primary/8 border-l-2 border-l-primary'
                      : isCurrent
                        ? 'bg-amber-50/60 hover:bg-amber-50'
                        : 'hover:bg-secondary/30'
                  )}
                >
                  <td className="py-2.5 px-4 text-foreground tabular-nums">{tx.time}</td>
                  <td className="py-2.5 px-3 text-muted-foreground/80">
                    <span className="font-semibold">{tx.table}</span>
                  </td>
                  <td className="py-2.5 px-3 hidden sm:table-cell text-muted-foreground/70 truncate max-w-[140px]">
                    {tx.guest || 'Walk-in'}
                  </td>
                  <td className="py-2.5 px-3 text-center tabular-nums text-muted-foreground">
                    {tx.items}
                  </td>
                  <td className="py-2.5 px-3 text-right tabular-nums font-semibold text-foreground">
                    {formatPence(tx.totalPence)}
                  </td>
                  <td className="py-2.5 px-3 hidden md:table-cell text-muted-foreground/70">
                    <span className="inline-flex items-center gap-1">
                      <PaymentIcon method={tx.paymentMethod} />
                      <span>
                        {tx.paymentMethod === 'cash' ? 'Cash' : tx.paymentMethod === 'contactless' ? 'Contactless' : 'Card'}
                        {tx.last4 && <span className="text-muted-foreground/50 ml-0.5">••{tx.last4}</span>}
                      </span>
                    </span>
                  </td>
                  <td className="py-2.5 px-3 text-center">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold',
                        badge.cls
                      )}
                    >
                      <badge.icon className="h-3 w-3" />
                      {badge.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

