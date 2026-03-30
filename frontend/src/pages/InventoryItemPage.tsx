import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { useInventoryStore, deriveStatus } from '@/store/inventoryStore';
import { cn } from '@/lib/utils';
import { inventoryApi } from '@/lib/api';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { InventoryUnitSelect } from '@/components/inventory/InventoryUnitSelect';
import { ArrowLeft, Package, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react';

function formatPence(v: number) { return `£${(v / 100).toFixed(2)}`; }

const STATUS_STYLES = {
  low:  { badge: 'bg-red-50 text-red-700 border-red-200',      bar: 'bg-red-400',     label: 'Below par'    },
  ok:   { badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', bar: 'bg-emerald-400', label: 'Healthy' },
  high: { badge: 'bg-blue-50 text-blue-700 border-blue-200',   bar: 'bg-blue-400',    label: 'Overstocked'  },
};

// ── Field components ──────────────────────────────────────────────────────────

function FieldGroup({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <div>
        <label className="block text-sm font-medium text-foreground">{label}</label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

const inputCls = 'w-full h-9 text-sm border border-border rounded-lg px-3 bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-foreground';

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InventoryItemPage() {
  const { id: venueId, itemId } = useParams<{ id: string; itemId: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { items, setItems, updateItem, deleteItem } = useInventoryStore();

  useEffect(() => {
    async function load() {
      if (!venueId) return;
      try {
        const resp = await inventoryApi.list(venueId, new Date().toISOString().slice(0, 10));
        const mapped = (resp.data.data ?? []).map((it: any) => ({
          id: it.id,
          name: it.name,
          category: it.category,
          onHand: it.onHand,
          parLevel: it.parLevel,
          unit: it.unit,
          unitCostPence: it.unitCostPence,
          velocityPerNight: Number(it.velocityPerNight),
          status: it.liveAvailabilityStatus === 'critical'
            ? 'low'
            : it.liveAvailabilityStatus === 'low'
              ? 'low'
              : deriveStatus(it.onHand, it.parLevel),
        }));
        setItems(mapped);
      } catch (err) {
        console.error('[InventoryItemPage] Failed to load inventory:', err);
      }
    }
    void load();
  }, [venueId, setItems]);

  useEffect(() => {
    if (!venueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(venueId);
    const refresh = async () => {
      try {
        const resp = await inventoryApi.list(venueId, new Date().toISOString().slice(0, 10));
        const mapped = (resp.data.data ?? []).map((it: any) => ({
          id: it.id,
          name: it.name,
          category: it.category,
          onHand: it.onHand,
          parLevel: it.parLevel,
          unit: it.unit,
          unitCostPence: it.unitCostPence,
          velocityPerNight: Number(it.velocityPerNight),
          status: it.liveAvailabilityStatus === 'critical'
            ? 'low'
            : it.liveAvailabilityStatus === 'low'
              ? 'low'
              : deriveStatus(it.onHand, it.parLevel),
        }));
        setItems(mapped);
      } catch (err) {
        console.error('[InventoryItemPage] Live refresh failed:', err);
      }
    };
    const handler = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === venueId) void refresh();
    };
    socket.on('inventory:updated', handler);
    socket.on('bookings:updated', handler);
    return () => {
      socket.off('inventory:updated', handler);
      socket.off('bookings:updated', handler);
      leaveVenueRoom(venueId);
    };
  }, [venueId, setItems, accessToken]);

  const item = items.find((i) => i.id === itemId);

  // ── Not found ──
  if (!item) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
          <Package className="h-10 w-10 text-border" />
          <p className="text-sm">Item not found.</p>
          <button
            onClick={() => navigate(`/venues/${venueId}/inventory`)}
            className="text-primary text-sm hover:underline"
          >
            ← Back to inventory
          </button>
        </div>
      </AppLayout>
    );
  }

  return <ItemForm key={item.id} item={item} venueId={venueId ?? ''} onUpdate={updateItem} onDelete={deleteItem} navigate={navigate} />;
}

// Separate component so useState initialises from the correct item
function ItemForm({
  item,
  venueId,
  onUpdate,
  onDelete,
  navigate,
}: {
  item: ReturnType<typeof useInventoryStore.getState>['items'][number];
  venueId: string;
  onUpdate: (i: typeof item) => void;
  onDelete: (id: string) => void;
  navigate: ReturnType<typeof useNavigate>;
}) {
  const [name,      setName]      = useState(item.name);
  const [category,  setCategory]  = useState(item.category);
  const [unit,      setUnit]      = useState(item.unit);
  const [onHand,    setOnHand]    = useState(String(item.onHand));
  const [parLevel,  setParLevel]  = useState(String(item.parLevel));
  const [costPound, setCostPound] = useState(String((item.unitCostPence / 100).toFixed(2)));
  const [velocity,  setVelocity]  = useState(String(item.velocityPerNight));
  const [saved,     setSaved]     = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const onHandNum   = Math.max(0, Number(onHand)   || 0);
  const parLevelNum = Math.max(0, Number(parLevel)  || 0);
  const previewStatus = deriveStatus(onHandNum, parLevelNum);
  const st = STATUS_STYLES[previewStatus];
  const fillPct = parLevelNum > 0 ? Math.min(100, Math.round((onHandNum / parLevelNum) * 100)) : 0;

  const stockValue = Math.round((parseFloat(costPound) || 0) * 100) * onHandNum;
  const daysRemaining = velocity && parseFloat(velocity) > 0
    ? (onHandNum / parseFloat(velocity)).toFixed(1)
    : null;

  function handleSave() {
    if (venueId) {
      void inventoryApi.update(venueId, item.id, {
        name: name.trim() || item.name,
        category: category.trim() || item.category,
        unit: unit.trim() || item.unit,
        onHand: onHandNum,
        parLevel: parLevelNum,
        unitCostPence: Math.round((parseFloat(costPound) || 0) * 100),
        velocityPerNight: Math.max(0, parseFloat(velocity) || 0),
        status: previewStatus,
      });
    }
    onUpdate({
      ...item,
      name:             name.trim() || item.name,
      category:         category.trim() || item.category,
      unit:             unit.trim() || item.unit,
      onHand:           onHandNum,
      parLevel:         parLevelNum,
      unitCostPence:    Math.round((parseFloat(costPound) || 0) * 100),
      velocityPerNight: Math.max(0, parseFloat(velocity) || 0),
      status:           previewStatus,
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleDelete() {
    if (venueId) void inventoryApi.remove(venueId, item.id);
    onDelete(item.id);
    navigate(`/venues/${venueId}/inventory`);
  }

  return (
    <AppLayout>
      <div className="flex flex-col h-full overflow-hidden" style={{ animation: 'page-enter 0.25s ease both' }}>

        {/* ── Top bar ── */}
        <header className="shrink-0 h-14 border-b border-border px-4 flex items-center gap-3 bg-background">
          <button
            onClick={() => navigate(`/venues/${venueId}/inventory`)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Inventory
          </button>

          <span className="text-muted-foreground/40">/</span>
          <span className="text-sm font-medium text-foreground truncate max-w-xs">{item.name}</span>

          <div className="flex-1" />

          <span className={cn('text-[11px] font-semibold rounded-full px-2.5 py-0.5 border inline-flex items-center gap-1', st.badge)}>
            {previewStatus === 'ok'
              ? <CheckCircle2 className="h-3 w-3" />
              : <AlertTriangle className="h-3 w-3" />
            }
            {st.label}
          </span>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-8 space-y-8">

            {/* Title */}
            <div>
              <h1 className="text-xl font-bold text-foreground">{name || item.name}</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">
                <span>{category}</span>
                <span className="text-muted-foreground/50"> · </span>
                <span className="font-medium text-foreground">Unit: {unit.trim() || '—'}</span>
              </p>
            </div>

            {/* ── Stats strip ── */}
            <div className="grid grid-cols-3 gap-4">
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Stock value</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{formatPence(stockValue)}</p>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Par fill</p>
                <p className="text-lg font-bold tabular-nums text-foreground">{fillPct}%</p>
                <div className="mt-1.5 h-1 rounded-full bg-gray-100 overflow-hidden">
                  <div className={cn('h-full rounded-full', st.bar)} style={{ width: `${fillPct}%` }} />
                </div>
              </div>
              <div className="rounded-xl border border-border bg-background px-4 py-3">
                <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold mb-1">Est. days left</p>
                <p className="text-lg font-bold tabular-nums text-foreground">
                  {daysRemaining ? `${daysRemaining}d` : '—'}
                </p>
              </div>
            </div>

            {/* ── Basic info ── */}
            <section className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary/20">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest">Basic info</h2>
              </div>
              <div className="px-5 py-5 space-y-5">
                <FieldGroup label="Item name">
                  <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </FieldGroup>

                <FieldGroup label="Section / category" hint="The kitchen or bar section this item belongs to">
                  <input value={category} onChange={(e) => setCategory(e.target.value)} className={inputCls} placeholder="e.g. Hot Kitchen, Bar…" />
                </FieldGroup>

                <FieldGroup label="Unit" hint="How stock on hand is counted (matches recipes when linked)">
                  <InventoryUnitSelect
                    value={unit}
                    onChange={setUnit}
                    triggerClassName={inputCls}
                    inputClassName={inputCls}
                  />
                </FieldGroup>
              </div>
            </section>

            {/* ── Stock levels ── */}
            <section className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary/20">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest">Stock levels</h2>
              </div>
              <div className="px-5 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <FieldGroup label="Quantity on hand">
                    <input
                      type="number" min="0"
                      value={onHand}
                      onChange={(e) => setOnHand(e.target.value)}
                      className={inputCls}
                    />
                  </FieldGroup>
                  <FieldGroup label="Par level" hint="Target minimum quantity">
                    <input
                      type="number" min="0"
                      value={parLevel}
                      onChange={(e) => setParLevel(e.target.value)}
                      className={inputCls}
                    />
                  </FieldGroup>
                </div>

                {/* Visual fill */}
                {parLevelNum > 0 && (
                  <div>
                    <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                      <span>0</span>
                      <span className="font-medium text-foreground">{onHandNum} / {parLevelNum} {unit}</span>
                      <span>{parLevelNum}</span>
                    </div>
                    <div className="h-3 rounded-full bg-gray-100 overflow-hidden">
                      <div className={cn('h-full rounded-full transition-all', st.bar)} style={{ width: `${fillPct}%` }} />
                    </div>
                    <div className="flex justify-between mt-1.5 text-[10px] text-muted-foreground">
                      <span className={cn('font-semibold', { 'text-red-500': previewStatus === 'low', 'text-blue-600': previewStatus === 'high', 'text-emerald-600': previewStatus === 'ok' })}>
                        {st.label}
                      </span>
                      <span>{fillPct}% of par</span>
                    </div>
                  </div>
                )}

                {parLevelNum > 0 && onHandNum < parLevelNum && (
                  <div className="rounded-lg bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-700">
                    <strong>{parLevelNum - onHandNum}</strong> {unit} needed to reach par level.
                  </div>
                )}
              </div>
            </section>

            {/* ── Costs & velocity ── */}
            <section className="rounded-xl border border-border bg-background overflow-hidden">
              <div className="px-5 py-3 border-b border-border bg-secondary/20">
                <h2 className="text-xs font-semibold text-foreground uppercase tracking-widest">Costs &amp; velocity</h2>
              </div>
              <div className="px-5 py-5 space-y-5">
                <div className="grid grid-cols-2 gap-5">
                  <FieldGroup label="Unit cost" hint="Cost per unit to purchase">
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground pointer-events-none">£</span>
                      <input
                        type="number" min="0" step="0.01"
                        value={costPound}
                        onChange={(e) => setCostPound(e.target.value)}
                        className={cn(inputCls, 'pl-6')}
                      />
                    </div>
                  </FieldGroup>

                  <FieldGroup label="Nightly usage" hint="Average units used per night">
                    <input
                      type="number" min="0" step="0.1"
                      value={velocity}
                      onChange={(e) => setVelocity(e.target.value)}
                      className={inputCls}
                    />
                  </FieldGroup>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-1">
                  <div className="rounded-lg bg-secondary/30 border border-border px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Stock value</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">{formatPence(stockValue)}</p>
                  </div>
                  <div className="rounded-lg bg-secondary/30 border border-border px-3 py-2.5">
                    <p className="text-[10px] text-muted-foreground mb-0.5">Est. days remaining</p>
                    <p className="text-sm font-semibold tabular-nums text-foreground">
                      {daysRemaining ? `${daysRemaining} days` : '—'}
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* ── Danger zone ── */}
            <section className="rounded-xl border border-red-200 bg-background overflow-hidden">
              <div className="px-5 py-3 border-b border-red-100 bg-red-50/40">
                <h2 className="text-xs font-semibold text-red-600 uppercase tracking-widest">Danger zone</h2>
              </div>
              <div className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Delete this item</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Permanently remove from inventory. This cannot be undone.</p>
                </div>
                {showDeleteConfirm ? (
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-red-600 font-medium">Are you sure?</span>
                    <button
                      onClick={handleDelete}
                      className="h-8 px-3 text-xs bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 transition-colors"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="h-8 px-3 text-xs border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="flex items-center gap-1.5 h-8 px-3 text-xs border border-red-200 text-red-600 rounded-lg hover:bg-red-50 transition-colors shrink-0"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete item
                  </button>
                )}
              </div>
            </section>

            {/* bottom padding */}
            <div className="h-4" />
          </div>
        </div>

        {/* ── Sticky footer ── */}
        <div className="shrink-0 border-t border-border bg-background px-6 py-3 flex items-center justify-end gap-3">
          {saved && (
            <span className="text-xs text-emerald-600 font-medium mr-auto flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Saved
            </span>
          )}
          <button
            onClick={() => navigate(`/venues/${venueId}/inventory`)}
            className="h-9 px-4 text-sm border border-border rounded-lg text-muted-foreground hover:bg-secondary transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleSave}
            className="h-9 px-5 text-sm bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
          >
            Save changes
          </button>
        </div>

      </div>
    </AppLayout>
  );
}
