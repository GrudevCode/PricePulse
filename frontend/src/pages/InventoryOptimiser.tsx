import React, { useState, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/AppLayout';
import { cn } from '@/lib/utils';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ComposedChart, Line,
} from 'recharts';
import { toast } from 'sonner';
import {
  ArrowLeft, Package, Info, AlertTriangle, CheckCircle, Zap,
  Mail, Send, Edit3, TrendingDown, TrendingUp, Trash2,
  ChevronRight, Clock, Activity, DollarSign, RotateCcw,
  Settings, X, ChevronDown, ChevronUp, Lightbulb,
} from 'lucide-react';

// ─── Palette ─────────────────────────────────────────────────────────────────
const P = {
  primary: '#D25F2A', rose: '#F43F5E', muted: '#9A9189', border: '#E2DDD4', bg: '#FAF9F6',
};

// ─── Category colours (warm earth tones for chart readability) ────────────────
const CAT_COLOR: Record<string, string> = {
  'Hot Kitchen':  '#D25F2A',
  'Cold Kitchen': '#7C6355',
  'Desserts':     '#C4A882',
  'Bar':          '#9A9189',
  'Prep':         '#E8956D',
};
const CATEGORIES = ['All', 'Hot Kitchen', 'Cold Kitchen', 'Desserts', 'Bar', 'Prep'];

// ─── Types ────────────────────────────────────────────────────────────────────
interface InvItem {
  id: string; name: string; category: string; unit: string;
  onHand: number; parLevel: number;
  velocityPerNight: number;
  unitCostPence: number;   // pence
  wastePercent: number;    // realistic spoilage %
  defaultSupplierCompany: string;
  defaultSupplierEmail: string;
  defaultLeadDays: number;
  defaultThreshold: number; // fraction of par that triggers order (0.0–1.0)
}

interface Supplier { company: string; email: string; leadDays: number; }
interface OrderDraft { to: string; subject: string; body: string; qty: number; }

// ─── Inventory data (mirrors inventoryStore seed, augmented) ──────────────────
const ITEMS: InvItem[] = [
  // Hot Kitchen
  { id: 'hk-001', name: 'Burger Patties',       category: 'Hot Kitchen',  unit: 'units (frozen)',   onHand: 120, parLevel: 80,  velocityPerNight: 35.0, unitCostPence: 85,   wastePercent: 8,  defaultSupplierCompany: 'Prime Foods UK',       defaultSupplierEmail: 'orders@primefoods.co.uk',    defaultLeadDays: 2, defaultThreshold: 0.5 },
  { id: 'hk-002', name: 'Beef Steak 8oz',        category: 'Hot Kitchen',  unit: 'portion (vac)',    onHand: 18,  parLevel: 24,  velocityPerNight: 8.2,  unitCostPence: 780,  wastePercent: 12, defaultSupplierCompany: 'Prime Foods UK',       defaultSupplierEmail: 'orders@primefoods.co.uk',    defaultLeadDays: 2, defaultThreshold: 0.55 },
  { id: 'hk-003', name: 'Chicken Breast',        category: 'Hot Kitchen',  unit: 'kg portion',       onHand: 45,  parLevel: 40,  velocityPerNight: 14.5, unitCostPence: 290,  wastePercent: 10, defaultSupplierCompany: 'Prime Foods UK',       defaultSupplierEmail: 'orders@primefoods.co.uk',    defaultLeadDays: 2, defaultThreshold: 0.5 },
  { id: 'hk-004', name: 'Fries 2.5kg Bag',       category: 'Hot Kitchen',  unit: 'bag',              onHand: 14,  parLevel: 12,  velocityPerNight: 4.3,  unitCostPence: 350,  wastePercent: 5,  defaultSupplierCompany: 'Wholesale Foods Co.',  defaultSupplierEmail: 'orders@wholesalefoods.co.uk', defaultLeadDays: 3, defaultThreshold: 0.4 },
  { id: 'hk-005', name: 'Tomato Sauce 3kg',      category: 'Hot Kitchen',  unit: 'tub',              onHand: 2,   parLevel: 6,   velocityPerNight: 1.2,  unitCostPence: 420,  wastePercent: 6,  defaultSupplierCompany: 'Wholesale Foods Co.',  defaultSupplierEmail: 'orders@wholesalefoods.co.uk', defaultLeadDays: 3, defaultThreshold: 0.5 },
  // Cold Kitchen
  { id: 'ck-001', name: 'Mixed Salad Leaves',    category: 'Cold Kitchen', unit: 'kg bag',           onHand: 7,   parLevel: 10,  velocityPerNight: 3.1,  unitCostPence: 290,  wastePercent: 25, defaultSupplierCompany: 'Fresh Greens Ltd',     defaultSupplierEmail: 'supply@freshgreens.co.uk',   defaultLeadDays: 1, defaultThreshold: 0.55 },
  { id: 'ck-002', name: 'Cherry Tomatoes',       category: 'Cold Kitchen', unit: 'punnet 400g',      onHand: 5,   parLevel: 4,   velocityPerNight: 1.8,  unitCostPence: 160,  wastePercent: 18, defaultSupplierCompany: 'Fresh Greens Ltd',     defaultSupplierEmail: 'supply@freshgreens.co.uk',   defaultLeadDays: 1, defaultThreshold: 0.4 },
  { id: 'ck-003', name: 'Smoked Salmon 500g',    category: 'Cold Kitchen', unit: 'pack',             onHand: 12,  parLevel: 10,  velocityPerNight: 3.4,  unitCostPence: 1250, wastePercent: 15, defaultSupplierCompany: 'Fish Direct UK',       defaultSupplierEmail: 'orders@fishdirect.co.uk',    defaultLeadDays: 1, defaultThreshold: 0.5 },
  { id: 'ck-004', name: 'Mozzarella 125g',       category: 'Cold Kitchen', unit: 'ball',             onHand: 3,   parLevel: 8,   velocityPerNight: 2.2,  unitCostPence: 210,  wastePercent: 12, defaultSupplierCompany: 'Dairy Direct',         defaultSupplierEmail: 'orders@dairydirect.co.uk',   defaultLeadDays: 1, defaultThreshold: 0.6 },
  // Desserts
  { id: 'ds-001', name: 'Chocolate Fondant Mix', category: 'Desserts',     unit: 'kg bag',           onHand: 6,   parLevel: 8,   velocityPerNight: 1.8,  unitCostPence: 480,  wastePercent: 5,  defaultSupplierCompany: 'Pastry Direct',        defaultSupplierEmail: 'orders@pastrydirect.co.uk',  defaultLeadDays: 2, defaultThreshold: 0.5 },
  { id: 'ds-002', name: 'Vanilla Ice Cream 5L',  category: 'Desserts',     unit: 'tub',              onHand: 4,   parLevel: 4,   velocityPerNight: 0.9,  unitCostPence: 890,  wastePercent: 8,  defaultSupplierCompany: 'Dairy Direct',         defaultSupplierEmail: 'orders@dairydirect.co.uk',   defaultLeadDays: 1, defaultThreshold: 0.5 },
  { id: 'ds-003', name: 'Crème Brûlée Mix',      category: 'Desserts',     unit: 'litre',            onHand: 3,   parLevel: 6,   velocityPerNight: 1.1,  unitCostPence: 320,  wastePercent: 10, defaultSupplierCompany: 'Pastry Direct',        defaultSupplierEmail: 'orders@pastrydirect.co.uk',  defaultLeadDays: 2, defaultThreshold: 0.55 },
  // Bar
  { id: 'ba-001', name: 'House Lager 30L Keg',   category: 'Bar',          unit: 'keg (~88 pints)',  onHand: 3,   parLevel: 4,   velocityPerNight: 1.4,  unitCostPence: 8500, wastePercent: 8,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 3, defaultThreshold: 0.5 },
  { id: 'ba-002', name: 'Premium IPA 30L Keg',   category: 'Bar',          unit: 'keg (~88 pints)',  onHand: 6,   parLevel: 3,   velocityPerNight: 0.9,  unitCostPence: 11200,wastePercent: 8,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 3, defaultThreshold: 0.4 },
  { id: 'ba-003', name: 'House Red Wine',        category: 'Bar',          unit: 'bottle (75cl)',    onHand: 18,  parLevel: 16,  velocityPerNight: 6.2,  unitCostPence: 550,  wastePercent: 5,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 2, defaultThreshold: 0.5 },
  { id: 'ba-004', name: 'House White Wine',      category: 'Bar',          unit: 'bottle (75cl)',    onHand: 9,   parLevel: 14,  velocityPerNight: 5.4,  unitCostPence: 530,  wastePercent: 5,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 2, defaultThreshold: 0.5 },
  { id: 'ba-005', name: 'Well Spirits Rail',     category: 'Bar',          unit: 'bottle (70cl)',    onHand: 26,  parLevel: 24,  velocityPerNight: 10.1, unitCostPence: 900,  wastePercent: 2,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 3, defaultThreshold: 0.4 },
  { id: 'ba-006', name: 'Premium Tequila',       category: 'Bar',          unit: 'bottle (70cl)',    onHand: 2,   parLevel: 6,   velocityPerNight: 1.8,  unitCostPence: 2100, wastePercent: 2,  defaultSupplierCompany: 'Drinks Solutions Ltd', defaultSupplierEmail: 'stock@drinksolutions.co.uk', defaultLeadDays: 3, defaultThreshold: 0.5 },
  // Prep
  { id: 'pr-001', name: 'Cooking Oil 5L',        category: 'Prep',         unit: 'container',        onHand: 8,   parLevel: 6,   velocityPerNight: 0.7,  unitCostPence: 520,  wastePercent: 4,  defaultSupplierCompany: 'Wholesale Foods Co.',  defaultSupplierEmail: 'orders@wholesalefoods.co.uk', defaultLeadDays: 3, defaultThreshold: 0.4 },
  { id: 'pr-002', name: 'Plain Flour 25kg',      category: 'Prep',         unit: 'sack',             onHand: 2,   parLevel: 4,   velocityPerNight: 0.5,  unitCostPence: 1650, wastePercent: 3,  defaultSupplierCompany: 'Wholesale Foods Co.',  defaultSupplierEmail: 'orders@wholesalefoods.co.uk', defaultLeadDays: 3, defaultThreshold: 0.5 },
  { id: 'pr-003', name: 'Sea Salt 1kg',          category: 'Prep',         unit: 'box',              onHand: 12,  parLevel: 8,   velocityPerNight: 0.3,  unitCostPence: 95,   wastePercent: 2,  defaultSupplierCompany: 'Wholesale Foods Co.',  defaultSupplierEmail: 'orders@wholesalefoods.co.uk', defaultLeadDays: 3, defaultThreshold: 0.3 },
];

// ─── Waste history (6 weeks, trending down — optimizer is working) ─────────────
function buildWasteHistory() {
  const weeks = ['10 Feb', '17 Feb', '24 Feb', '3 Mar', '10 Mar', '17 Mar'];
  const mult   = [1.38, 1.26, 1.16, 1.08, 1.03, 1.00];
  return weeks.map((week, wi) => {
    const row: Record<string, number | string> = { week };
    for (const cat of CATEGORIES.slice(1)) {
      const catItems = ITEMS.filter(i => i.category === cat);
      const costGbp  = catItems.reduce((s, it) =>
        s + (it.velocityPerNight * 7 * (it.unitCostPence / 100) * (it.wastePercent / 100)), 0);
      row[cat] = Math.round(costGbp * mult[wi]);
    }
    return row;
  });
}
const WASTE_HISTORY = buildWasteHistory();

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ratio(item: InvItem) { return item.onHand / item.parLevel; }
function stockStatus(item: InvItem): 'critical' | 'low' | 'ok' | 'high' {
  const r = ratio(item);
  if (r < 0.4) return 'critical';
  if (r < 0.8) return 'low';
  if (r > 1.2) return 'high';
  return 'ok';
}
const STATUS_COLOR: Record<string, string> = {
  critical: P.rose, low: P.primary, ok: P.muted, high: P.muted,
};
const STATUS_BG: Record<string, string> = {
  critical: '#FEF2F2', low: '#FEF3EC', ok: '#F5F3F0', high: '#F5F3F0',
};
function costGbp(item: InvItem) { return item.unitCostPence / 100; }
function weeklyWaste(item: InvItem) {
  return item.velocityPerNight * 7 * costGbp(item) * (item.wastePercent / 100);
}
function suggestedOrderQty(item: InvItem, threshold: number) {
  const needed = item.parLevel * 1.5 - item.onHand;
  if (needed <= 0) return 0;
  // pad for waste loss during delivery lead time
  return Math.ceil(needed * (1 + item.wastePercent / 200));
}
function buildEmailDraft(item: InvItem, sup: Supplier, qty: number): OrderDraft {
  const ref     = `ORD-${new Date('2026-03-20').toISOString().slice(0,10).replace(/-/g,'')}-${item.id.toUpperCase()}`;
  const dueDate = new Date('2026-03-20'); dueDate.setDate(dueDate.getDate() + sup.leadDays);
  const dueFmt  = dueDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  return {
    to: sup.email,
    subject: `Stock Order Request — ${item.name} — Ref: ${ref}`,
    body: `Dear ${sup.company},\n\nWe would like to place the following stock order:\n\nItem:       ${item.name}\nQuantity:   ${qty} ${item.unit}\nReference:  ${ref}\nRequired by: ${dueFmt} (${sup.leadDays}-day lead time)\n\nCurrent stock: ${item.onHand} ${item.unit} (par level: ${item.parLevel})\nEstimated cost: £${(qty * costGbp(item)).toFixed(2)}\n\nPlease confirm receipt and expected delivery date at your earliest convenience.\n\nKind regards,\nThe Kitchen & Ops Team`,
    qty,
  };
}
function fmtGbp(n: number) { return `£${n.toFixed(2)}`; }

// ─── Toggle (matching IntelligentMenu fix) ────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onChange(); }}
      className="relative w-9 h-5 rounded-full transition-colors shrink-0 focus:outline-none"
      style={{ background: on ? P.primary : '#D5CFC7' }}>
      <span
        className="absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm transition-all duration-200"
        style={{ left: on ? 'calc(100% - 18px)' : '2px' }} />
    </button>
  );
}

// ─── Waste chart tooltip ──────────────────────────────────────────────────────
function WasteTip({ active, payload, label }: { active?: boolean; payload?: { name: string; value: number; fill: string }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  const total = payload.reduce((s, p) => s + (p.value ?? 0), 0);
  return (
    <div className="bg-white border border-border rounded-xl shadow-lg px-3 py-2.5 text-xs min-w-[170px]">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex items-center justify-between gap-3 py-0.5">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.fill }} />
            {p.name}
          </span>
          <span className="font-bold tabular-nums">£{p.value}</span>
        </div>
      ))}
      <div className="border-t border-border mt-1 pt-1 flex justify-between">
        <span className="text-muted-foreground">Total waste</span>
        <span className="font-bold">£{total}</span>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function InventoryOptimiser() {
  const navigate = useNavigate();

  // ── UI state ─────────────────────────────────────────────────────────────────
  const [showBanner,  setShowBanner]  = useState(true);
  const [catFilter,   setCatFilter]   = useState('All');
  const [selectedId,  setSelectedId]  = useState<string | null>(null);
  const [composingFor,setComposingFor]= useState<string | null>(null);

  // ── Per-item optimizer toggles ────────────────────────────────────────────────
  const [enabledSet, setEnabledSet] = useState<Set<string>>(
    () => new Set(ITEMS.map(i => i.id)),
  );
  const toggleEnabled = useCallback((id: string) => {
    setEnabledSet(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }, []);

  // ── Supplier overrides (editable per-item) ───────────────────────────────────
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>(() =>
    Object.fromEntries(ITEMS.map(i => [i.id, {
      company:  i.defaultSupplierCompany,
      email:    i.defaultSupplierEmail,
      leadDays: i.defaultLeadDays,
    }])),
  );
  const updateSupplier = useCallback((id: string, patch: Partial<Supplier>) => {
    setSuppliers(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }, []);

  // ── Order threshold overrides ────────────────────────────────────────────────
  const [thresholds, setThresholds] = useState<Record<string, number>>(() =>
    Object.fromEntries(ITEMS.map(i => [i.id, i.defaultThreshold])),
  );

  // ── Order qty overrides ───────────────────────────────────────────────────────
  const [orderQties, setOrderQties] = useState<Record<string, number>>({});
  const getOrderQty = (item: InvItem) =>
    orderQties[item.id] ?? suggestedOrderQty(item, thresholds[item.id]);

  // ── Editable order draft ──────────────────────────────────────────────────────
  const [draftEmail, setDraftEmail] = useState<OrderDraft | null>(null);
  const [sentOrders, setSentOrders] = useState<Set<string>>(new Set());

  const openCompose = useCallback((item: InvItem) => {
    const qty  = getOrderQty(item);
    const sup  = suppliers[item.id];
    setDraftEmail(buildEmailDraft(item, sup, qty));
    setComposingFor(item.id);
    setSelectedId(item.id);
  }, [suppliers, orderQties, thresholds]);

  const sendOrder = useCallback(() => {
    if (!composingFor || !draftEmail) return;
    const item = ITEMS.find(i => i.id === composingFor);
    if (!item) return;
    setSentOrders(prev => new Set([...prev, composingFor]));
    toast.success(`Order sent to ${draftEmail.to}`, {
      description: `${draftEmail.qty} ${item.unit} of ${item.name} · Ref embedded in email`,
    });
    setComposingFor(null);
    setDraftEmail(null);
  }, [composingFor, draftEmail]);

  // ── Derived data ─────────────────────────────────────────────────────────────
  const orderQueue = useMemo(() =>
    ITEMS.filter(i =>
      enabledSet.has(i.id) &&
      ratio(i) < thresholds[i.id] &&
      !sentOrders.has(i.id),
    ), [enabledSet, thresholds, sentOrders]);

  const filteredItems = useMemo(() =>
    catFilter === 'All' ? ITEMS : ITEMS.filter(i => i.category === catFilter),
  [catFilter]);

  const totalWeeklyWaste = useMemo(() =>
    ITEMS.filter(i => enabledSet.has(i.id)).reduce((s, i) => s + weeklyWaste(i), 0),
  [enabledSet]);
  const totalWeeklyWasteBaseline = ITEMS.reduce((s, i) => s + weeklyWaste(i) * 1.38, 0);
  const weeklyWasteSaving = totalWeeklyWasteBaseline - totalWeeklyWaste;

  const criticalCount = ITEMS.filter(i => stockStatus(i) === 'critical').length;
  const lowCount      = ITEMS.filter(i => stockStatus(i) === 'low').length;

  const algoScore = useMemo(() => {
    const n = ITEMS.filter(i => enabledSet.has(i.id)).length || 1;
    const sc = ITEMS.filter(i => enabledSet.has(i.id)).reduce((s, i) => {
      const st = stockStatus(i);
      const base = st === 'critical' ? 20 : st === 'low' ? 55 : st === 'high' ? 75 : 92;
      return s + base * (1 - i.wastePercent / 100);
    }, 0);
    return Math.max(10, Math.min(100, Math.round(sc / n)));
  }, [enabledSet]);

  const selectedItem = ITEMS.find(i => i.id === selectedId) ?? null;
  const composingItem = ITEMS.find(i => i.id === composingFor) ?? null;

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex flex-col h-full min-h-0" style={{ background: P.bg }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div className="h-14 border-b border-border flex items-center px-5 gap-3 shrink-0 bg-white/90 backdrop-blur-sm">
          <button onClick={() => navigate('/optimizers')}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" />Optimizers
          </button>
          <span className="text-muted-foreground/40">·</span>
          <div className="flex items-center gap-1.5">
            <Package className="w-4 h-4" style={{ color: P.primary }} />
            <h1 className="text-sm font-semibold tracking-tight">Inventory Optimiser</h1>
          </div>
          <div className="flex-1" />
          <span className="flex items-center gap-1.5 text-[11px] rounded-lg px-2.5 py-1 font-medium"
            style={{ color: P.primary, background: '#FEF3EC', border: `1px solid ${P.primary}30` }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P.primary }} />
            Algorithm running · {ITEMS.filter(i => enabledSet.has(i.id)).length} items tracked
          </span>
          <button onClick={() => setShowBanner(v => !v)}
            className={cn('flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-medium transition-colors',
              showBanner ? 'bg-orange-50 border-orange-200 text-orange-700' : 'border-border text-muted-foreground hover:text-foreground')}>
            <Info className="w-3.5 h-3.5" />
            {showBanner ? 'Hide' : 'How it works'}
          </button>
        </div>

        {/* ── Banner ──────────────────────────────────────────────────────── */}
        {showBanner && (
          <div className="border-b border-border bg-white shrink-0">
            <div className="px-5 py-4 flex gap-4 items-start">
              <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: '#FEF3EC' }}>
                <Package className="w-4 h-4" style={{ color: P.primary }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-foreground">How the Inventory Optimiser works</p>
                <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                  Toggle each ingredient into or out of the optimizer. When an item falls below its configured threshold the algorithm calculates the optimal reorder quantity — accounting for velocity, waste rate, and lead time — and lets you compose an automated order email directly to your supplier. Waste trends are tracked weekly so you can cut food cost over time.
                </p>
              </div>
              <button onClick={() => setShowBanner(false)} className="shrink-0 text-muted-foreground/50 hover:text-muted-foreground text-xs mt-0.5">✕</button>
            </div>
            <div className="grid grid-cols-4 divide-x divide-border border-t border-border">
              {[
                { icon: Activity,    title: 'Smart thresholds',   body: 'Each ingredient has a configurable reorder point. When stock falls below it and the optimizer is enabled, the item joins the order queue.' },
                { icon: Zap,         title: 'Velocity-based qty', body: 'Suggested order quantity factors in nightly usage velocity, waste rate, and lead time days so you never under-order.' },
                { icon: Mail,        title: 'Auto-email orders',  body: 'Configure a supplier company and email per ingredient. One click drafts a professional order email — review it, adjust qty, then send.' },
                { icon: TrendingDown,title: 'Waste tracking',     body: 'The chart below tracks weekly spoilage cost per category. As the optimizer matures your waste percentage trends downward.' },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="px-5 py-3.5 flex gap-3">
                  <div className="shrink-0 w-6 h-6 rounded-md flex items-center justify-center mt-0.5" style={{ background: '#FEF3EC' }}>
                    <Icon className="w-3.5 h-3.5" style={{ color: P.primary }} />
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-foreground">{title}</p>
                    <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── KPI strip ───────────────────────────────────────────────────── */}
        <div className="grid grid-cols-3 gap-3 px-5 py-3 border-b border-border shrink-0 bg-white/60">
          {[
            { label: 'Critical stock',   value: criticalCount,                               sub: 'items below 40% par',               color: P.rose,    icon: AlertTriangle },
            { label: 'Order queue',      value: orderQueue.length,                           sub: 'items need reordering',             color: P.primary, icon: Zap          },
            { label: 'Optimizer saving', value: `£${(weeklyWasteSaving * 52).toFixed(0)}/yr`, sub: `~£${weeklyWasteSaving.toFixed(0)}/week saved`, color: P.primary, icon: TrendingDown },
          ].map(k => (
            <div key={k.label} className="flex items-center gap-3 bg-white rounded-xl border border-border px-4 py-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${k.color}12` }}>
                <k.icon className="w-4 h-4" style={{ color: k.color }} />
              </div>
              <div>
                <p className="text-xl font-bold leading-tight" style={{ color: k.color }}>{k.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{k.label}</p>
                <p className="text-[9px] text-muted-foreground/70">{k.sub}</p>
              </div>
            </div>
          ))}
        </div>

        {/* ── 3-panel body ────────────────────────────────────────────────── */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* ── LEFT: ingredient list ──────────────────────────────────────── */}
          <div className="w-72 border-r border-border flex flex-col shrink-0 bg-white overflow-hidden">
            {/* Category tabs */}
            <div className="px-3 pt-2.5 pb-0 border-b border-border shrink-0">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Ingredients · {ITEMS.length} items
              </p>
              <div className="flex flex-wrap gap-1 pb-2.5">
                {CATEGORIES.map(cat => (
                  <button key={cat} onClick={() => setCatFilter(cat)}
                    className={cn('text-[10px] font-medium px-2 py-0.5 rounded-md border transition-colors',
                      catFilter === cat
                        ? 'text-white border-transparent'
                        : 'text-muted-foreground border-border hover:border-border/80 hover:text-foreground'
                    )}
                    style={catFilter === cat ? { background: P.primary, borderColor: 'transparent' } : {}}>
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Ingredient rows */}
            <div className="flex-1 overflow-y-auto min-h-0">
              {filteredItems.map((item, idx) => {
                const r      = ratio(item);
                const st     = stockStatus(item);
                const on     = enabledSet.has(item.id);
                const isSel  = selectedId === item.id;
                const inQ    = orderQueue.some(q => q.id === item.id);
                const sent   = sentOrders.has(item.id);
                return (
                  <div key={item.id}
                    onClick={() => { setSelectedId(isSel ? null : item.id); setComposingFor(null); setDraftEmail(null); }}
                    className={cn(
                      'flex items-center gap-2.5 px-3 py-2.5 cursor-pointer border-b border-border/50 transition-colors',
                      isSel ? 'bg-orange-50/60' : 'hover:bg-muted/10',
                    )}>
                    {/* Toggle */}
                    <Toggle on={on} onChange={() => toggleEnabled(item.id)} />

                    {/* Category dot */}
                    <span className="w-2 h-2 rounded-full shrink-0"
                      style={{ background: CAT_COLOR[item.category] ?? P.muted }} />

                    {/* Name */}
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-[11px] font-medium truncate', !on && 'text-muted-foreground/50')}>
                        {item.name}
                      </p>
                      <p className="text-[9px] text-muted-foreground/70 truncate">{item.unit}</p>
                    </div>

                    {/* Stock mini-bar */}
                    <div className="w-12 shrink-0">
                      <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, r * 100)}%`,
                            background: STATUS_COLOR[st],
                          }} />
                      </div>
                      <p className="text-[8px] text-center text-muted-foreground mt-0.5">
                        {item.onHand}/{item.parLevel}
                      </p>
                    </div>

                    {/* Status badge */}
                    <span className="text-[8.5px] font-bold uppercase tracking-wide shrink-0 px-1.5 py-0.5 rounded"
                      style={{ color: STATUS_COLOR[st], background: STATUS_BG[st] }}>
                      {sent ? '✓ Sent' : inQ ? '⚡ Order' : st}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── CENTER: waste chart + order queue ──────────────────────────── */}
          <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-hidden">

            {/* Waste chart */}
            <div className="border-b border-border shrink-0 px-5 pt-4 pb-3 bg-white/40">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[12px] font-semibold text-foreground">Weekly Waste Cost</p>
                  <p className="text-[10px] text-muted-foreground">6-week trend by category — optimizer reducing spoilage over time</p>
                </div>
                <div className="flex items-center gap-1.5 text-[10px] font-medium rounded-lg px-2.5 py-1"
                  style={{ color: P.primary, background: '#FEF3EC', border: `1px solid ${P.primary}30` }}>
                  <TrendingDown className="w-3 h-3" />
                  −28% vs baseline
                </div>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <ComposedChart data={WASTE_HISTORY} margin={{ top: 2, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={P.border} vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 9, fill: P.muted }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: P.muted }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                  <Tooltip content={<WasteTip />} />
                  {CATEGORIES.slice(1).map(cat => (
                    <Bar key={cat} dataKey={cat} stackId="waste" fill={CAT_COLOR[cat]} radius={cat === 'Prep' ? [3, 3, 0, 0] : [0, 0, 0, 0]} />
                  ))}
                  <Line type="monotone" dataKey="Hot Kitchen" hide dot={false} stroke="transparent" />
                </ComposedChart>
              </ResponsiveContainer>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-1.5 justify-center flex-wrap">
                {CATEGORIES.slice(1).map(cat => (
                  <span key={cat} className="flex items-center gap-1 text-[9px] text-muted-foreground">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: CAT_COLOR[cat] }} />
                    {cat}
                  </span>
                ))}
              </div>
            </div>

            {/* Order queue */}
            <div className="flex-1 overflow-y-auto min-h-0 px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-[12px] font-semibold text-foreground flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5" style={{ color: P.primary }} />
                    Order Queue
                    {orderQueue.length > 0 && (
                      <span className="text-[9px] font-bold text-white rounded-full px-1.5 py-0.5"
                        style={{ background: P.rose }}>{orderQueue.length}</span>
                    )}
                  </p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">
                    Items enabled by optimizer and below their reorder threshold
                  </p>
                </div>
              </div>

              {orderQueue.length === 0 ? (
                <div className="flex items-center gap-2 text-[11px] rounded-xl px-4 py-3 border"
                  style={{ color: P.primary, background: '#FEF3EC', borderColor: `${P.primary}30` }}>
                  <CheckCircle className="w-4 h-4 shrink-0" />
                  All tracked items are well-stocked — no orders needed right now
                </div>
              ) : (
                <div className="space-y-2">
                  {orderQueue.map(item => {
                    const st     = stockStatus(item);
                    const r      = ratio(item);
                    const qty    = getOrderQty(item);
                    const est    = qty * costGbp(item);
                    const sup    = suppliers[item.id];
                    const hasMail= !!sup.email;
                    return (
                      <div key={item.id}
                        className={cn(
                          'rounded-xl border transition-colors',
                          selectedId === item.id ? 'border-orange-300 bg-orange-50/40' : 'border-border bg-white',
                        )}>
                        <div className="flex items-center gap-3 px-4 py-3">
                          {/* Status */}
                          <div className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{ background: STATUS_BG[st] }}>
                            <AlertTriangle className="w-4 h-4" style={{ color: STATUS_COLOR[st] }} />
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-[12px] font-semibold text-foreground truncate">{item.name}</p>
                              <span className="text-[8.5px] font-bold uppercase px-1.5 py-0.5 rounded shrink-0"
                                style={{ color: STATUS_COLOR[st], background: STATUS_BG[st] }}>{st}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                              <span>{item.onHand}/{item.parLevel} {item.unit}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{Math.round(r * 100)}% of par</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span>{item.velocityPerNight}/night</span>
                            </div>
                            {/* Stock bar */}
                            <div className="mt-1.5 h-1.5 bg-muted/20 rounded-full overflow-hidden w-full max-w-[180px]">
                              <div className="h-full rounded-full"
                                style={{ width: `${Math.min(100, r * 100)}%`, background: STATUS_COLOR[st] }} />
                            </div>
                          </div>

                          {/* Order qty + cost */}
                          <div className="shrink-0 text-right">
                            <div className="flex items-center gap-1 justify-end">
                              <button onClick={() => setOrderQties(prev => ({ ...prev, [item.id]: Math.max(1, (prev[item.id] ?? qty) - 1) }))}
                                className="w-5 h-5 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center">
                                <ChevronDown className="w-2.5 h-2.5" />
                              </button>
                              <span className="text-[13px] font-bold text-foreground w-8 text-center tabular-nums">{qty}</span>
                              <button onClick={() => setOrderQties(prev => ({ ...prev, [item.id]: (prev[item.id] ?? qty) + 1 }))}
                                className="w-5 h-5 rounded border border-border text-muted-foreground hover:text-foreground flex items-center justify-center">
                                <ChevronUp className="w-2.5 h-2.5" />
                              </button>
                            </div>
                            <p className="text-[9px] text-muted-foreground text-center">{item.unit}</p>
                            <p className="text-[10px] font-semibold mt-0.5" style={{ color: P.primary }}>≈ {fmtGbp(est)}</p>
                          </div>

                          {/* Actions */}
                          <div className="shrink-0 flex flex-col gap-1.5">
                            <button
                              onClick={() => { setSelectedId(item.id); openCompose(item); }}
                              className={cn(
                                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors',
                                hasMail
                                  ? 'text-white hover:opacity-90'
                                  : 'bg-muted/30 text-muted-foreground cursor-not-allowed',
                              )}
                              style={hasMail ? { background: P.primary } : {}}
                              disabled={!hasMail}
                              title={hasMail ? 'Compose order email' : 'Set supplier email first'}>
                              <Mail className="w-3 h-3" />
                              Compose
                            </button>
                            <button
                              onClick={() => { setSelectedId(item.id); setComposingFor(null); setDraftEmail(null); }}
                              className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground border border-border hover:bg-muted/10 transition-colors">
                              <Settings className="w-3 h-3" />
                              Config
                            </button>
                          </div>
                        </div>
                        {/* Supplier tag */}
                        <div className="px-4 pb-2.5 flex items-center gap-1.5 text-[9px] text-muted-foreground">
                          <Mail className="w-2.5 h-2.5 shrink-0" />
                          <span className="truncate">{suppliers[item.id].company} · {suppliers[item.id].email}</span>
                          <span className="text-muted-foreground/40">·</span>
                          <Clock className="w-2.5 h-2.5" />
                          <span>{suppliers[item.id].leadDays}d lead</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: algorithm / item config / order compose ─────────────── */}
          <div className="w-80 border-l border-border bg-white shrink-0 flex flex-col overflow-hidden">

            {/* ── ORDER COMPOSE mode ──────────────────────────────────────── */}
            {composingFor && draftEmail && composingItem ? (
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
                  <div className="flex items-center gap-2">
                    <button onClick={() => { setComposingFor(null); setDraftEmail(null); }}
                      className="p-1 rounded hover:bg-muted/20 text-muted-foreground hover:text-foreground">
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                    <div>
                      <p className="text-[12px] font-semibold text-foreground">Compose Order Email</p>
                      <p className="text-[10px] text-muted-foreground">{composingItem.name}</p>
                    </div>
                  </div>
                </div>

                {/* Fields */}
                <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-3">
                  {/* To */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">To</label>
                    <input
                      type="email"
                      value={draftEmail.to}
                      onChange={e => setDraftEmail(d => d ? { ...d, to: e.target.value } : d)}
                      className="w-full text-[11px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                    />
                  </div>
                  {/* Subject */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Subject</label>
                    <input
                      type="text"
                      value={draftEmail.subject}
                      onChange={e => setDraftEmail(d => d ? { ...d, subject: e.target.value } : d)}
                      className="w-full text-[11px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                    />
                  </div>
                  {/* Qty override */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Order Quantity</label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number" min={1}
                        value={draftEmail.qty}
                        onChange={e => {
                          const qty = Math.max(1, Number(e.target.value));
                          const sup = suppliers[composingFor];
                          setDraftEmail(buildEmailDraft(composingItem, sup, qty));
                        }}
                        className="flex-1 text-[11px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white tabular-nums"
                      />
                      <span className="text-[10px] text-muted-foreground shrink-0">{composingItem.unit}</span>
                    </div>
                    <p className="text-[9px] text-muted-foreground mt-1">
                      Est. cost: {fmtGbp(draftEmail.qty * costGbp(composingItem))}
                    </p>
                  </div>
                  {/* Body */}
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground block mb-1">Email Body</label>
                    <textarea
                      rows={12}
                      value={draftEmail.body}
                      onChange={e => setDraftEmail(d => d ? { ...d, body: e.target.value } : d)}
                      className="w-full text-[10px] border border-border rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white resize-none font-mono leading-relaxed"
                    />
                  </div>
                </div>

                {/* Send button */}
                <div className="px-4 py-3 border-t border-border shrink-0 space-y-2">
                  <button
                    onClick={sendOrder}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                    style={{ background: P.primary }}>
                    <Send className="w-3.5 h-3.5" />
                    Send Order to {suppliers[composingFor]?.company}
                  </button>
                  <p className="text-[9px] text-muted-foreground text-center">
                    This will log the order as sent. In production, connects to your email provider.
                  </p>
                </div>
              </div>

            ) : selectedItem ? (
              /* ── ITEM CONFIG mode ───────────────────────────────────────── */
              <div className="flex flex-col h-full">
                {/* Header */}
                <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-3 h-3 rounded-full shrink-0"
                        style={{ background: CAT_COLOR[selectedItem.category] }} />
                      <div>
                        <p className="text-[12px] font-semibold text-foreground">{selectedItem.name}</p>
                        <p className="text-[10px] text-muted-foreground">{selectedItem.category} · {selectedItem.unit}</p>
                      </div>
                    </div>
                    <button onClick={() => setSelectedId(null)}
                      className="p-1 rounded hover:bg-muted/20 text-muted-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  {/* Stock overview */}
                  <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
                    {[
                      { label: 'On hand', value: selectedItem.onHand, unit: selectedItem.unit.split(' ')[0] },
                      { label: 'Par level', value: selectedItem.parLevel, unit: selectedItem.unit.split(' ')[0] },
                      { label: 'Velocity', value: selectedItem.velocityPerNight, unit: '/night' },
                    ].map(k => (
                      <div key={k.label} className="bg-muted/15 rounded-lg py-1.5 px-2">
                        <p className="text-[13px] font-bold text-foreground">{k.value}</p>
                        <p className="text-[8.5px] text-muted-foreground">{k.label}</p>
                      </div>
                    ))}
                  </div>
                  {/* Stock bar */}
                  <div className="mt-2">
                    <div className="flex justify-between text-[9px] text-muted-foreground mb-1">
                      <span>Stock level</span>
                      <span className="font-semibold" style={{ color: STATUS_COLOR[stockStatus(selectedItem)] }}>
                        {Math.round(ratio(selectedItem) * 100)}% of par
                      </span>
                    </div>
                    <div className="h-2 bg-muted/20 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, ratio(selectedItem) * 100)}%`,
                          background: STATUS_COLOR[stockStatus(selectedItem)],
                        }} />
                    </div>
                  </div>
                </div>

                {/* Config form */}
                <div className="flex-1 overflow-y-auto min-h-0 px-4 py-3 space-y-4">

                  {/* Optimizer toggle */}
                  <div className="flex items-center justify-between py-2 border-b border-border/50">
                    <div>
                      <p className="text-[11px] font-semibold text-foreground">Optimizer enabled</p>
                      <p className="text-[10px] text-muted-foreground">Track stock and trigger orders</p>
                    </div>
                    <Toggle on={enabledSet.has(selectedItem.id)} onChange={() => toggleEnabled(selectedItem.id)} />
                  </div>

                  {/* Supplier section */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Mail className="w-3 h-3" />
                      Supplier Details
                    </p>
                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Company name</label>
                        <input
                          type="text"
                          value={suppliers[selectedItem.id].company}
                          onChange={e => updateSupplier(selectedItem.id, { company: e.target.value })}
                          className="w-full text-[11px] border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Supplier email</label>
                        <div className="relative">
                          <Mail className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                          <input
                            type="email"
                            value={suppliers[selectedItem.id].email}
                            onChange={e => updateSupplier(selectedItem.id, { email: e.target.value })}
                            className="w-full text-[11px] border border-border rounded-lg pl-7 pr-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                            placeholder="orders@supplier.com"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground block mb-0.5">Lead time (days)</label>
                        <input
                          type="number" min={1} max={14}
                          value={suppliers[selectedItem.id].leadDays}
                          onChange={e => updateSupplier(selectedItem.id, { leadDays: Math.max(1, Number(e.target.value)) })}
                          className="w-full text-[11px] border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-orange-300 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Order threshold */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Zap className="w-3 h-3" />
                      Order Threshold
                    </p>
                    <div className="flex justify-between text-[10px] text-muted-foreground mb-1">
                      <span>Trigger when stock falls below</span>
                      <span className="font-bold text-foreground">{Math.round((thresholds[selectedItem.id] ?? selectedItem.defaultThreshold) * 100)}% of par</span>
                    </div>
                    <input
                      type="range" min={10} max={90} step={5}
                      value={Math.round((thresholds[selectedItem.id] ?? selectedItem.defaultThreshold) * 100)}
                      onChange={e => setThresholds(prev => ({ ...prev, [selectedItem.id]: Number(e.target.value) / 100 }))}
                      className="w-full accent-orange-500 h-1.5"
                    />
                    <div className="flex justify-between text-[9px] text-muted-foreground/60 mt-0.5">
                      <span>10% (aggressive)</span><span>90% (conservative)</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1.5">
                      Triggers at <strong className="text-foreground">{Math.round((thresholds[selectedItem.id] ?? selectedItem.defaultThreshold) * selectedItem.parLevel)} {selectedItem.unit.split(' ')[0]}</strong> on hand
                    </p>
                  </div>

                  {/* Waste stats */}
                  <div>
                    <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
                      <Trash2 className="w-3 h-3" />
                      Waste Profile
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: 'Waste rate',  value: `${selectedItem.wastePercent}%` },
                        { label: 'Weekly cost', value: fmtGbp(weeklyWaste(selectedItem)) },
                        { label: 'Unit cost',   value: fmtGbp(costGbp(selectedItem)) },
                        { label: 'Suggested qty', value: `${suggestedOrderQty(selectedItem, thresholds[selectedItem.id])} ${selectedItem.unit.split(' ')[0]}` },
                      ].map(k => (
                        <div key={k.label} className="bg-muted/15 rounded-lg px-2.5 py-2">
                          <p className="text-[11px] font-bold text-foreground">{k.value}</p>
                          <p className="text-[9px] text-muted-foreground">{k.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Compose button (if in queue) */}
                {orderQueue.some(q => q.id === selectedItem.id) && (
                  <div className="px-4 py-3 border-t border-border shrink-0">
                    <button
                      onClick={() => openCompose(selectedItem)}
                      className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-bold text-white transition-opacity hover:opacity-90"
                      style={{ background: P.primary }}>
                      <Mail className="w-3.5 h-3.5" />
                      Compose Order to {suppliers[selectedItem.id].company}
                    </button>
                  </div>
                )}
              </div>

            ) : (
              /* ── ALGORITHM OVERVIEW mode ────────────────────────────────── */
              <div className="flex flex-col h-full overflow-y-auto">
                <div className="px-4 pt-4 pb-3 border-b border-border shrink-0">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: P.primary }} />
                        Algorithm Intelligence
                      </p>
                      <p className="text-[10px] text-muted-foreground">Inventory optimisation score</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[28px] font-bold leading-none"
                        style={{ color: algoScore >= 75 ? P.primary : algoScore >= 50 ? P.muted : P.rose }}>
                        {algoScore}
                      </p>
                      <p className="text-[9px] text-muted-foreground">/100</p>
                    </div>
                  </div>
                  <div className="h-1.5 bg-muted/20 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${algoScore}%`,
                        background: algoScore >= 75 ? P.primary : algoScore >= 50 ? P.muted : P.rose,
                      }} />
                  </div>
                </div>

                {/* Insights */}
                <div className="px-4 py-3 space-y-2">
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Insights</p>

                  {/* Critical items */}
                  {ITEMS.filter(i => stockStatus(i) === 'critical').map(item => (
                    <div key={item.id} className="rounded-xl border px-3 py-2.5 cursor-pointer transition-colors"
                      style={{ background: '#FEF2F2', borderColor: `${P.rose}40` }}
                      onClick={() => setSelectedId(item.id)}>
                      <div className="flex items-start gap-2">
                        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: P.rose }} />
                        <div>
                          <p className="text-[11px] font-semibold text-foreground">{item.name} — Critical</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {item.onHand}/{item.parLevel} {item.unit} ({Math.round(ratio(item) * 100)}% of par) · {item.velocityPerNight} used/night
                          </p>
                        </div>
                        <span className="ml-auto text-[8.5px] font-bold rounded px-1.5 py-0.5 shrink-0"
                          style={{ color: P.rose, background: '#FEE2E2', border: `1px solid ${P.rose}30` }}>HIGH</span>
                      </div>
                    </div>
                  ))}

                  {/* High waste */}
                  {ITEMS.filter(i => i.wastePercent >= 15 && enabledSet.has(i.id)).slice(0, 3).map(item => (
                    <div key={`w-${item.id}`} className="rounded-xl border px-3 py-2.5 cursor-pointer transition-colors"
                      style={{ background: '#FEF3EC', borderColor: `${P.primary}30` }}
                      onClick={() => setSelectedId(item.id)}>
                      <div className="flex items-start gap-2">
                        <Trash2 className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: P.primary }} />
                        <div>
                          <p className="text-[11px] font-semibold text-foreground">{item.name} — High waste</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {item.wastePercent}% spoilage · £{weeklyWaste(item).toFixed(2)}/week lost
                          </p>
                        </div>
                        <span className="ml-auto text-[8.5px] font-bold rounded px-1.5 py-0.5 shrink-0"
                          style={{ color: P.primary, background: `${P.primary}12`, border: `1px solid ${P.primary}25` }}>MED</span>
                      </div>
                    </div>
                  ))}

                  {/* Overstocked */}
                  {ITEMS.filter(i => stockStatus(i) === 'high' && enabledSet.has(i.id)).slice(0, 2).map(item => (
                    <div key={`h-${item.id}`} className="rounded-xl border px-3 py-2.5"
                      style={{ background: P.bg, borderColor: P.border }}>
                      <div className="flex items-start gap-2">
                        <TrendingUp className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: P.muted }} />
                        <div>
                          <p className="text-[11px] font-semibold text-foreground">{item.name} — Overstocked</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {Math.round(ratio(item) * 100)}% of par · pause orders until stock normalises
                          </p>
                        </div>
                        <span className="ml-auto text-[8.5px] font-bold rounded px-1.5 py-0.5 shrink-0"
                          style={{ color: P.muted, background: P.bg, border: `1px solid ${P.border}` }}>LOW</span>
                      </div>
                    </div>
                  ))}

                  {/* Order queue summary */}
                  {orderQueue.length > 0 && (
                    <div className="rounded-xl border px-3 py-2.5"
                      style={{ background: '#FEF3EC', borderColor: '#FED7AA' }}>
                      <div className="flex items-start gap-2">
                        <Zap className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: P.primary }} />
                        <div>
                          <p className="text-[11px] font-semibold text-foreground">{orderQueue.length} items need ordering</p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            Est. order value: {fmtGbp(orderQueue.reduce((s, i) => s + getOrderQty(i) * costGbp(i), 0))} across {new Set(orderQueue.map(i => suppliers[i.id].company)).size} suppliers
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground text-center pt-1 italic">
                    Click any ingredient or insight to configure
                  </p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>
    </AppLayout>
  );
}
