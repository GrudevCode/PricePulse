import { useState, useEffect, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import {
  calendarDateLondon,
  normalizeQrMenuSettings,
  resolveQrEffectiveMenuId,
  isStructuredQrMenu,
} from '@pricepulse/shared';
import { integrationApi, dashboardApi, venueApi, menusApi, scheduleApi, menuApi } from '@/lib/api';
import {
  MenuPreviewContent,
  MenuPreviewLaptopShell,
  MenuPreviewPhoneShell,
  MenuPreviewScaledFrame,
  MenuPreviewTabletShell,
  type MenuPreviewMenuMeta,
  type MenuPreviewStyle,
} from '@/components/menu/MenuPreviewContent';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { timeAgo, cn } from '@/lib/utils';
import {
  QrCode, Check, RefreshCw, Trash2, TestTube, Plus, ExternalLink,
  CreditCard, ChefHat, Zap, Globe, Code2, X, Download, Plug,
  CalendarDays,
  type LucideIcon,
} from 'lucide-react';
import { AppLayout } from '@/components/AppLayout';
import { useVenueStore } from '@/store/venueStore';

function scheduleRowDate(row: { scheduleDate: string | Date }): string {
  const d = row.scheduleDate;
  if (typeof d === 'string') return d.slice(0, 10);
  return format(new Date(d), 'yyyy-MM-dd');
}

// ── Types & data ───────────────────────────────────────────────────────────────

interface Provider {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  highlight?: boolean;
  tag?: string;
}

const PROVIDERS: Provider[] = [
  {
    id: 'qr_only',
    name: 'QR Menu',
    description: 'Hosted live-pricing menu — no POS needed. Up and running in 60 seconds.',
    icon: QrCode,
    iconBg: 'bg-primary/10',
    iconColor: 'text-primary',
    highlight: true,
    tag: 'Recommended',
  },
  {
    id: 'square',
    name: 'Square',
    description: 'Sync menu items and prices via OAuth or a personal access token.',
    icon: CreditCard,
    iconBg: 'bg-blue-50',
    iconColor: 'text-blue-500',
  },
  {
    id: 'toast',
    name: 'Toast POS',
    description: 'Pull live menu data using your Toast client credentials.',
    icon: ChefHat,
    iconBg: 'bg-orange-50',
    iconColor: 'text-orange-500',
  },
  {
    id: 'lightspeed',
    name: 'Lightspeed',
    description: 'Authorise via OAuth to sync your Lightspeed restaurant menu.',
    icon: Zap,
    iconBg: 'bg-yellow-50',
    iconColor: 'text-yellow-500',
  },
  {
    id: 'wix',
    name: 'Wix Menus',
    description: 'Connect your Wix online menu using your API key and site ID.',
    icon: Globe,
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-500',
  },
  {
    id: 'custom_api',
    name: 'Custom API',
    description: 'Connect any REST API with configurable auth and field mapping.',
    icon: Code2,
    iconBg: 'bg-purple-50',
    iconColor: 'text-purple-500',
    tag: 'Advanced',
  },
];

const CREDENTIAL_FIELDS: Record<string, Array<{ key: string; label: string; type?: string; placeholder?: string }>> = {
  square: [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: 'sq0atp-…' },
  ],
  toast: [
    { key: 'client_id',       label: 'Client ID',       placeholder: 'your-client-id' },
    { key: 'client_secret',   label: 'Client Secret',   type: 'password', placeholder: '••••••••' },
    { key: 'restaurant_guid', label: 'Restaurant GUID', placeholder: 'xxxxxxxx-xxxx-…' },
  ],
  lightspeed: [
    { key: 'access_token', label: 'Access Token', type: 'password', placeholder: '••••••••' },
    { key: 'account_id',   label: 'Account ID',   placeholder: 'your-account-id' },
  ],
  wix: [
    { key: 'api_key', label: 'API Key', type: 'password', placeholder: '••••••••' },
    { key: 'site_id', label: 'Site ID', placeholder: 'xxxxxxxx-xxxx-…' },
  ],
  custom_api: [
    { key: 'base_url',         label: 'Base URL',           placeholder: 'https://api.yourpos.com' },
    { key: 'auth_type',        label: 'Auth type',          placeholder: 'bearer / basic / api_key_header' },
    { key: 'auth_value',       label: 'Auth value',         type: 'password', placeholder: '••••••••' },
    { key: 'get_endpoint',     label: 'GET endpoint',       placeholder: '/items' },
    { key: 'update_endpoint',  label: 'UPDATE endpoint',    placeholder: '/items/:id' },
  ],
  qr_only: [],
};

// ── Credential modal ───────────────────────────────────────────────────────────

function CredentialModal({
  provider,
  isPending,
  onSubmit,
  onClose,
}: {
  provider: Provider;
  isPending: boolean;
  onSubmit: (creds: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [credentials, setCredentials] = useState<Record<string, string>>({});
  const fields = CREDENTIAL_FIELDS[provider.id] ?? [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ paddingLeft: 'var(--sidebar-w, 0px)' }}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-[440px] max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="shrink-0 flex items-center gap-3 px-5 py-4 border-b border-border">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', provider.iconBg)}>
            <provider.icon className={cn('h-4 w-4', provider.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-foreground">Connect {provider.name}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Enter your credentials to continue</p>
          </div>
          <button onClick={onClose} className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-secondary text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form
          onSubmit={(e) => { e.preventDefault(); onSubmit(credentials); }}
          className="flex-1 overflow-y-auto px-5 py-5 space-y-4"
        >
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label className="text-xs font-medium text-foreground">{field.label}</Label>
              <Input
                type={field.type ?? 'text'}
                value={credentials[field.key] ?? ''}
                onChange={(e) => setCredentials((prev) => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder ?? field.label}
                required
                className="h-9 text-sm"
              />
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-9 text-sm border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-9 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Connecting…' : 'Connect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function Integrations() {
  const { id: venueId } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const { setSelectedVenue } = useVenueStore();

  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [qrData, setQrData]       = useState<{ menuUrl: string; qrDataUrl: string } | null>(null);
  const [testResults, setTestResults] = useState<Record<string, boolean | null>>({});

  /** Draft QR public-menu settings (saved via PATCH /venues/:id/qr-menu-settings) */
  const [menuIdPool, setMenuIdPool] = useState<Set<string>>(new Set());
  const [qrUseSchedule, setQrUseSchedule] = useState(false);
  const [qrDefaultMenuId, setQrDefaultMenuId] = useState('');
  const [previewDate, setPreviewDate] = useState(() => calendarDateLondon());

  /** Wide window so preview matches scheduler months (was 90d only). */
  const scheduleFrom = format(addDays(new Date(), -400), 'yyyy-MM-dd');
  const scheduleTo   = format(addDays(new Date(), 400), 'yyyy-MM-dd');

  const { data: venue } = useQuery({
    queryKey: ['venue', venueId],
    queryFn:  () => venueApi.get(venueId!).then((r) => r.data.data),
    enabled:  !!venueId,
  });

  const integrationPreviewStyle: MenuPreviewStyle =
    venue && (venue as { publicMenuStyle?: string | null }).publicMenuStyle === 'fast_food'
      ? 'fast_food'
      : 'gourmet';
  const integrationAccent =
    venue &&
    typeof (venue as { brandColor?: string | null }).brandColor === 'string' &&
    /^#[0-9A-Fa-f]{6}$/i.test((venue as { brandColor: string }).brandColor)
      ? (venue as { brandColor: string }).brandColor
      : '#6366f1';

  const { data: menus = [] } = useQuery({
    queryKey: ['menus', venueId],
    queryFn:  () => menusApi.list(venueId!).then((r) => r.data.data),
    enabled:  !!venueId,
  });

  const { data: scheduleRows = [] } = useQuery({
    queryKey: ['schedule', venueId, scheduleFrom, scheduleTo],
    queryFn:  () => scheduleApi.list(venueId!, scheduleFrom, scheduleTo).then((r) => r.data.data),
    enabled:  !!venueId,
  });

  const { data: menuItemsForPreview = [] } = useQuery({
    queryKey: ['menu-items', venueId],
    queryFn:  () => menuApi.list(venueId!).then((r) => r.data.data),
    enabled:  !!venueId,
  });

  useEffect(() => {
    if (!venue) return;
    const q = normalizeQrMenuSettings(venue.qrMenuSettings);
    setMenuIdPool(new Set(q.menuIds ?? []));
    setQrUseSchedule(!!q.useSchedule);
    setQrDefaultMenuId(q.defaultMenuId ?? '');
  }, [venue?.id, venue?.qrMenuSettings]);

  const draftQrPayload = useMemo(
    () => ({
      menuIds:       Array.from(menuIdPool),
      useSchedule:   qrUseSchedule,
      defaultMenuId: qrDefaultMenuId || null,
    }),
    [menuIdPool, qrUseSchedule, qrDefaultMenuId],
  );

  const effectiveMenuIdPreview = useMemo(() => {
    const row = scheduleRows.find((r: { scheduleDate: string | Date }) => scheduleRowDate(r) === previewDate);
    return resolveQrEffectiveMenuId(draftQrPayload, { scheduledMenuId: row?.menuId ?? null });
  }, [draftQrPayload, scheduleRows, previewDate]);

  /** Menu used for the dashboard-style preview (eye button layout). */
  const previewMenuForDesign = useMemo((): MenuPreviewMenuMeta | null => {
    if (effectiveMenuIdPreview) {
      const m = menus.find((x: { id: string; name: string; description?: string | null }) => x.id === effectiveMenuIdPreview);
      if (m) return { id: m.id, name: m.name, description: m.description ?? null };
      return null;
    }
    const structured = isStructuredQrMenu(normalizeQrMenuSettings(draftQrPayload));
    if (!structured && menus.length > 0) {
      const m = menus[0] as { id: string; name: string; description?: string | null };
      return { id: m.id, name: m.name, description: m.description ?? null };
    }
    return null;
  }, [effectiveMenuIdPreview, menus, draftQrPayload]);

  const saveQrSettingsMutation = useMutation({
    mutationFn: () =>
      venueApi.updateQrMenuSettings(venueId!, {
        menuIds:       draftQrPayload.menuIds,
        useSchedule:   draftQrPayload.useSchedule,
        defaultMenuId: draftQrPayload.defaultMenuId,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['venue', venueId] });
    },
  });

  function toggleMenuInPool(menuId: string) {
    setMenuIdPool((prev) => {
      const n = new Set(prev);
      if (n.has(menuId)) n.delete(menuId);
      else n.add(menuId);
      return n;
    });
  }

  const { data: integrations = [] } = useQuery({
    queryKey: ['integrations', venueId],
    queryFn:  () => integrationApi.list(venueId!).then((r) => r.data.data),
    enabled:  !!venueId,
  });

  const createMutation = useMutation({
    mutationFn: (data: Record<string, unknown>) => integrationApi.create(venueId!, data),
    onSuccess: async (resp) => {
      queryClient.invalidateQueries({ queryKey: ['integrations', venueId] });
      setConnectingProvider(null);
      if (resp.data.data.provider === 'qr_only') {
        const qrResp = await dashboardApi.qr(venueId!);
        setQrData(qrResp.data.data);
      }
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (intId: string) => integrationApi.delete(venueId!, intId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['integrations', venueId] }),
  });

  const syncMutation = useMutation({
    mutationFn: (intId: string) => integrationApi.sync(venueId!, intId),
    onSuccess:  () => queryClient.invalidateQueries({ queryKey: ['integrations', venueId] }),
  });

  async function handleTest(intId: string) {
    setTestResults((prev) => ({ ...prev, [intId]: null }));
    try {
      const resp = await integrationApi.test(venueId!, intId);
      setTestResults((prev) => ({ ...prev, [intId]: resp.data.data.connected }));
    } catch {
      setTestResults((prev) => ({ ...prev, [intId]: false }));
    }
  }

  async function handleGetQr() {
    const resp = await dashboardApi.qr(venueId!);
    setQrData(resp.data.data);
  }

  const hasQrOnlyIntegration = integrations.some((i: { provider: string }) => i.provider === 'qr_only');

  useEffect(() => {
    if (!venueId || !hasQrOnlyIntegration) {
      setQrData(null);
      return;
    }
    let cancelled = false;
    dashboardApi
      .qr(venueId)
      .then((resp) => {
        if (!cancelled) setQrData(resp.data.data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [venueId, hasQrOnlyIntegration]);

  function handleConnect(providerId: string) {
    if (providerId === 'qr_only') {
      createMutation.mutate({ provider: 'qr_only' });
    } else {
      setConnectingProvider(providerId);
    }
  }

  const connectedProviders = new Set(integrations.map((i: { provider: string }) => i.provider));
  const availableProviders = PROVIDERS.filter((p) => !connectedProviders.has(p.id));
  const connectingDef      = PROVIDERS.find((p) => p.id === connectingProvider);

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Header ── */}
        <header className="shrink-0 h-14 border-b border-border px-6 flex items-center gap-4 bg-background">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Plug className="h-4 w-4" />
          </div>
          <div>
            <span className="text-[15px] font-bold text-foreground tracking-tight">Integrations</span>
          </div>
          <div className="flex-1" />
          {/* Stats */}
          <div className="hidden md:flex items-center gap-3">
            {[
              { label: 'Connected', value: integrations.length,             color: integrations.length > 0 ? 'text-emerald-600' : 'text-muted-foreground' },
              { label: 'Available', value: availableProviders.length,       color: 'text-muted-foreground' },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className={cn('text-base font-bold tabular-nums', color)}>{value}</div>
                <div className="text-[10px] text-muted-foreground/60">{label}</div>
              </div>
            ))}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-8 space-y-10">

            {/* ── QR menu URL: menus, schedule, preview ───────────────────── */}
            {venue && (
              <section className="rounded-2xl border border-border bg-white p-5 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
                      <QrCode className="h-4 w-4 text-primary" />
                      Public QR menu
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xl">
                      One link for guests. Choose which menus are allowed, optionally follow your{' '}
                      <Link
                        to="/scheduler"
                        onClick={() => venueId && setSelectedVenue(venueId)}
                        className="text-primary underline-offset-2 hover:underline font-medium"
                      >
                        menu schedule
                      </Link>
                      , set a fallback, then save. Calendar dates use Europe/London (same as the live page).
                    </p>
                  </div>
                  <a
                    href={`/menu/${venue.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded-lg text-foreground hover:bg-secondary shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open live menu
                  </a>
                </div>

                <div className="rounded-xl border border-border bg-secondary/30 px-4 py-3 space-y-3">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Menus on this QR link
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Tick the menus guests may see. Leave all unticked to allow any menu when using the schedule (or any scheduled menu with no pool).
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {menus.length === 0 && (
                      <span className="text-xs text-muted-foreground">No menus yet — create one in the menu editor.</span>
                    )}
                    {menus.map((m: { id: string; name: string }) => (
                      <label
                        key={m.id}
                        className={cn(
                          'inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs cursor-pointer transition-colors',
                          menuIdPool.has(m.id)
                            ? 'border-primary bg-primary/10 text-foreground'
                            : 'border-border bg-white hover:bg-secondary/50',
                        )}
                      >
                        <input
                          type="checkbox"
                          className="rounded border-border"
                          checked={menuIdPool.has(m.id)}
                          onChange={() => toggleMenuInPool(m.id)}
                        />
                        {m.name}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                  <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-white px-4 py-3 flex-1">
                    <div>
                      <p className="text-sm font-medium text-foreground">Follow menu schedule</p>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Use the assignment for each calendar day when resolving the menu.
                      </p>
                    </div>
                    <Switch checked={qrUseSchedule} onCheckedChange={setQrUseSchedule} />
                  </div>
                  <div className="flex-1 min-w-[200px] space-y-1.5">
                    <Label className="text-xs font-medium">Fallback menu</Label>
                    <select
                      value={qrDefaultMenuId}
                      onChange={(e) => setQrDefaultMenuId(e.target.value)}
                      className="w-full h-9 text-sm rounded-md border border-border bg-white px-2"
                    >
                      <option value="">None</option>
                      {(menuIdPool.size > 0
                        ? menus.filter((m: { id: string }) => menuIdPool.has(m.id))
                        : menus
                      ).map((m: { id: string; name: string }) => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-end">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium flex items-center gap-1.5">
                      <CalendarDays className="h-3.5 w-3.5" />
                      Preview date
                    </Label>
                    <Input
                      type="date"
                      value={previewDate}
                      onChange={(e) => setPreviewDate(e.target.value)}
                      className="h-9 w-[200px] text-sm"
                    />
                  </div>
                  <div className="flex-1 rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                    {(() => {
                      const structured = isStructuredQrMenu(normalizeQrMenuSettings(draftQrPayload));
                      const name = effectiveMenuIdPreview
                        ? menus.find((x: { id: string }) => x.id === effectiveMenuIdPreview)?.name
                        : null;
                      if (!structured) {
                        return 'Not using structured menus: guests see the full legacy menu (all items by category label).';
                      }
                      if (name) {
                        return (
                          <span>
                            For <span className="font-medium text-foreground">{previewDate}</span>, the QR page resolves to{' '}
                            <span className="font-medium text-foreground">{name}</span>.
                          </span>
                        );
                      }
                      return (
                        <span>
                          For <span className="font-medium text-foreground">{previewDate}</span>, no menu matched — assign that day in the scheduler or adjust pool / fallback.
                        </span>
                      );
                    })()}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => saveQrSettingsMutation.mutate()}
                    disabled={saveQrSettingsMutation.isPending}
                    className="h-9 px-4 text-sm font-medium rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {saveQrSettingsMutation.isPending ? 'Saving…' : 'Save QR menu settings'}
                  </button>
                  {saveQrSettingsMutation.isSuccess && (
                    <span className="text-xs text-emerald-600 font-medium">Saved</span>
                  )}
                </div>

                <div className="pt-2 border-t border-border">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Preview (same design as Menu Editor eye button)
                  </p>
                  <p className="text-[11px] text-muted-foreground mb-4 max-w-2xl">
                    Open the{' '}
                    <a href={`/menu/${venue.slug}?forDate=${encodeURIComponent(previewDate)}`} target="_blank" rel="noopener noreferrer" className="text-primary underline-offset-2 hover:underline">
                      guest-facing HTML menu
                    </a>{' '}
                    in a new tab if you need the public page.
                  </p>
                  {!isStructuredQrMenu(normalizeQrMenuSettings(draftQrPayload)) && previewMenuForDesign && (
                    <p className="text-[11px] text-amber-900/80 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 mb-4 max-w-2xl mx-auto text-center">
                      Live QR is the legacy full menu. This preview uses your first menu to show the same layout as the dashboard eye icon.
                    </p>
                  )}
                  {previewMenuForDesign && venueId ? (
                    <div className="flex flex-wrap gap-10 justify-center items-start">
                      <MenuPreviewScaledFrame label="Phone" scale={0.88}>
                        <MenuPreviewPhoneShell>
                          <MenuPreviewContent
                            menu={previewMenuForDesign}
                            venueId={venueId}
                            venueName={venue.name}
                            menuData={menuItemsForPreview}
                            menuStyle={integrationPreviewStyle}
                            accentColor={integrationAccent}
                          />
                        </MenuPreviewPhoneShell>
                      </MenuPreviewScaledFrame>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Tablet
                        </span>
                        <MenuPreviewTabletShell>
                          <MenuPreviewContent
                            menu={previewMenuForDesign}
                            venueId={venueId}
                            venueName={venue.name}
                            menuData={menuItemsForPreview}
                            menuStyle={integrationPreviewStyle}
                            accentColor={integrationAccent}
                          />
                        </MenuPreviewTabletShell>
                      </div>
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Laptop
                        </span>
                        <MenuPreviewLaptopShell>
                          <MenuPreviewContent
                            menu={previewMenuForDesign}
                            venueId={venueId}
                            venueName={venue.name}
                            menuData={menuItemsForPreview}
                            menuStyle={integrationPreviewStyle}
                            accentColor={integrationAccent}
                          />
                        </MenuPreviewLaptopShell>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground text-center py-10 border border-dashed border-border rounded-xl bg-muted/20">
                      Add a menu and resolve a menu for this preview date to see the phone layout here.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* QR banner */}
            {qrData && (
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-5 flex items-start gap-5">
                <img
                  src={qrData.qrDataUrl}
                  alt="Menu QR Code"
                  className="w-28 h-28 rounded-xl border border-border shrink-0 bg-white p-1"
                />
                <div className="flex-1 min-w-0 space-y-3 pt-1">
                  <div>
                    <h3 className="text-[14px] font-semibold text-foreground">Your QR menu is live</h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      Print and place on tables — prices update in real-time.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 bg-white border border-border rounded-lg px-3 py-2">
                    <span className="text-xs font-mono text-primary flex-1 truncate">{qrData.menuUrl}</span>
                    <a href={qrData.menuUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  </div>
                  {/localhost|127\.0\.0\.1/i.test(qrData.menuUrl) && (
                    <p className="text-[11px] text-amber-900/90 bg-amber-50 border border-amber-200/80 rounded-lg px-3 py-2 leading-snug">
                      QR codes with <code className="text-[10px]">localhost</code> will not open on a phone — the phone
                      is not your computer. Set <code className="text-[10px]">QR_MENU_PUBLIC_URL</code> to your dev
                      machine&apos;s LAN origin only (e.g.{' '}
                      <code className="text-[10px]">http://192.168.1.5:5173</code>
                      ), not <code className="text-[10px]">/menu/...</code> — that path is added automatically. Restart
                      the API, then refresh this page to regenerate the QR.
                    </p>
                  )}
                  <a
                    href={qrData.qrDataUrl}
                    download="pricepulse-qr.png"
                    className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-medium border border-border rounded-lg bg-white hover:bg-secondary transition-colors text-foreground"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Download QR
                  </a>
                </div>
              </div>
            )}

            {/* ── Connected ── */}
            {integrations.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Connected</h2>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">{integrations.length} active</span>
                </div>

                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {integrations.map((int: {
                    id: string; provider: string; lastSyncAt?: string; isActive: boolean;
                  }) => {
                    const provider   = PROVIDERS.find((p) => p.id === int.provider);
                    const testResult = testResults[int.id];

                    return (
                      <div key={int.id} className="flex items-center gap-4 px-4 py-3.5 bg-white hover:bg-gray-50/60 transition-colors">
                        {/* Icon */}
                        {provider && (
                          <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', provider.iconBg)}>
                            <provider.icon className={cn('h-4 w-4', provider.iconColor)} />
                          </div>
                        )}

                        {/* Name + meta */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-foreground">{provider?.name ?? int.provider}</span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200">
                              <Check className="h-2.5 w-2.5" />
                              Connected
                            </span>
                            {testResult === true  && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-emerald-50 text-emerald-700 border-emerald-200">Test passed</span>}
                            {testResult === false && <span className="text-[10px] font-semibold rounded-full px-2 py-0.5 border bg-red-50 text-red-700 border-red-200">Test failed</span>}
                          </div>
                          {int.lastSyncAt && (
                            <p className="text-[11px] text-muted-foreground mt-0.5">Last synced {timeAgo(int.lastSyncAt)}</p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          {int.provider === 'qr_only' && (
                            <button
                              onClick={handleGetQr}
                              className="flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-lg text-foreground hover:bg-secondary transition-colors"
                            >
                              <QrCode className="h-3.5 w-3.5" />
                              View QR
                            </button>
                          )}
                          <button
                            onClick={() => syncMutation.mutate(int.id)}
                            disabled={syncMutation.isPending}
                            className="flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-lg text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                          >
                            <RefreshCw className={cn('h-3.5 w-3.5', syncMutation.isPending && 'animate-spin')} />
                            Sync
                          </button>
                          <button
                            onClick={() => handleTest(int.id)}
                            className="flex items-center gap-1.5 h-8 px-3 text-xs border border-border rounded-lg text-foreground hover:bg-secondary transition-colors"
                          >
                            <TestTube className="h-3.5 w-3.5" />
                            Test
                          </button>
                          <button
                            onClick={() => deleteMutation.mutate(int.id)}
                            className="h-8 w-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-500 hover:bg-red-50 transition-colors"
                            title="Remove integration"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ── Available ── */}
            {availableProviders.length > 0 && (
              <section>
                <div className="flex items-center gap-3 mb-4">
                  <h2 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-widest">Available</h2>
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[11px] text-muted-foreground">{availableProviders.length} integrations</span>
                </div>

                <div className="rounded-xl border border-border overflow-hidden divide-y divide-border">
                  {availableProviders.map((provider) => (
                    <div
                      key={provider.id}
                      className={cn(
                        'flex items-start gap-4 px-4 py-4 bg-white hover:bg-gray-50/60 transition-colors',
                        provider.highlight && 'bg-primary/3 hover:bg-primary/5',
                      )}
                    >
                      {/* Icon */}
                      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5', provider.iconBg)}>
                        <provider.icon className={cn('h-5 w-5', provider.iconColor)} />
                      </div>

                      {/* Name + description */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span className="text-sm font-semibold text-foreground whitespace-nowrap">{provider.name}</span>
                          {provider.tag && (
                            <span className={cn(
                              'text-[10px] font-semibold rounded-full px-2 py-0.5 border',
                              provider.highlight
                                ? 'bg-primary/10 text-primary border-primary/20'
                                : 'bg-secondary text-muted-foreground border-border',
                            )}>
                              {provider.tag}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground leading-relaxed">{provider.description}</p>
                      </div>

                      {/* Connect button */}
                      <button
                        onClick={() => handleConnect(provider.id)}
                        disabled={createMutation.isPending}
                        className={cn(
                          'flex items-center gap-1.5 h-8 px-4 text-xs font-medium rounded-lg transition-colors shrink-0 disabled:opacity-50 mt-0.5',
                          provider.highlight
                            ? 'bg-primary text-white hover:bg-primary/90'
                            : 'border border-border text-foreground hover:bg-secondary',
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {provider.id === 'qr_only' ? 'Get QR menu' : 'Connect'}
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* All connected */}
            {availableProviders.length === 0 && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 px-5 py-8 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-3">
                  <Check className="h-5 w-5 text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">All integrations connected</p>
                <p className="text-xs text-muted-foreground mt-1">You're using every available integration.</p>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Credential modal */}
      {connectingProvider && connectingDef && (
        <CredentialModal
          provider={connectingDef}
          isPending={createMutation.isPending}
          onSubmit={(creds) => createMutation.mutate({ provider: connectingProvider, credentials: creds })}
          onClose={() => setConnectingProvider(null)}
        />
      )}
    </AppLayout>
  );
}
