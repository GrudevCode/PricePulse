import { AppLayout } from '@/components/AppLayout';
import { type LucideIcon } from 'lucide-react';

interface ComingSoonProps {
  title: string;
  description: string;
  icon: LucideIcon;
}

export function ComingSoonPage({ title, description, icon: Icon }: ComingSoonProps) {
  return (
    <AppLayout>
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 rounded-2xl bg-secondary border border-border flex items-center justify-center mx-auto mb-4 shadow-sm">
            <Icon className="h-6 w-6 text-muted-foreground/60" />
          </div>
          <h1 className="text-xl font-bold mb-2 tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed mb-4">{description}</p>
          <span className="inline-block text-xs font-medium border border-border rounded-full px-3 py-1.5 text-muted-foreground bg-secondary">
            Coming soon
          </span>
        </div>
      </div>
    </AppLayout>
  );
}

// ── Named exports for each stub page ─────────────────────────────────────────

import { BedDouble, HeadphonesIcon, Settings } from 'lucide-react';

export function RoomAnalysis() {
  return (
    <ComingSoonPage
      icon={BedDouble}
      title="Dynamic Room Analysis"
      description="Yield management for hotel rooms — AI-driven rate adjustments based on occupancy, events, and competitor rates."
    />
  );
}

export function Support() {
  return (
    <ComingSoonPage
      icon={HeadphonesIcon}
      title="Support"
      description="Get help from the PricePulse team. Documentation, live chat, and ticketing coming soon."
    />
  );
}

export function SettingsPage() {
  return (
    <ComingSoonPage
      icon={Settings}
      title="Settings"
      description="Venue preferences, notification rules, billing, and account management."
    />
  );
}
