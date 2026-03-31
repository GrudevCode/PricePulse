import { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient, useQueries } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { toast } from 'sonner';
import { useVenueStore, type Venue } from '@/store/venueStore';
import { venueApi, menuApi, menusApi, categoriesApi, ingredientsApi, inventoryApi, recipeApi } from '@/lib/api';
import { inventoryLineCostPence } from '@/lib/recipeInventoryCost';
import {
  MenuPreviewContent,
  MenuPreviewPhoneShell,
  type MenuPreviewStyle,
} from '@/components/menu/MenuPreviewContent';
import { AppLayout } from '@/components/AppLayout';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn, formatPence } from '@/lib/utils';
import { Plus, ArrowLeft, Eye, Palette, Wrench, Pencil, Trash2, X, UtensilsCrossed, Flame, Package, QrCode } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { MenuDesignStudio, type MenuDesignConfig } from '@/components/dashboard/MenuDesignStudio';

function toastApiError(err: unknown, fallback: string) {
  if (axios.isAxiosError(err) && err.response?.data && typeof (err.response.data as { error?: string }).error === 'string') {
    toast.error((err.response.data as { error: string }).error);
    return;
  }
  toast.error(fallback);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuItem {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  description?: string | null;
  /** Public menu / card background when set */
  imageUrl?: string | null;
  /** Whether the image should be rendered in guest previews/public menu */
  displayImage?: boolean;
  basePrice: number;
  currentPrice: number;
  minPrice: number;
  maxPrice: number;
  isDynamicPricingEnabled: boolean;
  isAvailable?: boolean;
  /** Opt-in: hide from editor list, preview & public menu when linked inventory is out of stock */
  intelligentInventorySync?: boolean;
  ingredientStockStatus?: 'in_stock' | 'low_stock' | 'out_of_stock' | 'not_tracked';
  intelligentlyHidden?: boolean;
  lastUpdatedAt?: string;
}

interface MenuDef {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  designConfig?: MenuDesignConfig | null;
}

interface DbCategory {
  id: string;
  name: string;
  description: string | null;
  menuId: string;
  displayOrder: number;
}

// ─── Portal modal backdrop ────────────────────────────────────────────────────
// Renders into document.body (escapes overflow:hidden), centres panel in the
// content area (right of sidebar, below h-14 top toolbar).

const TOPBAR_H = 56; // h-14

function ModalBackdrop({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/10 backdrop-blur-sm"
      style={{
        paddingLeft: 'var(--sidebar-w, 0px)',
        paddingTop: `${TOPBAR_H}px`,
      }}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      {children}
    </div>,
    document.body,
  );
}

// ─── New Menu Modal ───────────────────────────────────────────────────────────

function NewMenuModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [note, setNote] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim(), note.trim());
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-md mx-4">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">New menu</h2>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Menu name</label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Monday to Saturday"
              className="h-9 text-sm"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Description
              <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
            </label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Regular trading menu — 6 days"
              className="h-9 text-sm"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Create menu
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ─── Menu Settings Modal ─────────────────────────────────────────────────────

function SettingsToggle({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between px-4 py-3 border border-border rounded-lg bg-secondary/20">
      <div>
        <p className="text-sm font-medium text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cn(
          'relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors',
          value ? 'bg-primary' : 'bg-border'
        )}
      >
        <span className={cn(
          'inline-block h-3.5 w-3.5 rounded-full bg-white shadow transition-transform',
          value ? 'translate-x-[18px]' : 'translate-x-[2px]'
        )} />
      </button>
    </div>
  );
}

function MenuSettingsModal({
  menu,
  venueId,
  onClose,
}: {
  menu: MenuDef;
  venueId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [isActive,       setIsActive]       = useState(menu.isActive ?? true);
  const [showPrices,     setShowPrices]     = useState(true);
  const [allowOnline,    setAllowOnline]    = useState(false);
  const [taxIncluded,    setTaxIncluded]    = useState(true);
  const [serviceCharge,  setServiceCharge]  = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      await menusApi.update(venueId, menu.id, { isActive });
      qc.invalidateQueries({ queryKey: ['menus', venueId] });
      toast.success('Settings saved');
      onClose();
    } catch {
      toast.error('Failed to save settings');
    }
    setSaving(false);
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-[480px]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Menu settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{menu.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-2.5">

          <SettingsToggle
            label="Visible in planner"
            description="Show this menu in the calendar and allow scheduling"
            value={isActive}
            onChange={setIsActive}
          />

          <SettingsToggle
            label="Show prices"
            description="Display item prices when this menu is published"
            value={showPrices}
            onChange={setShowPrices}
          />

          <SettingsToggle
            label="Available for online ordering"
            description="Allow customers to order directly from this menu online"
            value={allowOnline}
            onChange={setAllowOnline}
          />

          <SettingsToggle
            label="Tax included in prices"
            description="Prices shown already include applicable taxes"
            value={taxIncluded}
            onChange={setTaxIncluded}
          />

          <SettingsToggle
            label="Service charge"
            description="Automatically apply a service charge to orders from this menu"
            value={serviceCharge}
            onChange={setServiceCharge}
          />

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Category row (navigates to products view) ───────────────────────────────

// ─── Rename category modal ────────────────────────────────────────────────────

function RenameModal({
  title,
  label,
  current,
  currentNote,
  onClose,
  onRename,
}: {
  title: string;
  label: string;
  current: string;
  currentNote?: string;
  onClose: () => void;
  onRename: (name: string, note?: string) => void;
}) {
  const [value, setValue] = useState(current);
  const [note,  setNote]  = useState(currentNote ?? '');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!value.trim()) return onClose();
    onRename(value.trim(), currentNote !== undefined ? note.trim() : undefined);
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">{label}</label>
            <Input autoFocus value={value} onChange={(e) => setValue(e.target.value)} className="h-9 text-sm" />
          </div>
          {currentNote !== undefined && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Description
                <span className="ml-1 font-normal text-muted-foreground">(optional)</span>
              </label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Regular trading menu" className="h-9 text-sm" />
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors">
              Cancel
            </button>
            <button type="submit" disabled={!value.trim()} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
              Save
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ─── Delete confirm modal ─────────────────────────────────────────────────────

function DeleteConfirmModal({
  title,
  label,
  detail,
  onClose,
  onConfirm,
}: {
  title: string;
  label: string;
  /** Extra context (cascade behaviour, what stays in DB, etc.) */
  detail?: string;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <ModalBackdrop onClose={busy ? () => {} : onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-secondary disabled:opacity-40"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-6 py-5 space-y-5">
          <p className="text-sm text-muted-foreground leading-relaxed">
            Are you sure you want to delete <span className="font-semibold text-foreground">{label}</span>? This cannot be undone.
          </p>
          {detail ? (
            <p className="text-xs text-muted-foreground leading-relaxed border-l-2 border-amber-500/60 pl-3">
              {detail}
            </p>
          ) : null}
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await Promise.resolve(onConfirm());
                  onClose();
                } catch {
                  /* caller should toast */
                } finally {
                  setBusy(false);
                }
              }}
              className="px-4 py-2 text-sm font-medium bg-red-500 text-white rounded-md hover:bg-red-600 transition-colors disabled:opacity-50"
            >
              {busy ? 'Deleting…' : 'Delete'}
            </button>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Category Settings Modal ──────────────────────────────────────────────────

function CategorySettingsModal({
  category,
  onClose,
}: {
  category: string;
  onClose: () => void;
}) {
  const [visible,         setVisible]         = useState(true);
  const [featured,        setFeatured]        = useState(false);
  const [ageVerification, setAgeVerification] = useState(false);
  const [specialRequests, setSpecialRequests] = useState(true);
  const [showPhotos,      setShowPhotos]      = useState(false);
  const [kitchenPrinter,  setKitchenPrinter]  = useState(true);

  function handleSave() {
    toast.success('Category settings saved');
    onClose();
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-[480px]">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Category settings</h2>
            <p className="text-xs text-muted-foreground mt-0.5">{category}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-6 py-5 space-y-2.5">

          <SettingsToggle
            label="Visible on menu"
            description="Show this category when the menu is published or viewed"
            value={visible}
            onChange={setVisible}
          />

          <SettingsToggle
            label="Featured section"
            description="Highlight this category at the top of the menu as a featured section"
            value={featured}
            onChange={setFeatured}
          />

          <SettingsToggle
            label="Age verification required"
            description="Require age check before ordering from this category (e.g. wine, spirits)"
            value={ageVerification}
            onChange={setAgeVerification}
          />

          <SettingsToggle
            label="Allow special requests"
            description="Let guests add dietary notes or modifications to items in this category"
            value={specialRequests}
            onChange={setSpecialRequests}
          />

          <SettingsToggle
            label="Show item photos"
            description="Display photos alongside dishes in this category where available"
            value={showPhotos}
            onChange={setShowPhotos}
          />

          <SettingsToggle
            label="Route to kitchen printer"
            description="Send orders from this category to the kitchen display or printer"
            value={kitchenPrinter}
            onChange={setKitchenPrinter}
          />

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            Save settings
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Edit Master Product Modal ────────────────────────────────────────────────

function LangTabs({ lang, onChange }: { lang: 'en' | 'fr'; onChange: (l: 'en' | 'fr') => void }) {
  return (
    <div className="flex gap-1 mb-3">
      {(['en', 'fr'] as const).map((l) => (
        <button
          key={l}
          onClick={() => onChange(l)}
          className={cn(
            'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
            lang === l ? 'bg-foreground text-background' : 'bg-secondary text-muted-foreground hover:text-foreground'
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function FieldRow({
  label, hint, children,
}: {
  label: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      {children}
      {hint && <p className="text-xs text-muted-foreground/70">{hint}</p>}
    </div>
  );
}

function poundsInputToPence(input: string, fallbackPence: number): number {
  const t = input.trim();
  if (!t) return fallbackPence;
  const n = parseFloat(t);
  if (!Number.isFinite(n) || n <= 0) return fallbackPence;
  return Math.round(n * 100);
}

function isDataImage(value: string): boolean {
  return /^data:image\//i.test(value.trim());
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value.trim());
}

async function canLoadImageUrl(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const timer = window.setTimeout(() => resolve(false), 5000);
    img.onload = () => {
      window.clearTimeout(timer);
      resolve(true);
    };
    img.onerror = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    img.src = url;
  });
}

function EditMasterProductModal({
  item,
  venueId,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  venueId: string;
  onClose: () => void;
  onSaved?: (updated: MenuItem) => void;
}) {
  const qc = useQueryClient();
  const [lang,               setLang]               = useState<'en' | 'fr'>('en');
  const [name,               setName]               = useState(item.name);
  const [description,        setDescription]        = useState(item.description ?? '');
  const [popupDescription,   setPopupDescription]   = useState('');
  const [imageUrl,           setImageUrl]           = useState(item.imageUrl ?? '');
  const [displayImage,       setDisplayImage]       = useState(item.displayImage !== false);
  const [outOfStock,         setOutOfStock]         = useState(item.isAvailable === false);
  const [intelligentSync,    setIntelligentSync]    = useState(item.intelligentInventorySync === true);
  const [masterFormat,       setMasterFormat]       = useState('dish');
  const [showAdvanced,       setShowAdvanced]       = useState(false);

  // Advanced
  const [soldByWeight,       setSoldByWeight]       = useState(false);
  const [revenueManaged,     setRevenueManaged]     = useState(true);
  const [unitCost,           setUnitCost]           = useState(
    item.basePrice ? (item.basePrice / 100 * 0.3).toFixed(2) : ''
  );
  const [consumption,        setConsumption]        = useState('1');
  const [processingSpeed,    setProcessingSpeed]    = useState(3);
  const [minPrice,           setMinPrice]           = useState(
    item.minPrice ? (item.minPrice / 100).toFixed(2) : ''
  );
  const [referencePrice,     setReferencePrice]     = useState(
    item.currentPrice ? (item.currentPrice / 100).toFixed(2) : ''
  );
  const [maxPrice,           setMaxPrice]           = useState(
    item.maxPrice ? (item.maxPrice / 100).toFixed(2) : ''
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(item.name);
    setDescription(item.description ?? '');
    setImageUrl(item.imageUrl ?? '');
    setDisplayImage(item.displayImage !== false);
    setOutOfStock(item.isAvailable === false);
    setIntelligentSync(item.intelligentInventorySync === true);
    setUnitCost(item.basePrice ? (item.basePrice / 100 * 0.3).toFixed(2) : '');
    setMinPrice(item.minPrice ? (item.minPrice / 100).toFixed(2) : '');
    setReferencePrice(item.currentPrice ? (item.currentPrice / 100).toFixed(2) : '');
    setMaxPrice(item.maxPrice ? (item.maxPrice / 100).toFixed(2) : '');
  }, [item.id, item.name, item.description, item.imageUrl, item.displayImage, item.isAvailable, item.intelligentInventorySync, item.basePrice, item.currentPrice, item.minPrice, item.maxPrice]);

  async function handleSave() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      toast.error('Product name is required');
      return;
    }

    const refPence = poundsInputToPence(referencePrice, item.currentPrice);
    const minPence = poundsInputToPence(minPrice, item.minPrice);
    const maxPence = poundsInputToPence(maxPrice, item.maxPrice);

    if (refPence <= 0) {
      toast.error('Enter a valid reference price greater than zero');
      return;
    }
    if (minPence <= 0 || maxPence <= 0) {
      toast.error('Min and max prices must be greater than zero');
      return;
    }
    if (minPence > maxPence) {
      toast.error('Minimum price cannot be greater than maximum price');
      return;
    }

    const trimmedImage = imageUrl.trim();
    if (trimmedImage && !isDataImage(trimmedImage) && !isHttpUrl(trimmedImage)) {
      toast.error('Image must be a direct image URL or uploaded image data');
      return;
    }
    if (trimmedImage && isHttpUrl(trimmedImage)) {
      const ok = await canLoadImageUrl(trimmedImage);
      if (!ok) {
        toast.error('Image URL is not loadable. Use a direct image link (right-click image -> Copy image address).');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await menuApi.update(venueId, item.id, {
        name: trimmedName,
        description: description.trim() || undefined,
        imageUrl: trimmedImage || null,
        displayImage,
        currentPrice: refPence,
        basePrice: refPence,
        minPrice: minPence,
        maxPrice: maxPence,
        isAvailable: !outOfStock,
        intelligentInventorySync: intelligentSync,
      });
      const updated: MenuItem = res.data.data;
      await qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
      onSaved?.(updated);
      toast.success('Master product updated');
      onClose();
    } catch {
      toast.error('Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  function handlePickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setImageUrl(dataUrl);
      setDisplayImage(true);
    };
    reader.onerror = () => toast.error('Failed to read image file');
    reader.readAsDataURL(file);
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-[560px] max-h-[85vh] flex flex-col">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">Edit master product</h2>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">

          {/* ── Name ────────────────────────────────────────────────────── */}
          <div>
            <LangTabs lang={lang} onChange={setLang} />
            <FieldRow label={`Name (${lang.toUpperCase()}) *`} hint="Name of the product when displayed in the menu">
              <Input value={name} onChange={(e) => setName(e.target.value)} className="h-9 text-sm" />
            </FieldRow>
          </div>

          {/* ── Description ─────────────────────────────────────────────── */}
          <div>
            <LangTabs lang={lang} onChange={setLang} />
            <FieldRow label={`Description (${lang.toUpperCase()})`} hint="Description of the product displayed under the name">
              <Input value={description} onChange={(e) => setDescription(e.target.value)} className="h-9 text-sm" />
            </FieldRow>
          </div>

          {/* ── Product image ─────────────────────────────────────────────── */}
          <div>
            <FieldRow
              label="Dish image"
              hint="Paste an image URL or upload a photo. This image is used in menu preview/public cards."
            >
              <div className="space-y-2">
                <Input
                  value={imageUrl}
                  onChange={(e) => setImageUrl(e.target.value)}
                  placeholder="https://... or data:image/..."
                  className="h-9 text-sm"
                />
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept="image/*"
                    onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                    className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-secondary/80"
                  />
                  {imageUrl && (
                    <button
                      type="button"
                      onClick={() => setImageUrl('')}
                      className="px-2 py-1 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>
            </FieldRow>
            <SettingsToggle
              label="Display image in menu"
              description="Turn off to keep the image saved but hide it from menu preview/public menu"
              value={displayImage}
              onChange={setDisplayImage}
            />
          </div>

          {/* ── Popup description ────────────────────────────────────────── */}
          <div>
            <LangTabs lang={lang} onChange={setLang} />
            <FieldRow label={`Popup description (${lang.toUpperCase()})`} hint="Description of the product when clicked to view more details">
              <textarea
                value={popupDescription}
                onChange={(e) => setPopupDescription(e.target.value)}
                rows={3}
                placeholder="Extended description…"
                className="w-full text-sm border border-border rounded-md px-3 py-2 bg-background resize-none focus:outline-none focus:ring-1 focus:ring-primary/40 text-foreground placeholder:text-muted-foreground/50"
              />
            </FieldRow>
          </div>

          {/* ── Out of stock ─────────────────────────────────────────────── */}
          <SettingsToggle
            label="Out of stock"
            description="Mark this product as temporarily unavailable"
            value={outOfStock}
            onChange={setOutOfStock}
          />
          <SettingsToggle
            label="Intelligent Menu (inventory)"
            description="When on, this dish is hidden from the main category list, menu preview, and public menu if linked ingredients are out of stock. It reappears when inventory is restocked. You can still open it from “Hidden (stock)” below."
            value={intelligentSync}
            onChange={setIntelligentSync}
          />

          {/* ── Master sale format ───────────────────────────────────────── */}
          <FieldRow label="Master sale format *">
            <Select value={masterFormat} onValueChange={setMasterFormat}>
              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="dish">Dish</SelectItem>
                <SelectItem value="sharing">Sharing plate</SelectItem>
                <SelectItem value="set_menu">Set menu</SelectItem>
                <SelectItem value="takeaway">Takeaway</SelectItem>
                <SelectItem value="a_la_carte">À la carte</SelectItem>
              </SelectContent>
            </Select>
          </FieldRow>

          {/* ── Product master ───────────────────────────────────────────── */}
          <FieldRow label="Product master" hint="Assign a master product for this product">
            <Input placeholder="Search or assign a master product…" className="h-9 text-sm" />
          </FieldRow>

          {/* ── Advanced settings toggle ─────────────────────────────────── */}
          {!showAdvanced ? (
            <button
              onClick={() => setShowAdvanced(true)}
              className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors"
            >
              Show advanced settings
            </button>
          ) : (
            <>
              {/* ── Advanced toggles ──────────────────────────────────── */}
              <div className="space-y-2.5 pt-1">
                <SettingsToggle
                  label="Sold by weight"
                  description="Price is calculated based on the weight of the portion"
                  value={soldByWeight}
                  onChange={setSoldByWeight}
                />
                <SettingsToggle
                  label="Revenue managed"
                  description="Include this product in revenue management and price optimisation"
                  value={revenueManaged}
                  onChange={setRevenueManaged}
                />
              </div>

              {/* ── Preparation attributes ───────────────────────────── */}
              <div>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm font-semibold text-foreground">Preparation attributes</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-4">
                  <FieldRow label="Unit cost" hint="The cost to produce each unit of product">
                    <div className="relative">
                      <Input type="number" min="0" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} className="h-9 text-sm pr-7" placeholder="0.00" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Consumption per person" hint="How many units of product does each diner eat">
                    <Input type="number" min="0" step="0.1" value={consumption} onChange={(e) => setConsumption(e.target.value)} className="h-9 text-sm" />
                  </FieldRow>
                  <div className="space-y-1">
                    <label className="text-xs text-muted-foreground">Processing speed: <span className="font-semibold text-foreground">{processingSpeed}</span></label>
                    <input
                      type="range" min={1} max={5} step={1}
                      value={processingSpeed}
                      onChange={(e) => setProcessingSpeed(Number(e.target.value))}
                      className="w-full h-1.5 rounded-full appearance-none bg-border cursor-pointer accent-primary"
                    />
                    <div className="flex justify-between text-[10px] text-muted-foreground/60">
                      <span>1 — Fastest</span>
                      <span>5 — Slowest</span>
                    </div>
                    <p className="text-xs text-muted-foreground/70">Being 5 the slowest in the restaurant and 1 the fastest</p>
                  </div>
                </div>
              </div>

              {/* ── Product prices ───────────────────────────────────── */}
              <div>
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-sm font-semibold text-foreground">Product prices</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
                <div className="space-y-4">
                  <FieldRow label="Minimum allowed price" hint="Only enforced in the optimiser">
                    <div className="relative">
                      <Input type="number" min="0" step="0.01" value={minPrice} onChange={(e) => setMinPrice(e.target.value)} className="h-9 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Reference price" hint="Starting price for the optimisation process">
                    <div className="relative">
                      <Input type="number" min="0" step="0.01" value={referencePrice} onChange={(e) => setReferencePrice(e.target.value)} className="h-9 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
                    </div>
                  </FieldRow>
                  <FieldRow label="Maximum allowed price" hint="Only enforced in the optimiser">
                    <div className="relative">
                      <Input type="number" min="0" step="0.01" value={maxPrice} onChange={(e) => setMaxPrice(e.target.value)} className="h-9 text-sm pr-7" />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">£</span>
                    </div>
                  </FieldRow>
                </div>
              </div>

              <button
                onClick={() => setShowAdvanced(false)}
                className="w-full py-2.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-lg hover:bg-secondary transition-colors"
              >
                Hide advanced settings
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Product Settings Modal ───────────────────────────────────────────────────

const SALES_FORMATS = ['Dish', 'Sharing plate', 'Set menu', 'Takeaway', 'À la carte'] as const;

function ProductSettingsModal({
  item,
  venueId,
  onClose,
  onEditMaster,
  onSaved,
}: {
  item: MenuItem;
  venueId: string;
  onClose: () => void;
  onEditMaster?: () => void;
  onSaved?: (updated: MenuItem) => void;
}) {
  const qc = useQueryClient();
  const [isVisible,        setIsVisible]        = useState(item.isAvailable !== false);
  const [imageUrl,         setImageUrl]         = useState(item.imageUrl ?? '');
  const [displayImage,     setDisplayImage]     = useState(item.displayImage !== false);
  const [isSpecial,        setIsSpecial]        = useState(false);
  const [specialDesc,      setSpecialDesc]      = useState(false);
  const [showVideo,        setShowVideo]        = useState(false);
  const [onlineOrder,      setOnlineOrder]      = useState(true);
  const [allowMods,        setAllowMods]        = useState(true);
  const [dailySpecial,     setDailySpecial]     = useState(false);
  const [ageVerification,  setAgeVerification]  = useState(false);
  const [trackInventory,   setTrackInventory]   = useState(false);
  const [salesFormats, setSalesFormats] = useState<string[]>(['Dish']);
  const [saving, setSaving] = useState(false);

  function toggleFormat(f: string) {
    setSalesFormats((prev) =>
      prev.includes(f) ? prev.filter((x) => x !== f) : [...prev, f]
    );
  }

  useEffect(() => {
    setIsVisible(item.isAvailable !== false);
    setImageUrl(item.imageUrl ?? '');
    setDisplayImage(item.displayImage !== false);
  }, [item.id, item.isAvailable, item.imageUrl, item.displayImage]);

  function handlePickImage(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      if (!dataUrl) return;
      setImageUrl(dataUrl);
      setDisplayImage(true);
    };
    reader.onerror = () => toast.error('Failed to read image file');
    reader.readAsDataURL(file);
  }

  async function handleSave() {
    const trimmedImage = imageUrl.trim();
    if (trimmedImage && !isDataImage(trimmedImage) && !isHttpUrl(trimmedImage)) {
      toast.error('Image must be a direct image URL or uploaded image data');
      return;
    }
    if (trimmedImage && isHttpUrl(trimmedImage)) {
      const ok = await canLoadImageUrl(trimmedImage);
      if (!ok) {
        toast.error('Image URL is not loadable. Use a direct image link (right-click image -> Copy image address).');
        return;
      }
    }

    setSaving(true);
    try {
      const res = await menuApi.update(venueId, item.id, {
        isAvailable: isVisible,
        imageUrl: trimmedImage || null,
        displayImage,
      });
      const updated: MenuItem = res.data.data;
      await qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
      onSaved?.(updated);
      toast.success('Product settings saved');
      onClose();
    } catch (err) {
      toastApiError(err, 'Failed to save product settings');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-[480px] max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-semibold text-foreground">Edit menu product</h2>
            <p className="text-xs text-muted-foreground mt-0.5 uppercase tracking-wide">{item.name}</p>
          </div>
          <button onClick={onClose} className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors mt-0.5">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Edit master product link */}
        <div className="px-6 pt-4 pb-3 border-b border-border">
          <button
            onClick={onEditMaster}
            className="text-[11px] font-semibold tracking-widest uppercase text-primary border-b-2 border-primary pb-0.5 hover:text-primary/80 transition-colors"
          >
            Edit master product
          </button>
        </div>

        <div className="px-6 py-5 space-y-2.5">

          {/* ── Visibility & display ───────────────────────────────────────── */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-1 pb-0.5">Visibility &amp; display</p>

          <SettingsToggle
            label="Product is visible"
            description="Show this product when the menu is live or viewed by guests"
            value={isVisible}
            onChange={setIsVisible}
          />

          <FieldRow
            label="Dish image"
            hint="Paste image URL or upload from your device"
          >
            <div className="space-y-2">
              <Input
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="https://..."
                className="h-9 text-sm"
              />
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => handlePickImage(e.target.files?.[0] ?? null)}
                  className="block w-full text-xs text-muted-foreground file:mr-2 file:rounded-md file:border file:border-border file:bg-secondary file:px-2.5 file:py-1.5 file:text-xs file:text-foreground hover:file:bg-secondary/80"
                />
                {imageUrl && (
                  <button
                    type="button"
                    onClick={() => setImageUrl('')}
                    className="px-2 py-1 text-xs border border-border rounded-md hover:bg-secondary transition-colors"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>
          </FieldRow>
          <SettingsToggle
            label="Display image in menu"
            description="Keep image saved but hide/show it in guest menu preview"
            value={displayImage}
            onChange={setDisplayImage}
          />

          <SettingsToggle
            label="Show as special product"
            description="Highlight this dish with a special badge on the menu"
            value={isSpecial}
            onChange={setIsSpecial}
          />

          <SettingsToggle
            label="Show special description"
            description="Display an extended description or chef's note for this product"
            value={specialDesc}
            onChange={setSpecialDesc}
          />

          <SettingsToggle
            label="Show video instead of image"
            description="Use a video clip to showcase this dish rather than a photo"
            value={showVideo}
            onChange={setShowVideo}
          />

          <SettingsToggle
            label="Include in daily specials"
            description="Feature this product in the rotating daily specials section"
            value={dailySpecial}
            onChange={setDailySpecial}
          />

          {/* ── Ordering & operations ─────────────────────────────────────── */}
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pt-3 pb-0.5">Ordering &amp; operations</p>

          <SettingsToggle
            label="Available for online ordering"
            description="Guests can order this product through the online or QR menu"
            value={onlineOrder}
            onChange={setOnlineOrder}
          />

          <SettingsToggle
            label="Allow modifications &amp; requests"
            description="Guests can add dietary notes or preparation requests for this dish"
            value={allowMods}
            onChange={setAllowMods}
          />

          <SettingsToggle
            label="Age verification required"
            description="Require age confirmation before ordering (e.g. dishes with alcohol)"
            value={ageVerification}
            onChange={setAgeVerification}
          />

          <SettingsToggle
            label="Track inventory"
            description="Monitor stock levels and mark this product as sold out when depleted"
            value={trackInventory}
            onChange={setTrackInventory}
          />

          {/* ── Sales formats ──────────────────────────────────────────────── */}
          <div className="pt-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground pb-2">Sales formats in use</p>
            <div className="flex flex-wrap gap-2">
              {SALES_FORMATS.map((f) => {
                const active = salesFormats.includes(f);
                return (
                  <button
                    key={f}
                    onClick={() => toggleFormat(f)}
                    className={cn(
                      'px-3 py-1 rounded-full text-xs font-medium border transition-colors',
                      active
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background text-muted-foreground border-border hover:border-primary/50 hover:text-foreground'
                    )}
                  >
                    {f}
                  </button>
                );
              })}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
          >
            {saving ? 'Saving…' : 'Confirm'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Menu row ─────────────────────────────────────────────────────────────────

function MenuTableHeader() {
  return (
    <div className="flex items-center bg-secondary/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-widest select-none">
      <div className="flex-1 py-2.5 pl-8 pr-6 text-left">Menu</div>
      <div className="w-[200px] py-2.5 flex items-center justify-center shrink-0">Controls</div>
    </div>
  );
}

function MenuRow({
  menu,
  onView,
  onPreview,
  onQr,
  onSettings,
  onRename,
  onDelete,
  onDesign,
}: {
  menu: MenuDef;
  onView: () => void;
  onPreview: () => void;
  onQr: () => void;
  onSettings: () => void;
  onRename: () => void;
  onDelete: () => void;
  onDesign: () => void;
}) {
  return (
    <div className="flex items-center border-b border-border last:border-0 hover:bg-secondary/20 transition-colors cursor-pointer group" onClick={onView}>

      {/* Name + description */}
      <div className="flex-1 py-5 pl-8 pr-6 min-w-0">
        <p className="text-[15px] font-medium text-foreground truncate">{menu.name}</p>
        {menu.description && <p className="text-sm text-muted-foreground mt-0.5 truncate">{menu.description}</p>}
      </div>

      {/* Controls: eye + publish/print/design/settings/rename/delete */}
      <div className="w-[200px] py-5 flex items-center justify-center shrink-0" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <button onClick={onPreview} title="Preview" className="text-muted-foreground hover:text-foreground transition-colors"><Eye className="h-[17px] w-[17px]" /></button>
          <button
            onClick={onQr}
            title="QR menu / Integrations"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <QrCode className="h-[17px] w-[17px]" />
          </button>
          <button onClick={onDesign} title="Design" className="text-muted-foreground hover:text-foreground transition-colors"><Palette className="h-[17px] w-[17px]" /></button>
          <button onClick={onSettings} title="Settings" className="text-muted-foreground hover:text-foreground transition-colors"><Wrench className="h-[17px] w-[17px]" /></button>
          <button onClick={onRename} title="Rename" className="text-muted-foreground hover:text-foreground transition-colors"><Pencil className="h-[17px] w-[17px]" /></button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            title="Delete"
            className="text-muted-foreground hover:text-red-500 transition-colors"
          >
            <Trash2 className="h-[17px] w-[17px]" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Category row ─────────────────────────────────────────────────────────────

const CAT_COL = { controls: 'w-[140px]' } as const;

function CategoryTableHeader() {
  return (
    <div className="flex items-center bg-secondary/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-widest select-none">
      <div className="flex-1 py-2.5 pl-8 pr-6 text-left">Category</div>
      <div className={`${CAT_COL.controls} py-2.5 flex items-center justify-center shrink-0`}>Controls</div>
    </div>
  );
}

function CategoryRow({
  category,
  items,
  onClick,
  onRename,
  onDelete,
}: {
  category: string;
  items: MenuItem[];
  onClick: () => void;
  onRename: (name: string) => void;
  onDelete: () => void;
}) {
  const [showRename, setShowRename] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  return (
    <>
      <div
        className="flex items-center border-b border-border last:border-0 hover:bg-secondary/20 transition-colors cursor-pointer group"
        onClick={onClick}
      >
        <div className="flex-1 py-4 pl-8 pr-6 flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-medium text-foreground truncate">{category}</span>
          <span className="text-sm text-muted-foreground shrink-0">
            {(() => {
              const shown = items.filter((i) => !i.intelligentlyHidden).length;
              const hid = items.filter((i) => i.intelligentlyHidden).length;
              if (hid === 0) return `${items.length} item${items.length !== 1 ? 's' : ''}`;
              return `${shown} shown · ${hid} hidden (stock)`;
            })()}
          </span>
        </div>

        {/* No eye — open category by clicking the row; settings / rename / delete only */}
        <div className={`${CAT_COL.controls} py-4 flex items-center justify-center shrink-0`} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={() => setShowSettings(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Settings">
              <Wrench className="h-[17px] w-[17px]" />
            </button>
            <button type="button" onClick={() => setShowRename(true)} className="text-muted-foreground hover:text-foreground transition-colors" title="Rename">
              <Pencil className="h-[17px] w-[17px]" />
            </button>
            <button type="button" onClick={() => setShowDelete(true)} className="text-muted-foreground hover:text-red-500 transition-colors" title="Delete">
              <Trash2 className="h-[17px] w-[17px]" />
            </button>
          </div>
        </div>
      </div>

      {showRename && (
        <RenameModal
          title="Rename category"
          label="Category name"
          current={category}
          onClose={() => setShowRename(false)}
          onRename={(name) => onRename(name)}
        />
      )}
      {showDelete && (
        <DeleteConfirmModal
          title="Delete category"
          label={category}
          detail="The category is removed from the database. Products in this category remain in your venue but lose this category link until you assign them elsewhere."
          onClose={() => setShowDelete(false)}
          onConfirm={onDelete}
        />
      )}
      {showSettings && (
        <CategorySettingsModal
          category={category}
          onClose={() => setShowSettings(false)}
        />
      )}
    </>
  );
}

// ─── Ingredient data ──────────────────────────────────────────────────────────

interface InventoryItem {
  id: string;
  name: string;
  unit: string;
  unitCostPence: number;
}

interface SubRecipeLine { costPence: number; wastePct: number; }
interface SubRecipe {
  id: string;
  name: string;
  yieldQty: number;
  yieldUnit: string;
  lines: SubRecipeLine[];
}

/** Cost in pence for `qty` units of a sub-recipe (total cost ÷ yield × qty). */
function subRecipeLineCostPence(sr: SubRecipe, qty: number): number {
  const total = sr.lines.reduce((s, l) => s + Math.round(l.costPence * (1 + l.wastePct / 100)), 0);
  const perUnit = sr.yieldQty > 0 ? total / sr.yieldQty : total;
  return Math.round(perUnit * qty);
}

interface Ingredient {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  costPence: number; // total cost for this quantity in pence
  /** When set, cost auto-recalculates from inventory pricing on qty/unit changes */
  inventoryItemId?: string | null;
}

const MOCK_INGREDIENTS: Record<string, Ingredient[]> = {
  'Garlic Bread': [
    { id: '1', name: 'Sourdough bread',  quantity: 200, unit: 'g',   costPence: 30  },
    { id: '2', name: 'Unsalted butter',  quantity: 40,  unit: 'g',   costPence: 20  },
    { id: '3', name: 'Fresh garlic',     quantity: 12,  unit: 'g',   costPence: 8   },
    { id: '4', name: 'Fresh parsley',    quantity: 5,   unit: 'g',   costPence: 6   },
    { id: '5', name: 'Olive oil',        quantity: 10,  unit: 'ml',  costPence: 5   },
    { id: '6', name: 'Sea salt',         quantity: 2,   unit: 'g',   costPence: 1   },
  ],
  'House Burger': [
    { id: '1', name: 'Beef patty (180g)', quantity: 180, unit: 'g',  costPence: 120 },
    { id: '2', name: 'Brioche bun',       quantity: 1,   unit: 'pcs',costPence: 25  },
    { id: '3', name: 'Cheddar cheese',    quantity: 30,  unit: 'g',  costPence: 20  },
    { id: '4', name: 'Iceberg lettuce',   quantity: 20,  unit: 'g',  costPence: 5   },
    { id: '5', name: 'Beef tomato',       quantity: 40,  unit: 'g',  costPence: 8   },
    { id: '6', name: 'Red onion',         quantity: 20,  unit: 'g',  costPence: 4   },
    { id: '7', name: 'Gherkin',           quantity: 15,  unit: 'g',  costPence: 6   },
    { id: '8', name: 'Burger sauce',      quantity: 20,  unit: 'ml', costPence: 10  },
    { id: '9', name: 'Chips (portion)',   quantity: 200, unit: 'g',  costPence: 35  },
  ],
  'Fish & Chips': [
    { id: '1', name: 'Cod fillet',        quantity: 200, unit: 'g',  costPence: 180 },
    { id: '2', name: 'Batter mix',        quantity: 80,  unit: 'g',  costPence: 15  },
    { id: '3', name: 'Chips (portion)',   quantity: 250, unit: 'g',  costPence: 40  },
    { id: '4', name: 'Mushy peas',        quantity: 80,  unit: 'g',  costPence: 12  },
    { id: '5', name: 'Tartare sauce',     quantity: 30,  unit: 'ml', costPence: 10  },
    { id: '6', name: 'Lemon wedge',       quantity: 1,   unit: 'pcs',costPence: 5   },
    { id: '7', name: 'Sunflower oil',     quantity: 100, unit: 'ml', costPence: 15  },
  ],
  'Margherita Pizza': [
    { id: '1', name: 'Pizza dough ball',  quantity: 250, unit: 'g',  costPence: 35  },
    { id: '2', name: 'San Marzano tomato',quantity: 80,  unit: 'ml', costPence: 18  },
    { id: '3', name: 'Fior di latte',     quantity: 100, unit: 'g',  costPence: 60  },
    { id: '4', name: 'Fresh basil',       quantity: 5,   unit: 'g',  costPence: 8   },
    { id: '5', name: 'Olive oil (EVOO)',  quantity: 10,  unit: 'ml', costPence: 8   },
    { id: '6', name: 'Sea salt',          quantity: 2,   unit: 'g',  costPence: 1   },
  ],
  'Caesar Salad': [
    { id: '1', name: 'Romaine lettuce',   quantity: 120, unit: 'g',  costPence: 30  },
    { id: '2', name: 'Caesar dressing',   quantity: 40,  unit: 'ml', costPence: 25  },
    { id: '3', name: 'Parmesan shavings', quantity: 20,  unit: 'g',  costPence: 22  },
    { id: '4', name: 'Croutons',          quantity: 30,  unit: 'g',  costPence: 8   },
    { id: '5', name: 'Anchovy fillet',    quantity: 2,   unit: 'pcs',costPence: 10  },
    { id: '6', name: 'Black pepper',      quantity: 1,   unit: 'g',  costPence: 2   },
  ],
  'Chicken Wings': [
    { id: '1', name: 'Chicken wings',     quantity: 300, unit: 'g',  costPence: 90  },
    { id: '2', name: 'Hot sauce',         quantity: 40,  unit: 'ml', costPence: 12  },
    { id: '3', name: 'Butter',            quantity: 20,  unit: 'g',  costPence: 10  },
    { id: '4', name: 'Blue cheese dip',   quantity: 40,  unit: 'ml', costPence: 20  },
    { id: '5', name: 'Celery sticks',     quantity: 40,  unit: 'g',  costPence: 8   },
    { id: '6', name: 'Sunflower oil',     quantity: 50,  unit: 'ml', costPence: 8   },
  ],
  'Espresso Martini': [
    { id: '1', name: 'Vodka',             quantity: 50,  unit: 'ml', costPence: 55  },
    { id: '2', name: 'Coffee liqueur',    quantity: 25,  unit: 'ml', costPence: 30  },
    { id: '3', name: 'Fresh espresso',    quantity: 25,  unit: 'ml', costPence: 15  },
    { id: '4', name: 'Simple syrup',      quantity: 10,  unit: 'ml', costPence: 3   },
    { id: '5', name: 'Coffee beans',      quantity: 3,   unit: 'pcs',costPence: 2   },
  ],
  'Aperol Spritz': [
    { id: '1', name: 'Aperol',            quantity: 60,  unit: 'ml', costPence: 35  },
    { id: '2', name: 'Prosecco',          quantity: 90,  unit: 'ml', costPence: 45  },
    { id: '3', name: 'Soda water',        quantity: 30,  unit: 'ml', costPence: 3   },
    { id: '4', name: 'Orange slice',      quantity: 1,   unit: 'pcs',costPence: 5   },
    { id: '5', name: 'Ice',               quantity: 80,  unit: 'g',  costPence: 1   },
  ],
  'Mojito': [
    { id: '1', name: 'White rum',         quantity: 50,  unit: 'ml', costPence: 40  },
    { id: '2', name: 'Fresh lime juice',  quantity: 25,  unit: 'ml', costPence: 12  },
    { id: '3', name: 'Sugar syrup',       quantity: 15,  unit: 'ml', costPence: 4   },
    { id: '4', name: 'Fresh mint',        quantity: 10,  unit: 'g',  costPence: 8   },
    { id: '5', name: 'Soda water',        quantity: 60,  unit: 'ml', costPence: 5   },
    { id: '6', name: 'Crushed ice',       quantity: 100, unit: 'g',  costPence: 2   },
    { id: '7', name: 'Lime wedge',        quantity: 1,   unit: 'pcs',costPence: 4   },
  ],
  'Flat White': [
    { id: '1', name: 'Espresso (double)', quantity: 60,  unit: 'ml', costPence: 18  },
    { id: '2', name: 'Whole milk',        quantity: 130, unit: 'ml', costPence: 10  },
  ],
  'Cappuccino': [
    { id: '1', name: 'Espresso (double)', quantity: 60,  unit: 'ml', costPence: 18  },
    { id: '2', name: 'Whole milk',        quantity: 100, unit: 'ml', costPence: 8   },
    { id: '3', name: 'Milk foam',         quantity: 30,  unit: 'ml', costPence: 3   },
    { id: '4', name: 'Cocoa powder',      quantity: 1,   unit: 'g',  costPence: 1   },
  ],
  'Hot Chocolate': [
    { id: '1', name: 'Whole milk',        quantity: 200, unit: 'ml', costPence: 15  },
    { id: '2', name: 'Belgian chocolate', quantity: 30,  unit: 'g',  costPence: 25  },
    { id: '3', name: 'Whipped cream',     quantity: 20,  unit: 'ml', costPence: 8   },
    { id: '4', name: 'Cocoa powder',      quantity: 2,   unit: 'g',  costPence: 2   },
  ],
  'House Lager (Pint)': [
    { id: '1', name: 'Draught lager',     quantity: 568, unit: 'ml', costPence: 95  },
  ],
  'Bottle of Beer': [
    { id: '1', name: 'Bottled beer',      quantity: 330, unit: 'ml', costPence: 65  },
  ],
  'Cheese Board': [
    { id: '1', name: 'Cheddar',           quantity: 40,  unit: 'g',  costPence: 30  },
    { id: '2', name: 'Brie',              quantity: 40,  unit: 'g',  costPence: 35  },
    { id: '3', name: 'Stilton',           quantity: 30,  unit: 'g',  costPence: 32  },
    { id: '4', name: 'Crackers',          quantity: 30,  unit: 'g',  costPence: 12  },
    { id: '5', name: 'Grapes',            quantity: 60,  unit: 'g',  costPence: 18  },
    { id: '6', name: 'Chutney',           quantity: 25,  unit: 'g',  costPence: 10  },
    { id: '7', name: 'Celery',            quantity: 20,  unit: 'g',  costPence: 5   },
  ],
};

// ─── Product row (clickable dish) ─────────────────────────────────────────────

function ProductRow({
  item,
  onClickItem,
  onOpenSettings,
  onOpenEdit,
  onRequestDelete,
}: {
  item: MenuItem;
  onClickItem: (item: MenuItem) => void;
  onOpenSettings: (item: MenuItem) => void;
  onOpenEdit: (item: MenuItem) => void;
  onRequestDelete: (item: MenuItem) => void;
}) {
  return (
    <tr
      onClick={() => onClickItem(item)}
      className="border-b border-border last:border-0 hover:bg-secondary/20 transition-colors cursor-pointer group"
    >
      <td className="py-4 pl-8 pr-6 font-medium text-foreground truncate align-middle">
        <span className="inline-flex items-center gap-2 min-w-0">
          <span className="truncate">{item.name}</span>
          {item.intelligentlyHidden && (
            <span className="text-[9px] font-semibold uppercase shrink-0 px-1.5 py-0.5 rounded border border-rose-200 bg-rose-50 text-rose-700">
              Stock
            </span>
          )}
        </span>
      </td>
      <td className="py-4 px-6 align-middle" onClick={(e) => e.stopPropagation()}>
        {/* No eye — open product by clicking the row */}
        <div className="flex items-center justify-center gap-3">
          <button type="button" onClick={() => onOpenSettings(item)} className="text-muted-foreground hover:text-foreground transition-colors" title="Settings"><Wrench className="h-4 w-4" /></button>
          <button type="button" onClick={() => onOpenEdit(item)} className="text-muted-foreground hover:text-foreground transition-colors" title="Edit"><Pencil className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRequestDelete(item);
            }}
            className="text-muted-foreground hover:text-red-500 transition-colors"
            title="Delete product"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ProductTable({ items, stockHiddenItems = [], onClickItem, venueId, onProductDeleted }: {
  items: MenuItem[];
  /** Products under intelligent inventory sync that are temporarily hidden (out of stock) */
  stockHiddenItems?: MenuItem[];
  onClickItem: (item: MenuItem) => void;
  venueId: string;
  /** Called after a product is removed from the DB (e.g. clear detail view) */
  onProductDeleted?: (productId: string) => void;
}) {
  const qc = useQueryClient();
  // Modal state lives HERE — outside <table> — so portals work correctly
  const [settingsItem, setSettingsItem] = useState<MenuItem | null>(null);
  const [masterItem,   setMasterItem]   = useState<MenuItem | null>(null);
  const [editItem,     setEditItem]     = useState<MenuItem | null>(null);
  const [deletingProduct, setDeletingProduct] = useState<MenuItem | null>(null);

  return (
    <>
      <table className="w-full table-fixed text-sm border-collapse">
        <colgroup>
          <col />{/* name — takes all remaining width */}
          <col style={{ width: 140 }} />
        </colgroup>
        <thead>
          <tr className="bg-secondary/30 border-b border-border">
            <th className="py-2.5 pl-8 pr-6 text-left   text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Product</th>
            <th className="py-2.5 px-6 text-center text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">Controls</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && stockHiddenItems.length === 0 ? (
            <tr>
              <td colSpan={2} className="py-12 text-center text-sm text-muted-foreground">
                No products in this category.
              </td>
            </tr>
          ) : (
            items.map((item) => (
              <ProductRow
                key={item.id}
                item={item}
                onClickItem={onClickItem}
                onOpenSettings={(i) => setSettingsItem(i)}
                onOpenEdit={(i) => setEditItem(i)}
                onRequestDelete={(i) => setDeletingProduct(i)}
              />
            ))
          )}
        </tbody>
      </table>

      {stockHiddenItems.length > 0 && (
        <div className="mt-8 border-t border-border pt-6">
          {/* Match Product column inset (th/td use pl-8 pr-6) so copy lines up with dish names above */}
          <div className="pl-8 pr-6">
            <h3 className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              <span>Hidden (intelligent menu — out of stock)</span>
              <Eye className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden />
            </h3>
            <p className="mb-4 max-w-2xl text-xs leading-relaxed text-muted-foreground">
              These dishes stay in your menu data but are hidden from the main list, phone preview, and public menu until linked inventory is restocked. Open one to edit or turn off “Intelligent Menu (inventory)” in master product settings.
            </p>
          </div>
          <table className="w-full table-fixed text-sm border-collapse opacity-95">
            <colgroup>
              <col />
              <col style={{ width: 140 }} />
            </colgroup>
            <tbody>
              {stockHiddenItems.map((item) => (
                <ProductRow
                  key={item.id}
                  item={item}
                  onClickItem={onClickItem}
                  onOpenSettings={(i) => setSettingsItem(i)}
                  onOpenEdit={(i) => setEditItem(i)}
                  onRequestDelete={(i) => setDeletingProduct(i)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modals rendered outside <table> so portals work without DOM hierarchy issues */}
      {deletingProduct && (
        <DeleteConfirmModal
          title="Delete product"
          label={deletingProduct.name}
          detail="This permanently deletes the dish from the database, including its ingredients list. Historical POS tickets are unchanged."
          onClose={() => setDeletingProduct(null)}
          onConfirm={async () => {
            try {
              await menuApi.delete(venueId, deletingProduct.id);
              qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
              qc.removeQueries({ queryKey: ['ingredients', deletingProduct.id] });
              toast.success('Product deleted');
              onProductDeleted?.(deletingProduct.id);
            } catch (err) {
              toastApiError(err, 'Failed to delete product');
              throw err;
            }
          }}
        />
      )}
      {settingsItem && (
        <ProductSettingsModal
          item={settingsItem}
          venueId={venueId}
          onClose={() => setSettingsItem(null)}
          onSaved={(updated) => setSettingsItem(updated)}
          onEditMaster={() => { setSettingsItem(null); setMasterItem(settingsItem); }}
        />
      )}
      {masterItem && (
        <EditMasterProductModal
          item={masterItem}
          venueId={venueId}
          onClose={() => setMasterItem(null)}
        />
      )}
      {editItem && (
        <EditProductModal
          item={editItem}
          venueId={venueId}
          onClose={() => setEditItem(null)}
          onSaved={() => setEditItem(null)}
        />
      )}
    </>
  );
}

const UNITS = ['g', 'kg', 'ml', 'L', 'pcs', 'tbsp', 'tsp', 'oz', 'bunch', 'slice'];

// ─── Edit product (name + description) modal ─────────────────────────────────

function EditProductModal({
  item,
  venueId,
  onClose,
  onSaved,
}: {
  item: MenuItem;
  venueId: string;
  onClose: () => void;
  onSaved: (updated: MenuItem) => void;
}) {
  const qc = useQueryClient();
  const [name, setName]           = useState(item.name);
  const [description, setDesc]    = useState(item.description ?? '');
  const [saving, setSaving]       = useState(false);

  async function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      const res = await menuApi.update(venueId, item.id, {
        name: trimmed,
        description: description.trim() || undefined,
      });
      const updated: MenuItem = res.data.data;
      qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
      onSaved(updated);
      onClose();
    } catch {
      toast.error('Failed to save product');
    } finally {
      setSaving(false);
    }
  }

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-[480px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-foreground">Edit product</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Product name
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="Product name"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-1.5">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDesc(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
              placeholder="Short description (optional)"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button onClick={onClose} className="px-4 py-2 text-sm rounded-lg border border-border text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Menu look (QR + preview theme) ───────────────────────────────────────────

function MenuStylePickerModal({
  venueId,
  currentStyle,
  onClose,
}: {
  venueId: string;
  currentStyle: MenuPreviewStyle;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const updateVenueStore = useVenueStore((s) => s.updateVenue);
  const [style, setStyle] = useState<MenuPreviewStyle>(currentStyle);

  useEffect(() => {
    setStyle(currentStyle);
  }, [currentStyle]);

  const saveMut = useMutation({
    mutationFn: () => venueApi.update(venueId, { publicMenuStyle: style }),
    onSuccess: (resp) => {
      const v = resp.data?.data as { id?: string } | undefined;
      if (v && typeof v === 'object') updateVenueStore(venueId, v as Record<string, unknown>);
      else updateVenueStore(venueId, { publicMenuStyle: style });
      qc.invalidateQueries({ queryKey: ['venues'] });
      qc.invalidateQueries({ queryKey: ['venue', venueId] });
      toast.success('Menu look saved — guest menu and QR match this style.');
      onClose();
    },
    onError: () => toast.error('Could not save menu look'),
  });

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-xl w-full max-w-lg mx-4 flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-[15px] font-semibold text-foreground">Menu look</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="px-6 pt-4 text-xs text-muted-foreground leading-relaxed">
          This controls the guest-facing menu (QR link) and the phone preview here. Pick a base layout now — you can
          supply custom fast-food artwork later.
        </p>
        <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setStyle('gourmet')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              style === 'gourmet'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-primary/35',
            )}
          >
            <UtensilsCrossed className="h-8 w-8 text-primary mb-2" />
            <div className="font-semibold text-sm text-foreground">Gourmet</div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Refined tabs and cards — default for full-service dining.
            </div>
          </button>
          <button
            type="button"
            onClick={() => setStyle('fast_food')}
            className={cn(
              'rounded-xl border-2 p-4 text-left transition-all',
              style === 'fast_food'
                ? 'border-primary bg-primary/5 ring-1 ring-primary/20'
                : 'border-border hover:border-primary/35',
            )}
          >
            <Flame className="h-8 w-8 text-amber-600 mb-2" />
            <div className="font-semibold text-sm text-foreground">Fast food</div>
            <div className="text-[11px] text-muted-foreground mt-1 leading-snug">
              Bold header, pill prices — placeholder until your design is ready.
            </div>
          </button>
        </div>
        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
            className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            {saveMut.isPending ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </ModalBackdrop>
  );
}

// ─── Menu public preview (phone frame) — shared UI in @/components/menu/MenuPreviewContent ──

function MenuPreviewModal({
  menu,
  venueId,
  menuData,
  venueName,
  menuStyle,
  accentColor,
  onClose,
}: {
  menu: MenuDef;
  venueId: string;
  menuData: MenuItem[];
  venueName: string;
  menuStyle: MenuPreviewStyle;
  accentColor: string;
  onClose: () => void;
}) {
  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute top-4 right-5 text-white/60 hover:text-white transition-colors z-10"
      >
        <X className="h-6 w-6" />
      </button>

      <MenuPreviewPhoneShell>
        <MenuPreviewContent
          menu={menu}
          venueId={venueId}
          venueName={venueName}
          menuData={menuData}
          menuStyle={menuStyle}
          accentColor={accentColor}
          designConfig={menu.designConfig ?? null}
        />
      </MenuPreviewPhoneShell>
    </div>,
    document.body,
  );
}

// ─── Add / Edit ingredient modal ──────────────────────────────────────────────

function AddIngredientModal({
  onClose,
  onAdd,
  initial,
  inventory = [],
  subRecipes = [],
}: {
  onClose: () => void;
  onAdd: (ing: Ingredient) => void;
  initial?: Ingredient;
  inventory?: InventoryItem[];
  subRecipes?: SubRecipe[];
}) {
  const editing = !!initial;
  // source: '__manual__' | 'inv:<id>' | 'sub:<id>'
  const [source, setSource] = useState<string>(() => {
    if (initial?.inventoryItemId) return `inv:${initial.inventoryItemId}`;
    return '__manual__';
  });
  const [name,     setName]     = useState(initial?.name     ?? '');
  const [quantity, setQuantity] = useState(initial ? String(initial.quantity) : '');
  const [unit,     setUnit]     = useState(initial?.unit     ?? 'g');
  const [cost,     setCost]     = useState(initial ? (initial.costPence / 100).toFixed(2) : '');

  const linkedInv = source.startsWith('inv:')
    ? inventory.find((i) => i.id === source.slice(4)) ?? null
    : null;
  const linkedSub = source.startsWith('sub:')
    ? subRecipes.find((s) => s.id === source.slice(4)) ?? null
    : null;
  const isAutoCosted = !!(linkedInv || linkedSub);

  function recalcFromInv(qty: string, u: string, inv: InventoryItem) {
    const q = parseFloat(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setCost((inventoryLineCostPence(q, u, inv.unit, inv.unitCostPence) / 100).toFixed(2));
  }

  function recalcFromSub(qty: string, sr: SubRecipe) {
    const q = parseFloat(qty);
    if (!Number.isFinite(q) || q <= 0) return;
    setCost((subRecipeLineCostPence(sr, q) / 100).toFixed(2));
  }

  function handleSourceChange(val: string) {
    setSource(val);
    if (val === '__manual__') return;
    if (val.startsWith('inv:')) {
      const inv = inventory.find((i) => i.id === val.slice(4));
      if (inv) {
        setName(inv.name);
        setUnit(inv.unit);
        recalcFromInv(quantity || '1', inv.unit, inv);
      }
    } else if (val.startsWith('sub:')) {
      const sr = subRecipes.find((s) => s.id === val.slice(4));
      if (sr) {
        setName(sr.name);
        setUnit(sr.yieldUnit || 'portion');
        recalcFromSub(quantity || '1', sr);
      }
    }
  }

  function handleQtyChange(val: string) {
    setQuantity(val);
    if (linkedInv) recalcFromInv(val, unit, linkedInv);
    else if (linkedSub) recalcFromSub(val, linkedSub);
  }

  function handleUnitChange(val: string) {
    setUnit(val);
    if (linkedInv) recalcFromInv(quantity, val, linkedInv);
    // unit change doesn't affect sub-recipe cost
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !quantity) return;
    let finalCost = Math.round(parseFloat(cost || '0') * 100);
    if (linkedInv) {
      finalCost = inventoryLineCostPence(parseFloat(quantity), unit, linkedInv.unit, linkedInv.unitCostPence);
    } else if (linkedSub) {
      finalCost = subRecipeLineCostPence(linkedSub, parseFloat(quantity));
    }
    onAdd({
      id:              initial?.id ?? `ing-${Date.now()}`,
      name:            name.trim(),
      quantity:        parseFloat(quantity),
      unit,
      costPence:       finalCost,
      inventoryItemId: linkedInv?.id ?? null,
    });
    onClose();
  }

  const canSubmit = !!name.trim() && !!quantity && (isAutoCosted ? true : !!cost);
  const hasSourceOptions = inventory.length > 0 || subRecipes.length > 0;

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-sm mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-base font-semibold text-foreground">{editing ? 'Edit ingredient' : 'Add ingredient'}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="px-6 py-5 space-y-4">
          {/* Source picker — inventory items + sub-recipes */}
          {hasSourceOptions && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">
                Source <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Select value={source} onValueChange={handleSourceChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Manual entry" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__manual__">Manual entry</SelectItem>
                  {inventory.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Inventory</div>
                      {inventory.map((inv) => (
                        <SelectItem key={inv.id} value={`inv:${inv.id}`}>
                          {inv.name} <span className="text-muted-foreground">· {inv.unit}</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                  {subRecipes.length > 0 && (
                    <>
                      <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Sub-Recipes</div>
                      {subRecipes.map((sr) => (
                        <SelectItem key={sr.id} value={`sub:${sr.id}`}>
                          {sr.name} <span className="text-muted-foreground">· yields {sr.yieldQty} {sr.yieldUnit}</span>
                        </SelectItem>
                      ))}
                    </>
                  )}
                </SelectContent>
              </Select>
              {linkedInv && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Linked to inventory · cost auto-calculates
                </p>
              )}
              {linkedSub && (
                <p className="text-xs text-emerald-600 flex items-center gap-1">
                  <Package className="h-3 w-3" />
                  Sub-recipe · cost auto-calculates from recipe yield
                </p>
              )}
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">Ingredient name</label>
            <Input autoFocus={!isAutoCosted} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Unsalted butter" className="h-9 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Quantity</label>
              <Input type="number" min="0" step="any" value={quantity} onChange={(e) => handleQtyChange(e.target.value)} placeholder="0" className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Unit</label>
              <Select value={unit} onValueChange={handleUnitChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground">
              Cost (£)
              {isAutoCosted && <span className="ml-2 text-xs font-normal text-emerald-600">auto-calculated</span>}
            </label>
            <Input
              type="number" min="0" step="0.01"
              value={cost}
              readOnly={isAutoCosted}
              onChange={(e) => { if (!isAutoCosted) setCost(e.target.value); }}
              placeholder="0.00"
              className={cn('h-9 text-sm', isAutoCosted && 'bg-muted/50 text-muted-foreground cursor-not-allowed')}
            />
          </div>
          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors">Cancel</button>
            <button type="submit" disabled={!canSubmit} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">{editing ? 'Save' : 'Add'}</button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ─── Product detail view (Level 4) ───────────────────────────────────────────

function ProductDetailView({
  item,
  menuName,
  category,
  venueId,
  onBack,
  onProductUpdated,
  onProductDeleted,
}: {
  item: MenuItem;
  menuName: string;
  category: string;
  venueId: string;
  onBack: () => void;
  onProductUpdated: (updated: MenuItem) => void;
  onProductDeleted?: () => void;
}) {
  const qc = useQueryClient();
  const qKey = ['ingredients', item.id];

  // Load ingredients from DB; fall back to mock data while loading
  const { data: dbIngredients = [], isLoading } = useQuery<Ingredient[]>({
    queryKey: qKey,
    queryFn: async () => {
      const res = await ingredientsApi.list(item.id);
      // Map DB field names to our Ingredient interface
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return res.data.data.map((r: any) => ({
        id:              r.id,
        name:            r.name,
        quantity:        parseFloat(r.quantity),
        unit:            r.unit,
        costPence:       r.costPence ?? r.cost_pence,
        inventoryItemId: r.inventoryItemId ?? r.inventory_item_id ?? null,
      }));
    },
  });

  // Load venue inventory for auto-cost calculation
  const { data: inventory = [] } = useQuery<InventoryItem[]>({
    queryKey: ['inventory-items', venueId],
    queryFn: async () => {
      const res = await inventoryApi.list(venueId);
      return (res.data.data ?? []) as InventoryItem[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });

  // Load sub-recipes so they appear as source options alongside inventory
  const { data: subRecipes = [] } = useQuery<SubRecipe[]>({
    queryKey: ['sub-recipes', venueId],
    queryFn: async () => {
      const res = await recipeApi.listSubRecipes(venueId);
      return (res.data.data ?? []) as SubRecipe[];
    },
    enabled: !!venueId,
    staleTime: 60_000,
  });

  // Use mock data as seed if DB is empty and we have mocks (first-time view)
  const mockSeed = MOCK_INGREDIENTS[item.name] ?? [];

  // On first ever open for a product with no DB ingredients, auto-seed from mocks into the DB
  const hasSeededRef = useRef(false);
  useEffect(() => {
    if (hasSeededRef.current) return;
    if (isLoading) return;
    if (dbIngredients.length > 0) return;
    if (!mockSeed.length) return;

    hasSeededRef.current = true;
    (async () => {
      try {
        for (const ing of mockSeed) {
          // Create real DB rows with fresh IDs; keep quantities / units / costs the same
          // eslint-disable-next-line no-await-in-loop
          await ingredientsApi.create(item.id, {
            name: ing.name,
            quantity: ing.quantity,
            unit: ing.unit,
            costPence: ing.costPence,
          });
        }
        await qc.invalidateQueries({ queryKey: qKey });
      } catch {
        // If seeding fails, we just fall back to non-persisted mocks below
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, dbIngredients.length, mockSeed.length, item.id]);

  // Prefer real DB ingredients; while seeding or on failure, still show mocks so the table isn't empty
  const ingredients: Ingredient[] = dbIngredients.length > 0 ? dbIngredients
    : mockSeed;

  const [showAdd,           setShowAdd]           = useState(false);
  const [showProdSettings,  setShowProdSettings]  = useState(false);
  const [showMasterModal,   setShowMasterModal]   = useState(false);
  const [showEditProduct,   setShowEditProduct]   = useState(false);
  const [showDeleteProduct, setShowDeleteProduct] = useState(false);
  const [editingIngredient, setEditingIngredient] = useState<Ingredient | null>(null);
  const [editCell, setEditCell] = useState<{ id: string; field: 'name' | 'quantity' | 'unit' | 'cost' } | null>(null);
  const [editVal,  setEditVal]  = useState('');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mutations
  const addMut = useMutation({
    mutationFn: (data: Omit<Ingredient, 'id'>) =>
      ingredientsApi.create(item.id, { ...data, costPence: data.costPence }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError:   () => toast.error('Failed to save ingredient'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: Ingredient) =>
      ingredientsApi.update(item.id, id, { ...data, costPence: data.costPence }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qKey }),
    onError:   () => toast.error('Failed to update ingredient'),
  });

  const deleteMut = useMutation({
    mutationFn: (ingId: string) => ingredientsApi.remove(item.id, ingId),
    onMutate: async (ingId) => {
      await qc.cancelQueries({ queryKey: qKey });
      const prev = qc.getQueryData<Ingredient[]>(qKey);
      qc.setQueryData<Ingredient[]>(qKey, (old) => old?.filter((i) => i.id !== ingId) ?? []);
      return { prev };
    },
    onError: (_e, _v, ctx) => { qc.setQueryData(qKey, ctx?.prev); toast.error('Failed to delete ingredient'); },
    onSettled: () => qc.invalidateQueries({ queryKey: qKey }),
  });

  function calcAutoIfLinked(ing: Ingredient, newQty: number, newUnit: string): number {
    if (!ing.inventoryItemId) return ing.costPence;
    const invItem = inventory.find((i) => i.id === ing.inventoryItemId);
    if (!invItem) return ing.costPence;
    return inventoryLineCostPence(newQty, newUnit, invItem.unit, invItem.unitCostPence);
  }

  function commitEdit() {
    if (!editCell) return;
    const ing = ingredients.find((i) => i.id === editCell.id);
    if (!ing) { setEditCell(null); return; }
    const { field } = editCell;
    let updated: Ingredient;
    if (field === 'name') {
      updated = { ...ing, name: editVal.trim() || ing.name };
    } else if (field === 'quantity') {
      const newQty = parseFloat(editVal) || ing.quantity;
      updated = { ...ing, quantity: newQty, costPence: calcAutoIfLinked(ing, newQty, ing.unit) };
    } else if (field === 'unit') {
      const newUnit = editVal || ing.unit;
      updated = { ...ing, unit: newUnit, costPence: calcAutoIfLinked(ing, ing.quantity, newUnit) };
    } else { // 'cost' — only reachable when not inventory-linked
      updated = { ...ing, costPence: Math.round((parseFloat(editVal) || 0) * 100) };
    }
    setEditCell(null);
    // Debounce to avoid firing on every keystroke
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => updateMut.mutate(updated!), 600);
  }

  // Live metrics
  const foodCost    = ingredients.reduce((s, i) => s + i.costPence, 0);
  const sellPrice   = item.currentPrice;
  const grossProfit = sellPrice - foodCost;
  const foodCostPct = sellPrice > 0 ? (foodCost / sellPrice) * 100 : 0;
  const margin      = sellPrice > 0 ? (grossProfit / sellPrice) * 100 : 0;

  const metrics = [
    { label: 'Selling price', value: formatPence(sellPrice),                                        sub: 'current price' },
    { label: 'Food cost',     value: foodCost > 0 ? formatPence(foodCost) : '—',                   sub: 'total ingredients' },
    { label: 'Food cost %',   value: foodCost > 0 ? `${foodCostPct.toFixed(1)}%` : '—',            sub: 'of selling price' },
    { label: 'Gross margin',  value: foodCost > 0 ? `${margin.toFixed(1)}%` : '—',                 sub: foodCost > 0 ? `${formatPence(Math.max(0, grossProfit))} profit` : '' },
  ];

  function InlineCell({ id, field, display, value, inputType = 'text', isSelect = false }: {
    id: string; field: 'name' | 'quantity' | 'unit' | 'cost';
    display: string; value: string; inputType?: string; isSelect?: boolean;
  }) {
    const active = editCell?.id === id && editCell?.field === field;
    if (active && isSelect) {
      return (
        <Select value={editVal} onValueChange={(v) => {
          setEditVal(v); setEditCell(null);
          const ing = ingredients.find((i) => i.id === id);
          if (ing) updateMut.mutate({ ...ing, unit: v, costPence: calcAutoIfLinked(ing, ing.quantity, v) });
        }}>
          <SelectTrigger className="h-7 w-20 text-xs border-primary"><SelectValue /></SelectTrigger>
          <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
        </Select>
      );
    }
    if (active) {
      return (
        <input autoFocus type={inputType} value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => { if (e.key === 'Enter') commitEdit(); if (e.key === 'Escape') setEditCell(null); }}
          className="h-7 px-2 text-sm border border-primary rounded bg-background text-foreground w-full text-right focus:outline-none"
        />
      );
    }
    return (
      <span onClick={() => { setEditCell({ id, field }); setEditVal(value); }}
        className="cursor-text hover:bg-secondary/60 rounded px-1 py-0.5 transition-colors select-none" title="Click to edit">
        {display}
      </span>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-8 pt-6 pb-0 text-sm text-muted-foreground flex-wrap">
        <button onClick={() => {}} className="hover:text-foreground transition-colors">Menus</button>
        <span className="text-muted-foreground/30">/</span>
        <button onClick={() => {}} className="hover:text-foreground transition-colors">{menuName}</button>
        <span className="text-muted-foreground/30">/</span>
        <button onClick={onBack} className="hover:text-foreground transition-colors">{category}</button>
        <span className="text-muted-foreground/30">/</span>
        <span className="text-foreground">{item.name}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between px-8 pt-5 pb-5 border-b border-border">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-[22px] font-medium text-foreground tracking-tight">{item.name}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">{category}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowProdSettings(true)} className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-secondary transition-colors" title="Settings"><Wrench className="h-4 w-4" /></button>
          <button onClick={() => setShowEditProduct(true)} className="text-muted-foreground hover:text-foreground p-2 rounded-md hover:bg-secondary transition-colors" title="Edit"><Pencil className="h-4 w-4" /></button>
          <button
            type="button"
            onClick={() => setShowDeleteProduct(true)}
            className="text-muted-foreground hover:text-red-500 p-2 rounded-md hover:bg-secondary transition-colors"
            title="Delete product"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Live metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 border-b border-border">
          {metrics.map((m, i) => (
            <div key={m.label} className={cn('px-8 py-5', i < metrics.length - 1 && 'border-r border-border')}>
              <p className="text-[10px] text-muted-foreground uppercase tracking-widest font-semibold">{m.label}</p>
              <p className="text-2xl font-semibold text-foreground mt-1.5 tabular-nums">{m.value}</p>
              {m.sub && <p className="text-xs text-muted-foreground mt-0.5">{m.sub}</p>}
            </div>
          ))}
        </div>

        {/* Ingredients */}
        <div className="px-8 pt-6 pb-3 flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-medium text-foreground">Recipe &amp; Ingredients</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Click any cell to edit · changes save automatically</p>
          </div>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md px-3 py-1.5 hover:bg-secondary transition-colors">
            <Plus className="h-3.5 w-3.5" />Add ingredient
          </button>
        </div>

        <div className="border-t border-border">
          <div className="flex items-center px-8 py-2.5 bg-secondary/30 border-b border-border text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
            <span className="flex-1">Ingredient</span>
            <span className="w-28 text-right">Quantity</span>
            <span className="w-20 text-right">Unit</span>
            <span className="w-24 text-right">Cost (£)</span>
            <span className="w-16" />
          </div>

          {isLoading ? (
            <div className="px-8 py-10 text-sm text-muted-foreground text-center">Loading ingredients…</div>
          ) : ingredients.length === 0 ? (
            <div className="px-8 py-10 text-sm text-muted-foreground text-center">
              No ingredients yet — click "Add ingredient" to build the recipe.
            </div>
          ) : (
            <>
              {ingredients.map((ing) => {
                const isLinked = !!ing.inventoryItemId;
                return (
                  <div key={ing.id} className="flex items-center px-8 py-3 border-b border-border/50 last:border-0 hover:bg-secondary/10 transition-colors group">
                    <div className="flex-1 text-sm text-foreground min-w-0 flex items-center gap-1.5">
                      {isLinked && (
                        <span title="Linked to inventory — cost auto-calculates">
                          <Package className="h-3 w-3 shrink-0 text-emerald-500" />
                        </span>
                      )}
                      <InlineCell id={ing.id} field="name" display={ing.name} value={ing.name} />
                    </div>
                    <div className="w-28 text-right text-sm font-mono text-muted-foreground tabular-nums">
                      <InlineCell id={ing.id} field="quantity" display={String(ing.quantity)} value={String(ing.quantity)} inputType="number" />
                    </div>
                    <div className="w-20 text-right text-sm text-muted-foreground">
                      <InlineCell id={ing.id} field="unit" display={ing.unit} value={ing.unit} isSelect />
                    </div>
                    <div className="w-24 text-right text-sm font-mono font-medium text-foreground tabular-nums">
                      {isLinked ? (
                        <span className="flex items-center justify-end gap-1">
                          <span className="text-[10px] text-emerald-600 font-normal">auto</span>
                          <span>{`£${(ing.costPence / 100).toFixed(2)}`}</span>
                        </span>
                      ) : (
                        <InlineCell id={ing.id} field="cost" display={`£${(ing.costPence / 100).toFixed(2)}`} value={(ing.costPence / 100).toFixed(2)} inputType="number" />
                      )}
                    </div>
                    <div className="w-16 flex justify-end gap-2">
                      <button onClick={() => setEditingIngredient(ing)}
                        className="text-muted-foreground/30 hover:text-foreground transition-colors opacity-0 group-hover:opacity-100" title="Edit">
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => deleteMut.mutate(ing.id)}
                        className="text-muted-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100" title="Delete">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
              <div className="flex items-center px-8 py-3.5 bg-secondary/20 border-t border-border">
                <span className="flex-1 text-sm font-semibold text-foreground">Total food cost</span>
                <span className="w-28" /><span className="w-20" />
                <span className="w-24 text-right text-sm font-bold font-mono text-foreground tabular-nums">{formatPence(foodCost)}</span>
                <span className="w-16" />
              </div>
            </>
          )}
        </div>
      </div>

      {showAdd && (
        <AddIngredientModal
          inventory={inventory}
          subRecipes={subRecipes}
          onClose={() => setShowAdd(false)}
          onAdd={(ing) => {
            const { id: _id, ...data } = ing;
            addMut.mutate(data);
            setShowAdd(false);
          }}
        />
      )}
      {editingIngredient && (
        <AddIngredientModal
          initial={editingIngredient}
          inventory={inventory}
          subRecipes={subRecipes}
          onClose={() => setEditingIngredient(null)}
          onAdd={(ing) => { updateMut.mutate(ing); setEditingIngredient(null); }}
        />
      )}
      {showProdSettings && (
        <ProductSettingsModal
          item={item}
          venueId={venueId}
          onClose={() => setShowProdSettings(false)}
          onSaved={(updated) => onProductUpdated(updated)}
          onEditMaster={() => { setShowProdSettings(false); setShowMasterModal(true); }}
        />
      )}
      {showMasterModal && (
        <EditMasterProductModal
          item={item}
          venueId={venueId}
          onClose={() => setShowMasterModal(false)}
          onSaved={(updated) => onProductUpdated(updated)}
        />
      )}
      {showEditProduct && (
        <EditProductModal
          item={item}
          venueId={venueId}
          onClose={() => setShowEditProduct(false)}
          onSaved={(updated) => {
            setShowEditProduct(false);
            onProductUpdated(updated);
          }}
        />
      )}
      {showDeleteProduct && (
        <DeleteConfirmModal
          title="Delete product"
          label={item.name}
          detail="This permanently deletes the dish from the database, including its ingredients list and linked recipe in the calculator. Historical POS lines keep a copy of the name."
          onClose={() => setShowDeleteProduct(false)}
          onConfirm={async () => {
            try {
              await menuApi.delete(venueId, item.id);
              await qc.invalidateQueries({ queryKey: ['menu-items', venueId] });
              qc.removeQueries({ queryKey: ['ingredients', item.id] });
              toast.success('Product deleted');
              queueMicrotask(() => onProductDeleted?.());
            } catch (err) {
              toastApiError(err, 'Failed to delete product');
              throw err;
            }
          }}
        />
      )}
    </div>
  );
}

// ─── Add product modal ────────────────────────────────────────────────────────

function AddProductModal({
  category,
  onClose,
  onAdd,
}: {
  category: string;
  onClose: () => void;
  onAdd: (product: MenuItem, ingredients: Ingredient[]) => void;
}) {
  const [name,        setName]        = useState('');
  const [price,       setPrice]       = useState('');
  const [description, setDescription] = useState('');
  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [showIngForm, setShowIngForm] = useState(false);

  // inline new-ingredient form
  const [ingName,     setIngName]     = useState('');
  const [ingQty,      setIngQty]      = useState('');
  const [ingUnit,     setIngUnit]     = useState('g');
  const [ingCost,     setIngCost]     = useState('');

  function addIngredient() {
    if (!ingName.trim() || !ingQty || !ingCost) return;
    setIngredients((prev) => [
      ...prev,
      {
        id:        `ing-${Date.now()}`,
        name:      ingName.trim(),
        quantity:  parseFloat(ingQty),
        unit:      ingUnit,
        costPence: Math.round(parseFloat(ingCost) * 100),
      },
    ]);
    setIngName(''); setIngQty(''); setIngUnit('g'); setIngCost('');
    setShowIngForm(false);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !price) return;
    const pricePence = Math.round(parseFloat(price) * 100);
    const product: MenuItem = {
      id:                      `prod-${Date.now()}`,
      name:                    name.trim(),
      category,
      description:             description.trim() || null,
      basePrice:               pricePence,
      currentPrice:            pricePence,
      minPrice:                pricePence,
      maxPrice:                pricePence,
      isDynamicPricingEnabled: false,
    };
    onAdd(product, ingredients);
    onClose();
  }

  const foodCost = ingredients.reduce((s, i) => s + i.costPence, 0);

  return (
    <ModalBackdrop onClose={onClose}>
      <div className="bg-background border border-border rounded-xl shadow-lg w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-foreground">New product</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Category: <span className="font-medium text-foreground">{category}</span></p>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground p-1 rounded-md hover:bg-secondary transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="px-6 py-5 space-y-4 overflow-y-auto flex-1">

            {/* Name */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Product name <span className="text-red-400">*</span></label>
              <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Pan-Seared Duck Breast" className="h-9 text-sm" />
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Description <span className="text-xs font-normal text-muted-foreground">(optional)</span></label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. With cherry jus, dauphinoise potato" className="h-9 text-sm" />
            </div>

            {/* Selling price */}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Selling price (£) <span className="text-red-400">*</span></label>
              <Input type="number" min="0" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" className="h-9 text-sm" />
            </div>

            {/* Ingredients */}
            <div className="space-y-2 pt-1">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-foreground">Ingredients</p>
                  {foodCost > 0 && (
                    <p className="text-xs text-muted-foreground">Food cost: {formatPence(foodCost)}
                      {price && parseFloat(price) > 0 && (
                        <span className="ml-1.5">· {((foodCost / (parseFloat(price) * 100)) * 100).toFixed(1)}% of price</span>
                      )}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowIngForm((v) => !v)}
                  className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-md px-2.5 py-1 hover:bg-secondary transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add
                </button>
              </div>

              {/* Inline ingredient form */}
              {showIngForm && (
                <div className="border border-border rounded-lg p-3 space-y-3 bg-secondary/20">
                  <Input autoFocus value={ingName} onChange={(e) => setIngName(e.target.value)} placeholder="Ingredient name" className="h-8 text-sm" />
                  <div className="grid grid-cols-3 gap-2">
                    <Input type="number" min="0" step="any" value={ingQty} onChange={(e) => setIngQty(e.target.value)} placeholder="Qty" className="h-8 text-sm" />
                    <Select value={ingUnit} onValueChange={setIngUnit}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>{UNITS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}</SelectContent>
                    </Select>
                    <Input type="number" min="0" step="0.01" value={ingCost} onChange={(e) => setIngCost(e.target.value)} placeholder="£ cost" className="h-8 text-sm" />
                  </div>
                  <div className="flex gap-2 justify-end">
                    <button type="button" onClick={() => setShowIngForm(false)} className="text-xs text-muted-foreground hover:text-foreground px-3 py-1 border border-border rounded-md hover:bg-secondary transition-colors">Cancel</button>
                    <button type="button" onClick={addIngredient} disabled={!ingName.trim() || !ingQty || !ingCost} className="text-xs font-medium px-3 py-1 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Add ingredient</button>
                  </div>
                </div>
              )}

              {/* Ingredient list */}
              {ingredients.length > 0 && (
                <div className="border border-border rounded-lg overflow-hidden">
                  <div className="grid grid-cols-[1fr_60px_50px_70px_28px] px-3 py-2 bg-secondary/30 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest border-b border-border">
                    <span>Ingredient</span><span className="text-right">Qty</span><span className="text-right">Unit</span><span className="text-right">Cost</span><span />
                  </div>
                  {ingredients.map((ing) => (
                    <div key={ing.id} className="grid grid-cols-[1fr_60px_50px_70px_28px] px-3 py-2.5 border-b border-border/50 last:border-0 text-sm items-center hover:bg-secondary/10 group">
                      <span className="text-foreground truncate">{ing.name}</span>
                      <span className="text-right font-mono text-muted-foreground">{ing.quantity}</span>
                      <span className="text-right text-muted-foreground">{ing.unit}</span>
                      <span className="text-right font-mono font-medium text-foreground">£{(ing.costPence / 100).toFixed(2)}</span>
                      <div className="flex justify-end">
                        <button type="button" onClick={() => setIngredients((p) => p.filter((i) => i.id !== ing.id))} className="text-muted-foreground/30 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  <div className="grid grid-cols-[1fr_60px_50px_70px_28px] px-3 py-2.5 bg-secondary/20 border-t border-border text-sm font-semibold">
                    <span className="text-foreground">Total</span>
                    <span /><span />
                    <span className="text-right font-mono text-foreground">£{(foodCost / 100).toFixed(2)}</span>
                    <span />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-border shrink-0">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors">Cancel</button>
            <button type="submit" disabled={!name.trim() || !price} className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">Create product</button>
          </div>
        </form>
      </div>
    </ModalBackdrop>
  );
}

// ─── Skeleton helpers ─────────────────────────────────────────────────────────

function Skel({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} />;
}

function MenuListSkeleton() {
  return (
    <div>
      <MenuTableHeader />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center border-b border-border last:border-0">
          <div className="flex-1 py-5 pl-8 pr-6 space-y-2.5 min-w-0">
            <Skel className="h-[14px] w-44" />
            <Skel className="h-3 w-64" />
          </div>
          <div className="w-[200px] py-5 flex items-center justify-center shrink-0">
            <div className="flex justify-center gap-2">
              {[...Array(7)].map((_, k) => <Skel key={k} className="h-[17px] w-[17px] rounded-sm" />)}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function CategoryListSkeleton() {
  return (
    <div>
      <CategoryTableHeader />
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-center border-b border-border px-8 py-[22px]">
          <div className="flex-1 pr-6">
            <Skel className="h-[14px] w-40" />
          </div>
          <div style={{ width: 140 }} className="flex justify-center gap-2.5">
            {[...Array(3)].map((_, k) => <Skel key={k} className="h-[17px] w-[17px] rounded-sm" />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function ProductListSkeleton() {
  return (
    <table className="w-full table-fixed text-sm border-collapse">
      <colgroup>
        <col />
        <col style={{ width: 140 }} />
      </colgroup>
      <thead>
        <tr className="bg-secondary/30 border-b border-border">
          {['Product', 'Controls'].map((h) => (
            <th
              key={h}
              className={cn(
                'py-2.5 px-6 text-[10px] font-semibold text-muted-foreground uppercase tracking-widest',
                h === 'Product' ? 'pl-8 text-left' : 'text-center',
              )}
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {[...Array(5)].map((_, i) => (
          <tr key={i} className="border-b border-border">
            <td className="py-4 pl-8 pr-6"><Skel className="h-[14px] w-36" /></td>
            <td className="py-4 px-6">
              <div className="flex justify-center gap-3">
                {[...Array(3)].map((_, k) => <Skel key={k} className="h-4 w-4 rounded-sm" />)}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function Dashboard() {
  const navigate    = useNavigate();
  const qc          = useQueryClient();
  const { selectedVenueId, venues, setSelectedVenue, setVenues } = useVenueStore();

  const [activeMenu,      setActiveMenu]      = useState<MenuDef | null>(null);
  const [activeCategory,  setActiveCategory]  = useState<DbCategory | null>(null);
  const [activeProduct,   setActiveProduct]   = useState<MenuItem | null>(null);
  const [showNewMenu,     setShowNewMenu]     = useState(false);
  const [showNewProduct,  setShowNewProduct]  = useState(false);
  const [renamingMenu,    setRenamingMenu]    = useState<MenuDef | null>(null);
  const [deletingMenu,    setDeletingMenu]    = useState<MenuDef | null>(null);
  const [settingsMenu,    setSettingsMenu]    = useState<MenuDef | null>(null);
  const [designingMenu,   setDesigningMenu]   = useState<MenuDef | null>(null);
  const [previewMenu,     setPreviewMenu]     = useState<MenuDef | null>(null);
  const [showMenuStyleModal, setShowMenuStyleModal] = useState(false);
  const [showNewCategory, setShowNewCategory] = useState(false);

  // ── Venues ──────────────────────────────────────────────────────────────────
  const { data: venuesData } = useQuery<Venue[]>({
    queryKey: ['venues'],
    queryFn:  () => venueApi.list().then((r) => r.data.data),
  });

  useEffect(() => {
    if (!venuesData) return;
    setVenues(venuesData);
    if (venuesData.length === 0) {
      setSelectedVenue(null);
      return;
    }
    if (!selectedVenueId || !venuesData.some((v) => v.id === selectedVenueId)) {
      setSelectedVenue(venuesData[0].id);
    }
  }, [venuesData, selectedVenueId, setVenues, setSelectedVenue]);

  // ── Menus from DB ─────────────────────────────────────────────────────────
  const { data: menus = [], isLoading: menusLoading, isFetching: menusFetching } = useQuery<MenuDef[]>({
    queryKey: ['menus', selectedVenueId],
    queryFn:  () => menusApi.list(selectedVenueId!).then((r) => r.data.data),
    enabled:  !!selectedVenueId,
    staleTime: 0,
  });

  // ── Categories from DB (per active menu) ─────────────────────────────────
  const { data: dbCategories = [], isLoading: catsLoading, isFetching: catsFetching } = useQuery<DbCategory[]>({
    queryKey: ['categories', activeMenu?.id],
    queryFn:  () => categoriesApi.list(selectedVenueId!, activeMenu!.id).then((r) => r.data.data),
    enabled:  !!activeMenu && !!selectedVenueId,
    staleTime: 0,
  });

  // ── Menu items (products) from DB ─────────────────────────────────────────
  const { data: menuData = [], isLoading: itemsLoading, isFetching: itemsFetching } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', selectedVenueId],
    queryFn:  () => menuApi.list(selectedVenueId!).then((r) => r.data.data),
    enabled:  !!selectedVenueId,
    staleTime: 0,
  });

  // Show skeleton on first load OR whenever we're actively fetching fresh data
  const showMenusSkeleton    = menusLoading  || (menusFetching  && menus.length === 0);
  const showCatsSkeleton     = catsLoading   || catsFetching;
  const showProductsSkeleton = itemsLoading  || (itemsFetching  && menuData.length === 0);

  const activeVenue = useMemo(() => venues.find((v) => v.id === selectedVenueId), [venues, selectedVenueId]);
  const previewMenuStyle: MenuPreviewStyle =
    activeVenue?.publicMenuStyle === 'fast_food' ? 'fast_food' : 'gourmet';
  const previewAccent =
    typeof activeVenue?.brandColor === 'string' && /^#[0-9A-Fa-f]{6}$/i.test(activeVenue.brandColor)
      ? activeVenue.brandColor
      : '#6366f1';

  // ── Products visible in the active category view ──────────────────────────
  function categoryItems(cat: DbCategory): MenuItem[] {
    return menuData.filter((i) =>
      (i.categoryId && i.categoryId === cat.id) ||
      (!i.categoryId && i.category === cat.name)
    );
  }

  const activeItemsAll = activeCategory ? categoryItems(activeCategory) : [];
  const activeItemsVisible = activeItemsAll.filter((i) => !i.intelligentlyHidden);
  const activeItemsStockHidden = activeItemsAll.filter((i) => i.intelligentlyHidden);

  // ── Menu CRUD ─────────────────────────────────────────────────────────────
  function handleCreateMenu(name: string, description: string) {
    if (!selectedVenueId) return;
    menusApi.create(selectedVenueId, { name, description })
      .then(() => qc.invalidateQueries({ queryKey: ['menus', selectedVenueId] }))
      .catch(() => toast.error('Failed to create menu'));
  }

  function handleRenameMenu(menu: MenuDef, name: string, description: string) {
    if (!selectedVenueId) return;
    menusApi.update(selectedVenueId, menu.id, { name, description })
      .then(() => {
        qc.invalidateQueries({ queryKey: ['menus', selectedVenueId] });
        if (activeMenu?.id === menu.id) setActiveMenu({ ...menu, name, description });
      })
      .catch(() => toast.error('Failed to rename menu'));
    setRenamingMenu(null);
  }

  async function handleDeleteMenu(menu: MenuDef) {
    if (!selectedVenueId) return;
    try {
      await menusApi.remove(selectedVenueId, menu.id);
      qc.invalidateQueries({ queryKey: ['menus', selectedVenueId] });
      qc.invalidateQueries({ queryKey: ['categories', menu.id] });
      if (activeMenu?.id === menu.id) {
        setActiveMenu(null);
        setActiveCategory(null);
      }
      toast.success('Menu deleted');
    } catch {
      toast.error('Failed to delete menu');
      throw new Error('delete failed');
    }
  }

  // ── Category CRUD ─────────────────────────────────────────────────────────
  function handleCreateCategory(name: string) {
    if (!selectedVenueId || !activeMenu) return;
    categoriesApi.create(selectedVenueId, activeMenu.id, { name })
      .then(() => qc.invalidateQueries({ queryKey: ['categories', activeMenu.id] }))
      .catch(() => toast.error('Failed to create category'));
    setShowNewCategory(false);
  }

  function handleRenameCategory(cat: DbCategory, name: string) {
    if (!selectedVenueId || !activeMenu) return;
    categoriesApi.update(selectedVenueId, activeMenu.id, cat.id, { name })
      .then(() => qc.invalidateQueries({ queryKey: ['categories', activeMenu.id] }))
      .catch(() => toast.error('Failed to rename category'));
  }

  async function handleDeleteCategory(cat: DbCategory) {
    if (!selectedVenueId || !activeMenu) return;
    try {
      await categoriesApi.remove(selectedVenueId, activeMenu.id, cat.id);
      qc.invalidateQueries({ queryKey: ['categories', activeMenu.id] });
      qc.invalidateQueries({ queryKey: ['menu-items', selectedVenueId] });
      if (activeCategory?.id === cat.id) setActiveCategory(null);
      toast.success('Category deleted');
    } catch (err) {
      toastApiError(err, 'Failed to delete category');
      throw err;
    }
  }

  // ── Product CRUD ──────────────────────────────────────────────────────────
  async function handleCreateProduct(product: Omit<MenuItem, 'id' | 'currentPrice' | 'minPrice' | 'maxPrice'>, ingredients: Ingredient[]) {
    if (!selectedVenueId || !activeCategory) return;
    try {
      const res = await menuApi.create(selectedVenueId, {
        name:                    product.name,
        category:                activeCategory.name,
        categoryId:              activeCategory.id,
        basePrice:               product.basePrice,
        description:             product.description ?? '',
        isDynamicPricingEnabled: false,
      });
      const newItem = res.data.data;
      for (const ing of ingredients) {
        const { id: _id, ...data } = ing;
        await ingredientsApi.create(newItem.id, data);
      }
      qc.invalidateQueries({ queryKey: ['menu-items', selectedVenueId] });
    } catch {
      toast.error('Failed to create product');
    }
    setShowNewProduct(false);
  }

  // ── Empty state ────────────────────────────────────────────────────────────
  if (!selectedVenueId && venues.length === 0) {
    return (
      <AppLayout>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center space-y-4">
            <h1 className="text-2xl font-semibold">Welcome to PricePulse</h1>
            <p className="text-muted-foreground max-w-sm text-sm">
              Add your first venue to get started with AI-powered dynamic pricing.
            </p>
            <Button onClick={() => navigate('/venues/new')} size="lg" className="mt-2">
              Add Your First Venue
            </Button>
          </div>
        </div>
      </AppLayout>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <AppLayout>
      <div className="flex min-h-0 h-full flex-col bg-background">

        {/* ── Top toolbar ── */}
        <div className="border-b border-border px-6 h-14 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowMenuStyleModal(true)}
            disabled={!selectedVenueId}
            title="Guest menu & QR appearance"
            className="inline-flex items-center gap-2 h-8 px-3 text-xs font-medium rounded-md border border-border bg-background hover:bg-secondary text-foreground transition-colors disabled:opacity-40 disabled:pointer-events-none"
          >
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            Menu look
          </button>
        </div>

        {/* ── Main content ── */}
        <div className="min-h-0 flex-1 overflow-y-auto">

          {activeMenu === null ? (
            /* ════════════════════════════════════
               VIEW 1 — Menus list
            ════════════════════════════════════ */
            <div key="view-menus" className="page-enter">
              {/* Page heading */}
              <div className="flex items-center justify-between px-8 pt-10 pb-6 border-b border-border">
                <div>
                  <h1 className="text-2xl font-medium text-foreground tracking-tight">Menus</h1>
                </div>
                <button
                  onClick={() => setShowNewMenu(true)}
                  className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Menu rows */}
              {showMenusSkeleton ? (
                <MenuListSkeleton />
              ) : (
                <div>
                  <MenuTableHeader />
                  {menus.map((menu) => (
                    <MenuRow
                      key={menu.id}
                      menu={menu}
                      onView={() => setActiveMenu(menu)}
                      onPreview={() => setPreviewMenu(menu)}
                      onQr={() => {
                        if (selectedVenueId) {
                          navigate(`/venues/${selectedVenueId}/integrations`);
                        } else {
                          navigate('/');
                        }
                      }}
                      onSettings={() => setSettingsMenu(menu)}
                      onRename={() => setRenamingMenu(menu)}
                      onDelete={() => setDeletingMenu(menu)}
                      onDesign={() => setDesigningMenu(menu)}
                    />
                  ))}
                </div>
              )}
            </div>

          ) : activeProduct !== null ? (
            /* ════════════════════════════════════
               VIEW 4 — Product detail + ingredients
            ════════════════════════════════════ */
            <div key={`view-detail-${activeProduct.id}`} className="page-enter">
              <ProductDetailView
                item={activeProduct}
                menuName={activeMenu?.name ?? ''}
                category={activeCategory?.name ?? ''}
                venueId={selectedVenueId!}
                onBack={() => setActiveProduct(null)}
                onProductUpdated={(updated) => setActiveProduct(updated)}
                onProductDeleted={() => setActiveProduct(null)}
              />
            </div>

          ) : activeCategory === null ? (
            /* ════════════════════════════════════
               VIEW 2 — Categories within a menu
            ════════════════════════════════════ */
            <div key={`view-cats-${activeMenu.id}`} className="page-enter">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 px-8 pt-6 pb-0 text-sm text-muted-foreground">
                <button onClick={() => setActiveMenu(null)} className="hover:text-foreground transition-colors">
                  Menus
                </button>
                <span className="text-muted-foreground/30">/</span>
                <span className="text-foreground">{activeMenu.name}</span>
              </div>

              {/* Page heading */}
              <div className="flex items-center justify-between px-8 pt-6 pb-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveMenu(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h1 className="text-[22px] font-medium text-foreground tracking-tight">
                    {activeMenu.name}
                  </h1>
                </div>
                <button
                  onClick={() => setShowNewCategory(true)}
                  className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
                  title="Add category"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Category rows */}
              {showCatsSkeleton ? (
                <CategoryListSkeleton />
              ) : dbCategories.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24">
                  <p className="text-sm text-muted-foreground">No categories yet. Add one with +</p>
                </div>
              ) : (
                <div>
                  <CategoryTableHeader />
                  {dbCategories.map((cat) => (
                    <CategoryRow
                      key={cat.id}
                      category={cat.name}
                      items={categoryItems(cat)}
                      onClick={() => setActiveCategory(cat)}
                      onRename={(name) => handleRenameCategory(cat, name)}
                      onDelete={() => handleDeleteCategory(cat)}
                    />
                  ))}
                </div>
              )}
            </div>

          ) : (
            /* ════════════════════════════════════
               VIEW 3 — Products within a category
            ════════════════════════════════════ */
            <div key={`view-prods-${activeCategory.id}`} className="page-enter">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 px-8 pt-6 pb-0 text-sm text-muted-foreground">
                <button onClick={() => setActiveMenu(null)} className="hover:text-foreground transition-colors">
                  Menus
                </button>
                <span className="text-muted-foreground/30">/</span>
                <button onClick={() => setActiveCategory(null)} className="hover:text-foreground transition-colors">
                  {activeMenu.name}
                </button>
                <span className="text-muted-foreground/30">/</span>
                <span className="text-foreground">{activeCategory?.name}</span>
              </div>

              {/* Page heading */}
              <div className="flex items-center justify-between px-8 pt-6 pb-6 border-b border-border">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setActiveCategory(null)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <h1 className="text-[22px] font-medium text-foreground tracking-tight">
                    {activeCategory?.name}
                  </h1>
                </div>
                <button
                  onClick={() => setShowNewProduct(true)}
                  className="flex items-center justify-center w-8 h-8 text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-secondary transition-colors"
                  title="Add product"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>

              {/* Product table */}
              {showProductsSkeleton ? (
                <ProductListSkeleton />
              ) : (
                <ProductTable
                  items={activeItemsVisible}
                  stockHiddenItems={activeItemsStockHidden}
                  onClickItem={(item) => setActiveProduct(item)}
                  venueId={selectedVenueId!}
                  onProductDeleted={(id) => {
                    setActiveProduct((p) => (p?.id === id ? null : p));
                  }}
                />
              )}
            </div>
          )}
        </div>

      </div>

      {/* ── New Menu modal ── */}
      {showNewMenu && (
        <NewMenuModal
          onClose={() => setShowNewMenu(false)}
          onCreate={(name, description) => handleCreateMenu(name, description)}
        />
      )}

      {/* ── New Category modal ── */}
      {showNewCategory && (
        <RenameModal
          title="New category"
          label="Category name"
          current=""
          onClose={() => setShowNewCategory(false)}
          onRename={(name) => handleCreateCategory(name)}
        />
      )}

      {/* ── New Product modal ── */}
      {showNewProduct && activeCategory && (
        <AddProductModal
          category={activeCategory.name}
          onClose={() => setShowNewProduct(false)}
          onAdd={(product, ingredients) => handleCreateProduct(product, ingredients)}
        />
      )}

      {/* ── Rename menu modal ── */}
      {renamingMenu && (
        <RenameModal
          title="Rename menu"
          label="Menu name"
          current={renamingMenu.name}
          currentNote={renamingMenu.description ?? ''}
          onClose={() => setRenamingMenu(null)}
          onRename={(name, description) =>
            handleRenameMenu(renamingMenu, name, description ?? renamingMenu.description ?? '')
          }
        />
      )}

      {/* ── Delete menu modal ── */}
      {deletingMenu && (
        <DeleteConfirmModal
          title="Delete menu"
          label={deletingMenu.name}
          detail="This removes the menu and its categories from the database. Products lose their category link but stay on the venue until you delete them from a category’s product list."
          onClose={() => setDeletingMenu(null)}
          onConfirm={() => handleDeleteMenu(deletingMenu)}
        />
      )}

      {/* ── Menu settings modal ── */}
      {settingsMenu && (
        <MenuSettingsModal
          menu={settingsMenu}
          venueId={selectedVenueId!}
          onClose={() => setSettingsMenu(null)}
        />
      )}

      {/* ── Menu Design Studio ── */}
      {designingMenu && selectedVenueId && (
        <MenuDesignStudio
          venueId={selectedVenueId}
          venueName={venues.find((v) => v.id === selectedVenueId)?.name ?? ''}
          menuStyle={previewMenuStyle}
          menuData={menuData}
          menu={menus.find((m) => m.id === designingMenu.id) ?? designingMenu}
          onClose={() => setDesigningMenu(null)}
        />
      )}

      {/* ── Menu look picker ── */}
      {showMenuStyleModal && selectedVenueId && (
        <MenuStylePickerModal
          venueId={selectedVenueId}
          currentStyle={previewMenuStyle}
          onClose={() => setShowMenuStyleModal(false)}
        />
      )}

      {/* ── Menu public preview (phone frame) ── */}
      {previewMenu && (
        <MenuPreviewModal
          menu={menus.find((m) => m.id === previewMenu.id) ?? previewMenu}
          venueId={selectedVenueId!}
          menuData={menuData}
          venueName={venues.find((v) => v.id === selectedVenueId)?.name ?? ''}
          menuStyle={previewMenuStyle}
          accentColor={previewAccent}
          onClose={() => setPreviewMenu(null)}
        />
      )}

    </AppLayout>
  );
}
