import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { pricingApi, signalApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WeatherIcon } from '@/components/ui/weather-icon';
import { AppLayout } from '@/components/AppLayout';
import { formatMultiplier, getDemandColor, cn } from '@/lib/utils';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area
} from 'recharts';
import { ChevronDown, ChevronUp, TrendingUp, Thermometer } from 'lucide-react';
import { format } from 'date-fns';

export default function History() {
  const { id: venueId } = useParams<{ id: string }>();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [hours, setHours] = useState(24);

  const { data: decisions = [], isLoading } = useQuery({
    queryKey: ['pricing-history', venueId],
    queryFn: () => pricingApi.allHistory(venueId!).then((r) => r.data.data),
    enabled: !!venueId,
  });

  const { data: signalHistory = [] } = useQuery({
    queryKey: ['signal-history', venueId, hours],
    queryFn: () => signalApi.history(venueId!, hours).then((r) => r.data.data),
    enabled: !!venueId,
  });

  const chartData = decisions.slice(0, 48).reverse().map((d: {
    decidedAt: string;
    recommendedMultiplier: string;
    appliedMultiplier: string | null;
  }) => ({
    time: format(new Date(d.decidedAt), 'HH:mm'),
    multiplier: parseFloat(String(d.recommendedMultiplier)),
    applied: d.appliedMultiplier ? parseFloat(String(d.appliedMultiplier)) : null,
  }));

  const demandChartData = signalHistory.slice(0, 100).reverse().map((s: {
    capturedAt: string;
    demandScore: number;
    temperatureC: string;
  }) => ({
    time: format(new Date(s.capturedAt), 'HH:mm'),
    demand: s.demandScore,
    temp: parseFloat(String(s.temperatureC)),
  }));

  return (
    <AppLayout>
    <div className="flex-1 overflow-y-auto">
      <header className="border-b border-border px-6 py-4 flex items-center gap-4 bg-background">
        <h1 className="text-lg font-semibold tracking-tight">Pricing History</h1>
        <div className="flex-1" />
        <div className="flex items-center gap-0.5 bg-secondary border border-border rounded-lg p-1">
          {([24, 48, 168] as const).map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                hours === h
                  ? 'bg-white text-foreground shadow-sm border border-border/60'
                  : 'text-muted-foreground hover:text-foreground hover:bg-white/60'
              )}
            >
              {h === 24 ? '24h' : h === 48 ? '48h' : '7d'}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-6xl mx-auto p-6 space-y-6">
        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Price Multiplier Over Time
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} domain={[0.8, 1.6]} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                    formatter={(v: number) => [formatMultiplier(v), 'Multiplier']}
                  />
                  <Area type="monotone" dataKey="multiplier" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.1)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="border-border shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium flex items-center gap-2">
                <Thermometer className="h-4 w-4 text-blue-600" />
                Demand Score History
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={demandChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="time" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} domain={[0, 100]} />
                  <Tooltip
                    contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: 8 }}
                  />
                  <Area type="monotone" dataKey="demand" stroke="#60a5fa" fill="rgba(96,165,250,0.1)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Decision timeline */}
        <Card className="border-border shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium">Decision Log</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12 text-muted-foreground">Loading...</div>
            ) : decisions.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                No pricing decisions yet. Trigger an analysis from the dashboard.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {decisions.map((d: {
                  id: string;
                  decidedAt: string;
                  recommendedMultiplier: string;
                  appliedMultiplier: string | null;
                  mode: string;
                  itemsUpdated: number;
                  claudeReasoning: string;
                  recommendation: { confidence: string; alert?: string | null; reviewAgainAt: string };
                  signalsSnapshot: { demandScore: number; weatherCondition: string; temperatureC: string; period: string };
                  isApproved: boolean | null;
                }) => (
                  <div key={d.id}>
                    {/* Row */}
                    <div
                      className="flex items-center gap-4 px-4 py-3 cursor-pointer hover:bg-secondary/30 transition-colors"
                      onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
                    >
                      <div className="w-28 shrink-0">
                        <div className="text-xs font-mono text-muted-foreground">
                          {format(new Date(d.decidedAt), 'MMM d HH:mm')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className={cn(
                          'text-lg font-bold',
                          parseFloat(String(d.recommendedMultiplier)) >= 1.2 ? 'text-emerald-600' :
                          parseFloat(String(d.recommendedMultiplier)) >= 1.05 ? 'text-blue-600' :
                          parseFloat(String(d.recommendedMultiplier)) <= 0.95 ? 'text-red-500' : 'text-foreground'
                        )}>
                          {formatMultiplier(parseFloat(String(d.recommendedMultiplier)))}
                        </span>
                      </div>

                      <Badge variant={
                        d.mode === 'auto' ? 'success' :
                        d.mode === 'suggested' ? 'warning' : 'secondary'
                      } className="text-xs">
                        {d.mode}
                      </Badge>

                      {d.isApproved && <Badge variant="success" className="text-xs">Applied</Badge>}

                      <span className="text-xs text-muted-foreground">
                        {d.itemsUpdated} items
                      </span>

                        {d.signalsSnapshot && (
                          <div className="flex items-center gap-2 text-xs text-muted-foreground ml-auto">
                            <span className={getDemandColor(d.signalsSnapshot.demandScore)}>
                              {d.signalsSnapshot.demandScore}
                            </span>
                            <WeatherIcon condition={d.signalsSnapshot.weatherCondition} className="h-3.5 w-3.5 text-blue-600" />
                            <span>{parseFloat(String(d.signalsSnapshot.temperatureC)).toFixed(0)}°C</span>
                            <span className="capitalize">{d.signalsSnapshot.period?.replace('_', ' ')}</span>
                          </div>
                        )}

                      <div className="ml-2 shrink-0">
                        {expandedId === d.id
                          ? <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          : <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        }
                      </div>
                    </div>

                    {/* Expanded */}
                    {expandedId === d.id && (
                      <div className="bg-secondary/20 border-t border-border px-4 py-4 space-y-3">
                        <div className="bg-white border border-border rounded-lg p-3 shadow-sm">
                          <p className="text-xs font-medium text-muted-foreground mb-1.5">Claude's Reasoning</p>
                          <p className="text-sm text-foreground leading-relaxed">{d.claudeReasoning}</p>
                        </div>

                        {d.recommendation?.alert && (
                          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                            <p className="text-xs text-amber-700">⚠️ {d.recommendation.alert}</p>
                          </div>
                        )}

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div>
                            <span className="text-muted-foreground">Confidence</span>
                            <div className="font-medium capitalize mt-0.5">{d.recommendation?.confidence}</div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Review at</span>
                            <div className="font-medium mt-0.5">
                              {d.recommendation?.reviewAgainAt
                                ? format(new Date(d.recommendation.reviewAgainAt), 'HH:mm')
                                : '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Demand</span>
                            <div className={cn('font-medium mt-0.5', getDemandColor(d.signalsSnapshot?.demandScore ?? 50))}>
                              {d.signalsSnapshot?.demandScore ?? '—'}
                            </div>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Period</span>
                            <div className="font-medium capitalize mt-0.5">
                              {d.signalsSnapshot?.period?.replace('_', ' ') ?? '—'}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
    </AppLayout>
  );
}
