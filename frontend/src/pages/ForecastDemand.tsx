import { AppLayout } from '@/components/AppLayout';
export default function ForecastDemand() {
  return (
    <AppLayout>
      <div className="h-full flex flex-col">
        <div className="h-14 border-b border-border flex items-center px-6 shrink-0">
          <h1 className="text-sm font-semibold text-foreground tracking-tight">Profit/Cost Calculator</h1>
        </div>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <p className="text-sm font-medium">Coming soon</p>
            <p className="text-xs mt-1">This page is intentionally left empty for now.</p>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
