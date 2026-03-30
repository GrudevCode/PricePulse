import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  Calculator, Zap, MonitorSmartphone, ChefHat, ArrowRight,
} from 'lucide-react';

// ─── Optimizer definitions ─────────────────────────────────────────────────────

interface Optimizer {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  description: string;
  href?: string;
}

const OPTIMIZERS: Optimizer[] = [
  {
    id: 'profit-cost-calculator',
    icon: Calculator,
    label: 'Profit / Cost Calculator',
    description: 'Build recipes line by line, track ingredient costs with live inventory pricing, and calculate your exact GP margin and suggested sell price.',
    href: '/optimizers/recipe-calculator',
  },
  {
    id: 'dynamic-pricing',
    icon: Zap,
    label: 'Dynamic Pricing',
    description: 'Automatically adjust menu prices in real-time based on occupancy, time of day, and live demand signals to maximise revenue.',
    href: '/optimizers/dynamic-pricing',
  },
  {
    id: 'intelligent-menu',
    icon: ChefHat,
    label: 'Intelligent Menu',
    description: 'Live algorithm auto-hides dishes when ingredients run out, reorders by margin and velocity, and lets you feature high-value items.',
    href: '/optimizers/intelligent-menu',
  },
  {
    id: 'pos',
    icon: MonitorSmartphone,
    label: 'POS',
    description: 'POS simulator and integration workspace. Test pricing rules against real order flows before pushing live.',
    href: '/optimizers/pos',
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function Optimizers() {
  const navigate = useNavigate();

  return (
    <AppLayout>
      <div className="flex flex-col h-full">

        {/* Header */}
        <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-semibold text-foreground tracking-tight">Optimizers</h1>
            <p className="text-[11px] text-muted-foreground">
              AI-powered tools to maximise revenue, reduce waste, and run a smarter operation
            </p>
          </div>
        </div>

        {/* Tool list */}
        <div className="flex-1 overflow-y-auto">
          <div className="divide-y divide-border">
            {OPTIMIZERS.map((opt) => {
              const Icon = opt.icon;
              const live = !!opt.href;
              return (
                <div
                  key={opt.id}
                  onClick={() => live && navigate(opt.href!)}
                  className={cn(
                    'group flex items-center gap-5 px-6 py-5 transition-colors duration-150',
                    live
                      ? 'cursor-pointer hover:bg-muted/40'
                      : 'cursor-default',
                  )}
                >
                  {/* Icon */}
                  <div className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors duration-150',
                    live
                      ? 'border-border bg-background text-muted-foreground group-hover:border-primary/30 group-hover:text-primary'
                      : 'border-border/50 bg-muted/30 text-muted-foreground/40',
                  )}>
                    <Icon className="h-4.5 w-4.5 h-[18px] w-[18px]" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground">{opt.label}</span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed max-w-2xl">
                      {opt.description}
                    </p>
                  </div>

                  {/* Arrow */}
                  {live && (
                    <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground/40 transition-all duration-150 group-hover:text-primary group-hover:translate-x-0.5" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

      </div>
    </AppLayout>
  );
}
