import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatPence, formatMultiplier, cn, timeAgo } from '@/lib/utils';
import {
  CheckCircle2, XCircle, TrendingUp, TrendingDown, Minus,
  AlertTriangle, RefreshCw, Clock, BrainCircuit, ChevronRight,
} from 'lucide-react';
import { pricingApi } from '@/lib/api';

interface RecommendedPrice {
  itemId: string;
  newPricePence: number;
  changeReason: string;
}

interface ClaudeRecommendation {
  overallMultiplier: number;
  confidence: 'high' | 'medium' | 'low';
  reasoning: string;
  recommendedPrices: RecommendedPrice[];
  reviewAgainAt: string;
  alert?: string | null;
}

interface MenuItem {
  id: string;
  name: string;
  category: string;
  basePrice: number;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  isDynamicPricingEnabled: boolean;
}

interface PricingDecision {
  id: string;
  decidedAt: string;
  claudeReasoning: string;
  recommendedMultiplier: string;
  appliedMultiplier: string | null;
  itemsUpdated: number;
  mode: string;
  recommendation: ClaudeRecommendation;
  isApproved: boolean | null;
}

interface PricingPanelProps {
  venueId: string;
  pricingMode: 'auto' | 'suggest' | 'manual';
  decision: PricingDecision | null;
  menuItems: MenuItem[];
  onApproved: () => void;
  onTrigger: () => void;
  isLoading: boolean;
}

const CONF_COLOR = {
  high:   'text-emerald-700 border-emerald-500/40 bg-emerald-50',
  medium: 'text-amber-700  border-amber-500/40  bg-amber-50',
  low:    'text-red-600    border-red-400/40    bg-red-50',
};

export function PricingPanel({
  venueId, pricingMode, decision, menuItems, onApproved, onTrigger, isLoading,
}: PricingPanelProps) {
  const [approving, setApproving] = useState(false);
  const [countdown, setCountdown] = useState(300);

  const rec = decision?.recommendation;
  const multiplier = rec?.overallMultiplier ?? 1;
  const isAwaitingApproval = pricingMode === 'suggest' && decision && !decision.isApproved;

  useEffect(() => {
    if (!isAwaitingApproval) return;
    setCountdown(300);
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(id);
  }, [decision?.id, isAwaitingApproval]);

  const handleApprove = async () => {
    if (!decision) return;
    setApproving(true);
    try {
      await pricingApi.approve(venueId, decision.id);
      onApproved();
    } catch (err) {
      console.error('Approve failed:', err);
    } finally {
      setApproving(false);
    }
  };

  const priceMap = new Map(rec?.recommendedPrices?.map((r) => [r.itemId, r]) ?? []);
  const isUp   = multiplier > 1.01;
  const isDown = multiplier < 0.99;

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!decision) {
    return (
      <div className="flex items-center gap-6 h-full px-5">
        <div className="w-10 h-10 rounded-xl bg-secondary/60 border border-border/40 flex items-center justify-center shrink-0">
          <BrainCircuit className="h-5 w-5 text-muted-foreground/50" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-muted-foreground">No analysis yet</p>
          <p className="text-xs text-muted-foreground/50 mt-0.5">
            Click <span className="text-primary font-medium">Trigger</span> in the header to run AI pricing analysis
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={onTrigger} disabled={isLoading} className="shrink-0">
          <RefreshCw className={cn('h-3.5 w-3.5 mr-2', isLoading && 'animate-spin')} />
          {isLoading ? 'Analysing…' : 'Run now'}
        </Button>
      </div>
    );
  }

  // ── Terminal output ────────────────────────────────────────────────────────
  return (
    <div className="px-4 py-3 space-y-3 font-mono text-xs">

      {/* Status line */}
      <div className="flex items-center gap-3 flex-wrap">
        <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />

        {/* Multiplier */}
        <span className={cn(
          'text-lg font-bold tabular-nums',
          isUp ? 'text-emerald-600' : isDown ? 'text-red-500' : 'text-foreground'
        )}>
          {isUp ? '+' : ''}{((multiplier - 1) * 100).toFixed(1)}%
          <span className="text-xs font-normal text-muted-foreground ml-1.5">
            ({formatMultiplier(multiplier)})
          </span>
        </span>

        {/* Confidence */}
        {rec?.confidence && (
          <span className={cn(
            'text-[10px] font-semibold border rounded-full px-2 py-0.5 uppercase tracking-wide',
            CONF_COLOR[rec.confidence]
          )}>
            {rec.confidence}
          </span>
        )}

        {/* Mode */}
        <Badge variant={pricingMode === 'auto' ? 'success' : pricingMode === 'suggest' ? 'warning' : 'secondary'} className="text-[10px]">
          {pricingMode}
        </Badge>

        {/* Timestamp */}
        <span className="text-muted-foreground/40 text-[10px] ml-auto flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {timeAgo(decision.decidedAt)}
          {decision.isApproved && (
            <span className="text-green-400 flex items-center gap-1 ml-2">
              <CheckCircle2 className="h-3 w-3" />applied
            </span>
          )}
          {isAwaitingApproval && (
            <span className="text-amber-600 ml-2">
              expires {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
            </span>
          )}
        </span>
      </div>

      {/* Alert */}
      {rec?.alert && (
        <div className="flex items-start gap-2 text-amber-700 border-l-2 border-amber-400 pl-3">
          <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
          <span className="font-sans text-[11px] leading-relaxed">{rec.alert}</span>
        </div>
      )}

      {/* Reasoning */}
      <p className="font-sans text-[11px] leading-relaxed text-muted-foreground border-l-2 border-primary/25 pl-3">
        {decision.claudeReasoning}
      </p>

      {/* Approve / reject — suggest mode */}
      {isAwaitingApproval && (
        <div className="flex items-center gap-2 pt-1">
          <Button
            size="sm"
            variant="success"
            onClick={handleApprove}
            disabled={approving}
            className="h-7 text-xs gap-1.5"
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            Apply prices
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5 border-red-300 text-red-600 hover:bg-red-50"
            onClick={onTrigger}
            disabled={isLoading}
          >
            <XCircle className="h-3.5 w-3.5" />
            Re-analyse
          </Button>
        </div>
      )}

      {/* Per-item breakdown (only dynamic items with a recommendation) */}
      {menuItems.length > 0 && rec?.recommendedPrices && rec.recommendedPrices.length > 0 && (
        <div className="pt-1 space-y-0.5">
          <div className="text-[10px] text-muted-foreground/40 uppercase tracking-widest mb-1.5">
            — Item breakdown —
          </div>
          {menuItems
            .filter((item) => priceMap.has(item.id))
            .map((item) => {
              const rp = priceMap.get(item.id)!;
              const diff = rp.newPricePence - item.basePrice;
              const pct  = ((diff / item.basePrice) * 100).toFixed(1);
              const up   = diff > 0;
              const down = diff < 0;

              return (
                <div key={item.id} className="flex items-baseline gap-2 text-[11px]">
                  <span className="w-2 text-primary/50 shrink-0">›</span>
                  <span className="text-muted-foreground w-36 truncate shrink-0 font-sans">{item.name}</span>
                  <span className="text-muted-foreground/50 tabular-nums shrink-0">
                    {formatPence(item.basePrice)}
                  </span>
                  <span className="text-muted-foreground/30 shrink-0">→</span>
                  <span className={cn(
                    'font-bold tabular-nums shrink-0',
                    up ? 'text-emerald-600' : down ? 'text-red-500' : 'text-muted-foreground'
                  )}>
                    {formatPence(rp.newPricePence)}
                  </span>
                  <span className={cn(
                    'shrink-0',
                    up ? 'text-emerald-600/80' : down ? 'text-red-500/80' : 'text-muted-foreground/40'
                  )}>
                    {up ? <TrendingUp className="h-2.5 w-2.5 inline" /> : down ? <TrendingDown className="h-2.5 w-2.5 inline" /> : <Minus className="h-2.5 w-2.5 inline" />}
                    {up ? '+' : ''}{pct}%
                  </span>
                  {rp.changeReason && (
                    <span className="text-muted-foreground/40 font-sans truncate min-w-0">
                      · {rp.changeReason}
                    </span>
                  )}
                </div>
              );
            })}
        </div>
      )}
    </div>
  );
}
