import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { InventoryTable, type InventoryItem } from '@/components/inventory/InventoryTable';
import { useVenueStore } from '@/store/venueStore';
import { useInventoryStore, deriveStatus } from '@/store/inventoryStore';
import { inventoryApi } from '@/lib/api';
import { defaultPresetSectionDefs } from '@/lib/inventorySectionNames';
import { getSocket, joinVenueRoom, leaveVenueRoom } from '@/lib/socket';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { InventoryUnitSelect } from '@/components/inventory/InventoryUnitSelect';
import {
  Package, Flame, Snowflake, Sparkles, Wine, ChefHat, Tag,
  Pencil, Trash2, Check, X, Plus, ExternalLink,
} from 'lucide-react';

// ── Section nav helpers ────────────────────────────────────────────────────────

interface SectionDef { id: string; name: string }

const PRESET_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  'Hot Kitchen':  Flame,
  'Cold Kitchen': Snowflake,
  'Desserts':     Sparkles,
  'Bar':          Wine,
  'Prep':         ChefHat,
};
function getSectionIcon(name: string) { return PRESET_ICONS[name] ?? Tag; }

function formatPence(v: number) { return `£${(v / 100).toFixed(2)}`; }

// ── Edit panel ────────────────────────────────────────────────────────────────

function EditPanel({
  item,
  sections,
  onClose,
  onSave,
  onOpenPage,
  onDelete,
  deleteBusy,
}: {
  item: InventoryItem;
  sections: SectionDef[];
  onClose: () => void;
  onSave: (updated: InventoryItem) => void;
  onOpenPage: () => void;
  onDelete?: () => void;
  deleteBusy?: boolean;
}) {
  const [name,     setName]     = useState(item.name);
  const [category, setCategory] = useState(item.category);
  const [unit,     setUnit]     = useState(item.unit);
  const [onHand,   setOnHand]   = useState(String(item.onHand));
  const [parLevel, setParLevel] = useState(String(item.parLevel));
  const [costPence, setCostPence] = useState(String((item.unitCostPence / 100).toFixed(2)));
  const [velocity, setVelocity] = useState(String(item.velocityPerNight));

  const previewStatus = deriveStatus(Number(onHand) || 0, Number(parLevel) || 0);

  const STATUS_BADGE = {
    low:  'bg-red-50 text-red-700 border-red-200',
    ok:   'bg-emerald-50 text-emerald-700 border-emerald-200',
    high: 'bg-blue-50 text-blue-700 border-blue-200',
  };
  const STATUS_LABEL = { low: 'Below par', ok: 'Healthy', high: 'Overstocked' };

  function handleSave() {
    onSave({
      ...item,
      name:              name.trim() || item.name,
      category,
      unit:              unit.trim() || item.unit,
      onHand:            Math.max(0, Number(onHand)    || 0),
      parLevel:          Math.max(0, Number(parLevel)  || 0),
      unitCostPence:     Math.round((parseFloat(costPence) || 0) * 100),
      velocityPerNight:  Math.max(0, parseFloat(velocity)  || 0),
      status:            previewStatus,
    });
    onClose();
  }

  const inputCls = 'w-full h-8 text-xs border border-border rounded-lg px-2.5 bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50';
  const labelCls = 'block text-[10px] font-semibold text-gray-400 uppercase tracking-widest mb-1';

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="shrink-0 flex items-start justify-between px-4 py-3 border-b border-border">
        <div className="min-w-0 pr-2">
          <h3 className="text-[13px] font-semibold text-gray-900 truncate">{item.name}</h3>
          <p className="mt-0.5 text-[11px] text-gray-400">
            {item.category}
            <span className="text-gray-300"> · </span>
            <span className="font-medium text-gray-600">Unit: {unit.trim() || '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={deleteBusy}
              title="Remove from inventory"
              className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={onOpenPage}
            title="Open full edit page"
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 hover:text-primary transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onClose}
            className="h-7 w-7 rounded-lg flex items-center justify-center hover:bg-gray-100 text-gray-400 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3.5">

        {/* Status preview */}
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400 uppercase tracking-widest font-semibold">Status</span>
          <span className={cn('text-[10px] font-semibold rounded-full px-2.5 py-0.5 border', STATUS_BADGE[previewStatus])}>
            {STATUS_LABEL[previewStatus]}
          </span>
        </div>

        <div>
          <label className={labelCls}>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        </div>

        <div>
          <label className={labelCls}>Section</label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className={inputCls}>
              <SelectValue placeholder="Select section" />
            </SelectTrigger>
            <SelectContent>
              {sections.map((s) => <SelectItem key={s.id} value={s.name}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className={labelCls}>Unit</label>
          <InventoryUnitSelect value={unit} onChange={setUnit} triggerClassName={inputCls} inputClassName={inputCls} />
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>On hand</label>
            <input type="number" min="0" value={onHand} onChange={(e) => setOnHand(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Par level</label>
            <input type="number" min="0" value={parLevel} onChange={(e) => setParLevel(e.target.value)} className={inputCls} />
          </div>
        </div>

        {/* Par fill bar */}
        {Number(parLevel) > 0 && (
          <div>
            <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden">
              <div
                className={cn('h-full rounded-full transition-all', {
                  'bg-red-400':     previewStatus === 'low',
                  'bg-amber-400':   previewStatus === 'low',
                  'bg-emerald-400': previewStatus === 'ok',
                  'bg-blue-400':    previewStatus === 'high',
                })}
                style={{ width: `${Math.min(100, Math.round((Number(onHand) / Number(parLevel)) * 100))}%` }}
              />
            </div>
            <p className="text-[10px] text-gray-400 mt-1">
              {Math.round((Number(onHand) / Number(parLevel)) * 100)}% of par
            </p>
          </div>
        )}

        <div>
          <label className={labelCls}>Unit cost (£)</label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">£</span>
            <input
              type="number" min="0" step="0.01"
              value={costPence}
              onChange={(e) => setCostPence(e.target.value)}
              className={cn(inputCls, 'pl-5')}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>Nightly usage (units)</label>
          <input type="number" min="0" step="0.1" value={velocity} onChange={(e) => setVelocity(e.target.value)} className={inputCls} />
        </div>

      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-t border-border">
        <button
          onClick={onClose}
          className="flex-1 h-8 text-xs border border-border rounded-lg text-gray-500 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          className="flex-1 h-8 text-xs bg-primary text-white rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────────

export default function InventoryAnalysis() {
  const { id: venueId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const accessToken = useAuthStore((s) => s.accessToken);
  const { selectedVenueId } = useVenueStore();
  const { items, setItems, updateItem, deleteItem } = useInventoryStore();

  const [sections, setSections] = useState<SectionDef[]>(() => defaultPresetSectionDefs());
  const [activeSection, setActiveSection] = useState<string>('All');
  const [selectedItem,  setSelectedItem]  = useState<InventoryItem | null>(null);

  // section editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [addingNew, setAddingNew] = useState(false);
  const [newName,   setNewName]   = useState('');
  const [loading,   setLoading]   = useState(false);
  const [sectionError, setSectionError] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    category: '',
    unit: '',
    onHand: '0',
    parLevel: '0',
    unitCost: '0.00',
    velocity: '0',
  });

  const addInputRef  = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  function startEdit(sec: SectionDef) {
    setEditingId(sec.id);
    setEditValue(sec.name);
    setTimeout(() => editInputRef.current?.focus(), 0);
  }
  function confirmEdit() {
    const trimmed = editValue.trim();
    if (trimmed && editingId) {
      const old = sections.find((s) => s.id === editingId)?.name;
      setSections((prev) => prev.map((s) => s.id === editingId ? { ...s, name: trimmed } : s));
      if (old && activeSection === old) setActiveSection(trimmed);
      if (selectedVenueId) {
        void inventoryApi.renameSection(selectedVenueId, editingId, trimmed)
          .catch((err) => {
            console.error('[InventoryAnalysis] Failed to rename section:', err);
            setSectionError('Failed to rename section in database');
          });
      }
    }
    setEditingId(null);
  }
  function deleteSection(id: string) {
    const sec = sections.find((s) => s.id === id);
    if (selectedVenueId) {
      void inventoryApi.deleteSection(selectedVenueId, id)
        .then(() => {
          setSections((prev) => prev.filter((s) => s.id !== id));
          if (sec && activeSection === sec.name) setActiveSection('All');
        })
        .catch((err: any) => {
          const msg = err?.response?.data?.error ?? 'Failed to delete section';
          setSectionError(msg);
          console.error('[InventoryAnalysis] Failed to delete section:', err);
        });
      return;
    }
    setSections((prev) => prev.filter((s) => s.id !== id));
    if (sec && activeSection === sec.name) setActiveSection('All');
  }
  function startAdd() {
    setAddingNew(true);
    setNewName('');
    setTimeout(() => addInputRef.current?.focus(), 0);
  }
  function confirmAdd() {
    const trimmed = newName.trim();
    if (trimmed) {
      if (selectedVenueId) {
        void inventoryApi.createSection(selectedVenueId, trimmed)
          .then((resp) => {
            const created = resp.data.data;
            setSections((prev) => [...prev, { id: created.id, name: created.name }]);
            setActiveSection(trimmed);
          })
          .catch((err: any) => {
            const msg = err?.response?.data?.error ?? 'Failed to create section';
            setSectionError(msg);
            console.error('[InventoryAnalysis] Failed to create section:', err);
          });
      } else {
        const id = `custom-${Date.now()}`;
        setSections((prev) => [...prev, { id, name: trimmed }]);
        setActiveSection(trimmed);
      }
    }
    setAddingNew(false);
    setNewName('');
  }

  const filteredItems =
    activeSection === 'All'
      ? items
      : items.filter((i) => i.category === activeSection);

  const totalValue = items.reduce((sum, i) => sum + i.unitCostPence * i.onHand, 0);
  const lowCount   = items.filter((i) => i.status === 'low').length;
  const highCount  = items.filter((i) => i.status === 'high').length;
  const okCount    = items.filter((i) => i.status === 'ok').length;

  function sectionStats(name: string) {
    const list = name === 'All' ? items : items.filter((i) => i.category === name);
    return { total: list.length, low: list.filter((i) => i.status === 'low').length };
  }

  const inputCls = 'flex-1 min-w-0 h-6 text-xs bg-white border border-primary/40 rounded px-1.5 outline-none focus:ring-1 focus:ring-primary/30';

  const sectionNamesForAdd = useMemo(() => sections.map((s) => s.name).filter(Boolean), [sections]);

  useEffect(() => {
    if (!showAddModal) return;
    setAddForm((f) => {
      const cat = f.category.trim();
      if (cat && sectionNamesForAdd.includes(cat)) return f;
      const pref =
        activeSection !== 'All' && sectionNamesForAdd.includes(activeSection)
          ? activeSection
          : (sectionNamesForAdd[0] ?? '');
      return { ...f, category: pref };
    });
  }, [showAddModal, sectionNamesForAdd, activeSection]);

  async function handleCreateInventoryItem() {
    if (!selectedVenueId) return;
    setAddError(null);
    const onHand = Math.max(0, Number(addForm.onHand) || 0);
    const parLevel = Math.max(0, Number(addForm.parLevel) || 0);
    const velocity = Math.max(0, Number(addForm.velocity) || 0);
    const unitCostPence = Math.round((Number(addForm.unitCost) || 0) * 100);

    if (!addForm.name.trim()) {
      setAddError('Item name is required');
      return;
    }
    if (!addForm.category.trim()) {
      setAddError('Section is required');
      return;
    }
    if (!addForm.unit.trim()) {
      setAddError('Unit is required');
      return;
    }

    setAddBusy(true);
    try {
      await inventoryApi.create(selectedVenueId, {
        name: addForm.name.trim(),
        category: addForm.category.trim(),
        unit: addForm.unit.trim(),
        onHand,
        parLevel,
        unitCostPence,
        velocityPerNight: velocity,
        status: deriveStatus(onHand, parLevel),
      });
      setShowAddModal(false);
      const firstCat = sectionNamesForAdd[0] ?? '';
      setAddForm({
        name: '',
        category: firstCat,
        unit: '',
        onHand: '0',
        parLevel: '0',
        unitCost: '0.00',
        velocity: '0',
      });
      const resp = await inventoryApi.list(selectedVenueId, new Date().toISOString().slice(0, 10));
      const mapped: InventoryItem[] = (resp.data.data ?? []).map((it: any) => ({
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
    } catch (err: any) {
      setAddError(err?.response?.data?.error ?? 'Failed to create inventory item');
    } finally {
      setAddBusy(false);
    }
  }

  async function handleDeleteSelectedItem() {
    if (!selectedVenueId || !selectedItem) return;
    if (!window.confirm(`Delete “${selectedItem.name}” from inventory? This cannot be undone.`)) return;
    setDeleteBusy(true);
    try {
      await inventoryApi.remove(selectedVenueId, selectedItem.id);
      deleteItem(selectedItem.id);
      setSelectedItem(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error ?? 'Failed to delete item';
      window.alert(msg);
    } finally {
      setDeleteBusy(false);
    }
  }

  useEffect(() => {
    async function loadSections() {
      if (!selectedVenueId) return;
      try {
        const resp = await inventoryApi.sections(selectedVenueId);
        const mapped: SectionDef[] = (resp.data.data ?? []).map((s: any) => ({ id: s.id, name: s.name }));
        setSections(mapped.length ? mapped : defaultPresetSectionDefs());
      } catch (err) {
        console.error('[InventoryAnalysis] Failed to load sections:', err);
      }
    }
    async function loadInventory() {
      if (!selectedVenueId) return;
      setLoading(true);
      try {
        await loadSections();
        const resp = await inventoryApi.list(selectedVenueId, new Date().toISOString().slice(0, 10));
        const mapped: InventoryItem[] = (resp.data.data ?? []).map((it: any) => ({
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
        console.error('[InventoryAnalysis] Failed to load inventory:', err);
      } finally {
        setLoading(false);
      }
    }
    void loadInventory();
  }, [selectedVenueId, setItems]);

  useEffect(() => {
    if (!selectedVenueId || !accessToken) return;
    const socket = getSocket();
    joinVenueRoom(selectedVenueId);

    const refresh = async () => {
      try {
        const resp = await inventoryApi.list(selectedVenueId, new Date().toISOString().slice(0, 10));
        const mapped: InventoryItem[] = (resp.data.data ?? []).map((it: any) => ({
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
        console.error('[InventoryAnalysis] Live refresh failed:', err);
      }
    };

    const onInventory = (payload: { venueId?: string }) => {
      if (!payload?.venueId || payload.venueId === selectedVenueId) void refresh();
    };
    socket.on('inventory:updated', onInventory);
    socket.on('bookings:updated', onInventory);
    const poll = window.setInterval(() => void refresh(), 20000);
    return () => {
      window.clearInterval(poll);
      socket.off('inventory:updated', onInventory);
      socket.off('bookings:updated', onInventory);
      leaveVenueRoom(selectedVenueId);
    };
  }, [selectedVenueId, setItems, accessToken]);

  return (
    <AppLayout>
      <>
        {/* ── Header ── */}
        <header className="h-14 shrink-0 border-b border-border px-4 flex items-center gap-3 bg-background">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Package className="h-3.5 w-3.5" />
            <span>Inventory Editor · Restaurant &amp; Bar</span>
            <button
              type="button"
              onClick={() => {
                setAddError(null);
                setShowAddModal(true);
              }}
              className="ml-3 h-8 px-3 rounded-lg bg-primary text-white text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-primary/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add item
            </button>
          </div>

          <div className="flex-1" />

          <div className="hidden md:flex items-center gap-5">
            {[
              { label: 'Stock on hand', value: formatPence(totalValue), color: 'text-foreground'      },
              { label: 'Total SKUs',    value: String(items.length),    color: 'text-foreground'      },
              { label: 'Below par',     value: String(lowCount),        color: 'text-red-500'         },
              { label: 'Overstocked',   value: String(highCount),       color: 'text-blue-600'        },
              { label: 'Healthy',       value: String(okCount),         color: 'text-emerald-600'     },
            ].map(({ label, value, color }) => (
              <div key={label} className="text-center">
                <div className={`text-base font-bold tabular-nums ${color}`}>{value}</div>
                <div className="text-[10px] text-muted-foreground/60">{label}</div>
              </div>
            ))}
          </div>
        </header>
        {sectionError && (
          <div className="px-4 py-2 text-xs text-red-600 border-b border-red-100 bg-red-50">
            {sectionError}
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex-1 flex overflow-hidden min-h-0">

          {/* Left nav */}
          <div className="w-52 shrink-0 border-r border-border flex flex-col bg-secondary/20 overflow-hidden">
            <div className="px-4 py-3 border-b border-border">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                Restaurant &amp; Bar
              </p>
            </div>

            <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
              {/* All */}
              {(() => {
                const { total, low } = sectionStats('All');
                return (
                  <button
                    type="button"
                    onClick={() => setActiveSection('All')}
                    className={cn(
                      'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors',
                      activeSection === 'All'
                        ? 'bg-primary/10 text-primary font-semibold'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                    )}
                  >
                    <Package className="h-3.5 w-3.5 shrink-0" />
                    <span className="flex-1">All</span>
                    <span className={cn('text-[10px] font-mono tabular-nums', low > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground/50')}>
                      {total}
                    </span>
                    {low > 0 && (
                      <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold shrink-0">
                        {low}
                      </span>
                    )}
                  </button>
                );
              })()}

              {/* Dynamic sections */}
              {sections.map((sec) => {
                const { total, low } = sectionStats(sec.name);
                const Icon = getSectionIcon(sec.name);
                const isActive  = activeSection === sec.name;
                const isEditing = editingId === sec.id;

                return (
                  <div key={sec.id} className="group relative">
                    {isEditing ? (
                      <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-primary/30">
                        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <input
                          ref={editInputRef}
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') confirmEdit(); if (e.key === 'Escape') setEditingId(null); }}
                          className={inputCls}
                        />
                        <button type="button" onClick={confirmEdit} className="text-emerald-600 hover:text-emerald-700 shrink-0"><Check className="h-3.5 w-3.5" /></button>
                        <button type="button" onClick={() => setEditingId(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveSection(sec.name)}
                        className={cn(
                          'w-full text-left flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs transition-colors',
                          isActive
                            ? 'bg-primary/10 text-primary font-semibold'
                            : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                        )}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        <span className="flex-1 truncate">{sec.name}</span>
                        <span className="hidden group-hover:flex items-center gap-0.5 shrink-0" onClick={(e) => e.stopPropagation()}>
                          <button type="button" onClick={() => startEdit(sec)} className="p-0.5 rounded text-muted-foreground/60 hover:text-primary hover:bg-primary/10" title="Rename"><Pencil className="h-3 w-3" /></button>
                          <button type="button" onClick={() => deleteSection(sec.id)} className="p-0.5 rounded text-muted-foreground/60 hover:text-red-500 hover:bg-red-50" title="Delete"><Trash2 className="h-3 w-3" /></button>
                        </span>
                        <span className="flex group-hover:hidden items-center gap-1 shrink-0">
                          <span className={cn('text-[10px] font-mono tabular-nums', low > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground/50')}>{total}</span>
                          {low > 0 && <span className="flex items-center justify-center w-3.5 h-3.5 rounded-full bg-red-100 text-red-600 text-[9px] font-bold">{low}</span>}
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}

              {/* Add section */}
              {addingNew ? (
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white border border-primary/30 mt-1">
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <input
                    ref={addInputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') confirmAdd(); if (e.key === 'Escape') { setAddingNew(false); setNewName(''); } }}
                    placeholder="Section name…"
                    className={inputCls}
                  />
                  <button type="button" onClick={confirmAdd} className="text-emerald-600 hover:text-emerald-700 shrink-0"><Check className="h-3.5 w-3.5" /></button>
                  <button type="button" onClick={() => { setAddingNew(false); setNewName(''); }} className="text-muted-foreground hover:text-foreground shrink-0"><X className="h-3.5 w-3.5" /></button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={startAdd}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-muted-foreground/60 hover:text-primary hover:bg-primary/5 transition-colors mt-1 border border-dashed border-border hover:border-primary/30"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add section
                </button>
              )}
            </nav>

            {/* Summary */}
            <div className="shrink-0 p-3 border-t border-border space-y-1.5">
              {(['low', 'ok', 'high'] as const).map((st) => {
                const count = filteredItems.filter((i) => i.status === st).length;
                const labels = { low: 'Below par', ok: 'Healthy', high: 'Overstocked' };
                const colors = { low: 'text-red-500', ok: 'text-emerald-600', high: 'text-blue-600' };
                return (
                  <div key={st} className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground/60">{labels[st]}</span>
                    <span className={cn('font-semibold tabular-nums', colors[st])}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Main: table */}
          <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-border bg-background text-xs text-muted-foreground">
              <span className="text-muted-foreground/50">Restaurant &amp; Bar</span>
              <span className="text-muted-foreground/30">›</span>
              <span className="font-medium text-foreground">{activeSection}</span>
              <span className="ml-auto text-muted-foreground/40">
                {filteredItems.length} item{filteredItems.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex-1 overflow-hidden min-h-0">
              {loading ? (
                <div className="h-full w-full flex items-center justify-center text-sm text-muted-foreground">
                  Loading inventory...
                </div>
              ) : (
                <InventoryTable
                  items={filteredItems}
                  selectedId={selectedItem?.id ?? null}
                  onSelect={setSelectedItem}
                />
              )}
            </div>
          </div>

          {/* Edit panel */}
          {selectedItem && (
            <div className="shrink-0 w-72 border-l border-border bg-white overflow-hidden flex flex-col">
              <EditPanel
                key={selectedItem.id}
                item={selectedItem}
                sections={sections}
                onClose={() => setSelectedItem(null)}
                onDelete={selectedVenueId ? () => void handleDeleteSelectedItem() : undefined}
                deleteBusy={deleteBusy}
                onSave={(updated) => {
                  if (selectedVenueId) {
                    void inventoryApi.update(selectedVenueId, updated.id, {
                      name: updated.name,
                      category: updated.category,
                      onHand: updated.onHand,
                      parLevel: updated.parLevel,
                      unit: updated.unit,
                      unitCostPence: updated.unitCostPence,
                      velocityPerNight: updated.velocityPerNight,
                      status: updated.status,
                    });
                  }
                  updateItem(updated);
                  setSelectedItem(updated);
                }}
                onOpenPage={() =>
                  navigate(`/venues/${venueId}/inventory/item/${selectedItem.id}`)
                }
              />
            </div>
          )}
        </div>

        {showAddModal && (
          <div className="fixed inset-0 z-50 bg-black/35 flex items-center justify-center p-4">
            <div className="w-full max-w-md rounded-xl bg-white border border-border shadow-xl overflow-hidden">
              <div className="h-12 border-b border-border px-4 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Add inventory item</h3>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="h-7 w-7 rounded-lg hover:bg-gray-100 inline-flex items-center justify-center"
                >
                  <X className="h-4 w-4 text-gray-500" />
                </button>
              </div>
              <div className="p-4 space-y-3">
                {addError && <p className="text-xs text-red-600">{addError}</p>}
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Item name</label>
                  <input
                    className="w-full h-9 text-sm border rounded-lg px-3"
                    value={addForm.name}
                    onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Section</label>
                  <Select
                    value={addForm.category || '__none__'}
                    onValueChange={(v) => setAddForm((f) => ({ ...f, category: v === '__none__' ? '' : v }))}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Select section</SelectItem>
                      {sectionNamesForAdd.map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">On hand</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full h-9 text-sm border rounded-lg px-3"
                      value={addForm.onHand}
                      onChange={(e) => setAddForm((f) => ({ ...f, onHand: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Par level</label>
                    <input
                      type="number"
                      min={0}
                      className="w-full h-9 text-sm border rounded-lg px-3"
                      value={addForm.parLevel}
                      onChange={(e) => setAddForm((f) => ({ ...f, parLevel: e.target.value }))}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Unit</label>
                    <input
                      className="w-full h-9 text-sm border rounded-lg px-3"
                      placeholder="e.g. bottle"
                      value={addForm.unit}
                      onChange={(e) => setAddForm((f) => ({ ...f, unit: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground block mb-1">Unit cost (£)</label>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      className="w-full h-9 text-sm border rounded-lg px-3"
                      value={addForm.unitCost}
                      onChange={(e) => setAddForm((f) => ({ ...f, unitCost: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-[11px] text-muted-foreground block mb-1">Nightly usage</label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    className="w-full h-9 text-sm border rounded-lg px-3"
                    value={addForm.velocity}
                    onChange={(e) => setAddForm((f) => ({ ...f, velocity: e.target.value }))}
                  />
                </div>
              </div>
              <div className="h-12 border-t border-border px-4 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="flex-1 h-8 border rounded-lg text-xs"
                  disabled={addBusy}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateInventoryItem()}
                  disabled={addBusy}
                  className="flex-1 h-8 bg-primary text-white rounded-lg text-xs font-semibold disabled:opacity-50"
                >
                  {addBusy ? 'Adding…' : 'Add item'}
                </button>
              </div>
            </div>
          </div>
        )}
      </>
    </AppLayout>
  );
}
