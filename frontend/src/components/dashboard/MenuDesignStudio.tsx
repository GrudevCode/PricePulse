import { useState, useCallback, useRef, type ElementType } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { menusApi } from '@/lib/api';
import {
  X, Save, RotateCcw, Palette, Type, Layout, Square,
  Image, ChevronRight, Check, Sparkles, Eye, Star,
  Layers, Sliders, SunMedium,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MenuDesignConfig {
  bgType: 'solid' | 'gradient' | 'image';
  bgColor: string;
  bgGradientEnd: string;
  bgGradientAngle: number;
  bgImageUrl: string;
  bgImageOverlay: number;
  heroEnabled: boolean;
  heroBgColor: string;
  heroTitle: string;
  heroSubtitle: string;
  heroImageUrl: string;
  accentColor: string;
  headingColor: string;
  bodyColor: string;
  priceColor: string;
  cardBgColor: string;
  cardBorderColor: string;
  categoryBgColor: string;
  categoryTextColor: string;
  fontFamily: string;
  cardStyle: 'flat' | 'shadow' | 'border' | 'glass';
  cardRadius: number;
  layout: 'list' | 'grid' | 'compact';
  categoryStyle: 'pill' | 'underline' | 'banner' | 'minimal';
  showImages: boolean;
  showDescriptions: boolean;
}

export const DEFAULT_DESIGN_CONFIG: MenuDesignConfig = {
  bgType: 'solid',
  bgColor: '#0f0f0f',
  bgGradientEnd: '#1a1a2e',
  bgGradientAngle: 135,
  bgImageUrl: '',
  bgImageOverlay: 40,
  heroEnabled: false,
  heroBgColor: '#1a1a2e',
  heroTitle: '',
  heroSubtitle: '',
  heroImageUrl: '',
  accentColor: '#6366f1',
  headingColor: '#ffffff',
  bodyColor: '#a1a1aa',
  priceColor: '#6366f1',
  cardBgColor: '#1c1c1e',
  cardBorderColor: '#2a2a2a',
  categoryBgColor: '#18181b',
  categoryTextColor: '#ffffff',
  fontFamily: 'Inter',
  cardStyle: 'shadow',
  cardRadius: 12,
  layout: 'list',
  categoryStyle: 'pill',
  showImages: true,
  showDescriptions: true,
};

// ─── Presets ──────────────────────────────────────────────────────────────────

interface Preset {
  name: string;
  emoji: string;
  description: string;
  config: Partial<MenuDesignConfig>;
  preview: { bg: string; accent: string; card: string; text: string };
}

const PRESETS: Preset[] = [
  {
    name: 'Dark Luxe',
    emoji: '✦',
    description: 'Elegant dark tones with gold',
    preview: { bg: '#0d0d0d', accent: '#c9a84c', card: '#1a1a1a', text: '#ffffff' },
    config: {
      bgType: 'solid', bgColor: '#0d0d0d', accentColor: '#c9a84c',
      headingColor: '#ffffff', bodyColor: '#888888', priceColor: '#c9a84c',
      cardBgColor: '#1a1a1a', cardBorderColor: '#2a2a2a', categoryBgColor: '#111111',
      categoryTextColor: '#c9a84c', cardStyle: 'shadow', cardRadius: 14,
      layout: 'list', categoryStyle: 'pill', fontFamily: 'Playfair Display',
    },
  },
  {
    name: 'Midnight Gradient',
    emoji: '◈',
    description: 'Deep blue gradient, purple glow',
    preview: { bg: '#0f0c29', accent: '#818cf8', card: '#1e1b4b', text: '#e0e7ff' },
    config: {
      bgType: 'gradient', bgColor: '#0f0c29', bgGradientEnd: '#302b63', bgGradientAngle: 135,
      accentColor: '#818cf8', headingColor: '#e0e7ff', bodyColor: '#94a3b8',
      priceColor: '#a5b4fc', cardBgColor: '#1e1b4b', cardBorderColor: '#312e81',
      categoryBgColor: '#1e1b4b', categoryTextColor: '#c7d2fe', cardStyle: 'glass',
      cardRadius: 16, layout: 'list', categoryStyle: 'underline', fontFamily: 'Inter',
    },
  },
  {
    name: 'Fresh & Clean',
    emoji: '○',
    description: 'Bright minimal with emerald',
    preview: { bg: '#ffffff', accent: '#10b981', card: '#f9fafb', text: '#111827' },
    config: {
      bgType: 'solid', bgColor: '#ffffff', accentColor: '#10b981',
      headingColor: '#111827', bodyColor: '#6b7280', priceColor: '#10b981',
      cardBgColor: '#f9fafb', cardBorderColor: '#e5e7eb', categoryBgColor: '#f0fdf4',
      categoryTextColor: '#065f46', cardStyle: 'border', cardRadius: 10,
      layout: 'grid', categoryStyle: 'banner', fontFamily: 'Inter',
    },
  },
  {
    name: 'Warm Bistro',
    emoji: '◉',
    description: 'Earthy tones, cozy atmosphere',
    preview: { bg: '#1c1007', accent: '#f59e0b', card: '#2a1f0e', text: '#fef3c7' },
    config: {
      bgType: 'gradient', bgColor: '#1c1007', bgGradientEnd: '#2d1b00', bgGradientAngle: 160,
      accentColor: '#f59e0b', headingColor: '#fef3c7', bodyColor: '#d97706',
      priceColor: '#fbbf24', cardBgColor: '#2a1f0e', cardBorderColor: '#3d2e16',
      categoryBgColor: '#1a1200', categoryTextColor: '#fde68a', cardStyle: 'shadow',
      cardRadius: 8, layout: 'list', categoryStyle: 'pill', fontFamily: 'Merriweather',
    },
  },
  {
    name: 'Bold Urban',
    emoji: '◆',
    description: 'High contrast, vivid energy',
    preview: { bg: '#09090b', accent: '#f97316', card: '#18181b', text: '#ffffff' },
    config: {
      bgType: 'solid', bgColor: '#09090b', accentColor: '#f97316',
      headingColor: '#ffffff', bodyColor: '#71717a', priceColor: '#fb923c',
      cardBgColor: '#18181b', cardBorderColor: '#27272a', categoryBgColor: '#18181b',
      categoryTextColor: '#f97316', cardStyle: 'border', cardRadius: 6,
      layout: 'compact', categoryStyle: 'underline', fontFamily: 'Space Grotesk',
    },
  },
  {
    name: 'Rose Petal',
    emoji: '◇',
    description: 'Romantic blush with rose gold',
    preview: { bg: '#fff1f2', accent: '#f43f5e', card: '#ffffff', text: '#881337' },
    config: {
      bgType: 'solid', bgColor: '#fff1f2', accentColor: '#f43f5e',
      headingColor: '#881337', bodyColor: '#9f1239', priceColor: '#e11d48',
      cardBgColor: '#ffffff', cardBorderColor: '#fecdd3', categoryBgColor: '#fff1f2',
      categoryTextColor: '#881337', cardStyle: 'shadow', cardRadius: 20,
      layout: 'grid', categoryStyle: 'pill', fontFamily: 'Inter',
    },
  },
];

const FONT_OPTIONS = [
  'Inter', 'Playfair Display', 'Merriweather', 'Space Grotesk',
  'DM Sans', 'Montserrat', 'Lato', 'Cormorant Garamond',
];

// ─── Mock menu data for preview ───────────────────────────────────────────────

const PREVIEW_ITEMS = [
  { name: 'Wagyu Beef Tenderloin', description: 'With truffle jus & seasonal greens', price: '£42', category: 'Mains' },
  { name: 'Burrata & Heritage Tomato', description: 'Aged balsamic, micro herbs', price: '£14', category: 'Starters' },
  { name: 'Wild Mushroom Risotto', description: 'Parmesan foam, crispy sage', price: '£19', category: 'Mains' },
  { name: 'Dark Chocolate Fondant', description: 'Salted caramel, vanilla ice cream', price: '£9', category: 'Desserts' },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function ColorSwatch({
  value, onChange, label,
}: { value: string; onChange: (v: string) => void; label: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] text-zinc-400">{label}</span>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="relative w-8 h-8 rounded-lg border-2 border-white/10 hover:border-white/30 transition-all shadow-inner cursor-pointer overflow-hidden"
        style={{ background: value }}
        title={value}
      >
        <input
          ref={inputRef}
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
        />
      </button>
    </div>
  );
}

function SliderRow({
  label, value, min, max, step = 1, unit = '', onChange,
}: {
  label: string; value: number; min: number; max: number;
  step?: number; unit?: string; onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-[11px] text-zinc-400">{label}</span>
        <span className="text-[11px] text-zinc-300 font-mono">{value}{unit}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-500"
        style={{ background: `linear-gradient(to right, #6366f1 0%, #6366f1 ${((value - min) / (max - min)) * 100}%, #27272a ${((value - min) / (max - min)) * 100}%, #27272a 100%)` }}
      />
    </div>
  );
}

function SectionTitle({ icon: Icon, children }: { icon: ElementType; children: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
      <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">{children}</span>
    </div>
  );
}

function OptionGrid<T extends string>({
  options, value, onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-1.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            'py-1.5 px-2 rounded-lg text-[11px] font-medium transition-all border',
            value === opt.value
              ? 'bg-indigo-600/30 border-indigo-500/60 text-indigo-300'
              : 'bg-white/5 border-white/5 text-zinc-400 hover:bg-white/10 hover:border-white/15',
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

// ─── Phone Preview ────────────────────────────────────────────────────────────

function PhonePreview({ config, menuName }: { config: MenuDesignConfig; menuName: string }) {
  const bgStyle: React.CSSProperties =
    config.bgType === 'gradient'
      ? { background: `linear-gradient(${config.bgGradientAngle}deg, ${config.bgColor}, ${config.bgGradientEnd})` }
      : config.bgType === 'image' && config.bgImageUrl
        ? { backgroundImage: `url(${config.bgImageUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }
        : { background: config.bgColor };

  const catGroups = [
    { cat: 'Starters', items: PREVIEW_ITEMS.filter(i => i.category === 'Starters') },
    { cat: 'Mains',    items: PREVIEW_ITEMS.filter(i => i.category === 'Mains') },
    { cat: 'Desserts', items: PREVIEW_ITEMS.filter(i => i.category === 'Desserts') },
  ].filter(g => g.items.length > 0);

  const fontStyle = { fontFamily: config.fontFamily };

  return (
    <div className="relative mx-auto" style={{ width: 260 }}>
      {/* Phone shell */}
      <div className="absolute inset-0 rounded-[36px] bg-gradient-to-b from-zinc-700 to-zinc-800 shadow-2xl pointer-events-none z-10" style={{ boxShadow: '0 0 0 2px #3f3f46, 0 40px 80px rgba(0,0,0,0.7)' }} />

      {/* Notch */}
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-20 h-5 bg-zinc-900 rounded-full z-20 pointer-events-none" />

      {/* Screen content */}
      <div
        className="relative rounded-[32px] overflow-hidden z-0"
        style={{ ...bgStyle, ...fontStyle, minHeight: 520, margin: '4px' }}
      >
        {/* Image overlay */}
        {config.bgType === 'image' && config.bgImageUrl && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(0,0,0,${config.bgImageOverlay / 100})` }} />
        )}

        {/* Hero */}
        {config.heroEnabled && (
          <div
            className="relative px-4 pt-12 pb-6 text-center"
            style={{ background: config.heroBgColor }}
          >
            {config.heroImageUrl && (
              <div className="w-full h-24 mb-3 rounded-xl overflow-hidden">
                <img src={config.heroImageUrl} alt="" className="w-full h-full object-cover" />
              </div>
            )}
            <h1 className="font-bold text-lg leading-tight" style={{ color: config.headingColor }}>
              {config.heroTitle || menuName}
            </h1>
            {config.heroSubtitle && (
              <p className="text-xs mt-1" style={{ color: config.bodyColor }}>{config.heroSubtitle}</p>
            )}
          </div>
        )}

        {/* Menu name header when no hero */}
        {!config.heroEnabled && (
          <div className="px-4 pt-10 pb-3">
            <h1 className="font-bold text-base" style={{ color: config.headingColor }}>{menuName}</h1>
          </div>
        )}

        {/* Content */}
        <div className="px-3 pb-4 relative z-10 space-y-3">
          {catGroups.map(({ cat, items }) => (
            <div key={cat}>
              {/* Category header */}
              {config.categoryStyle === 'pill' && (
                <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider mb-2"
                  style={{ background: config.categoryBgColor, color: config.categoryTextColor }}>
                  {cat}
                </div>
              )}
              {config.categoryStyle === 'underline' && (
                <div className="mb-2 border-b pb-1" style={{ borderColor: config.accentColor }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.categoryTextColor }}>{cat}</span>
                </div>
              )}
              {config.categoryStyle === 'banner' && (
                <div className="w-full py-1 px-2 mb-2 rounded-md text-center"
                  style={{ background: config.categoryBgColor }}>
                  <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: config.categoryTextColor }}>{cat}</span>
                </div>
              )}
              {config.categoryStyle === 'minimal' && (
                <div className="mb-2">
                  <span className="text-[10px] font-semibold" style={{ color: config.bodyColor }}>{cat}</span>
                </div>
              )}

              {/* Items */}
              <div className={cn(
                'gap-1.5',
                config.layout === 'grid' ? 'grid grid-cols-2' : 'flex flex-col',
              )}>
                {items.map((item) => (
                  <div
                    key={item.name}
                    className={cn(
                      'transition-all overflow-hidden',
                      config.layout === 'compact' ? 'flex items-center justify-between py-1.5 px-2' : 'p-2 rounded-lg',
                    )}
                    style={{
                      background: config.layout === 'compact' ? 'transparent' : config.cardBgColor,
                      borderRadius: config.layout === 'compact' ? 0 : config.cardRadius / 2,
                      border: config.cardStyle === 'border' ? `1px solid ${config.cardBorderColor}` : 'none',
                      boxShadow: config.cardStyle === 'shadow' ? '0 2px 8px rgba(0,0,0,0.3)' : 'none',
                      backdropFilter: config.cardStyle === 'glass' ? 'blur(10px)' : 'none',
                    }}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold leading-tight truncate" style={{ color: config.headingColor }}>
                        {item.name}
                      </p>
                      {config.showDescriptions && item.description && config.layout !== 'compact' && (
                        <p className="text-[8px] mt-0.5 leading-tight line-clamp-2" style={{ color: config.bodyColor }}>
                          {item.description}
                        </p>
                      )}
                    </div>
                    <p className="text-[10px] font-bold shrink-0 ml-2" style={{ color: config.priceColor }}>
                      {item.price}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom nav stub */}
        <div className="sticky bottom-0 left-0 right-0 py-2 px-4 flex justify-center gap-4 border-t"
          style={{ background: config.bgColor, borderColor: config.cardBorderColor }}>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.accentColor }} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.bodyColor }} />
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: config.bodyColor }} />
        </div>
      </div>
    </div>
  );
}

// ─── Left panel tabs ──────────────────────────────────────────────────────────

type Tab = 'background' | 'colors' | 'typography' | 'layout';

const TABS: { id: Tab; icon: ElementType; label: string }[] = [
  { id: 'background', icon: SunMedium, label: 'Background' },
  { id: 'colors',     icon: Palette,  label: 'Colors' },
  { id: 'typography', icon: Type,     label: 'Typography' },
  { id: 'layout',     icon: Layout,   label: 'Layout' },
];

// ─── Main Component ───────────────────────────────────────────────────────────

interface MenuDesignStudioProps {
  venueId: string;
  menu: { id: string; name: string; designConfig?: MenuDesignConfig | null };
  onClose: () => void;
}

export function MenuDesignStudio({ venueId, menu, onClose }: MenuDesignStudioProps) {
  const queryClient = useQueryClient();
  const savedConfig = menu.designConfig ?? DEFAULT_DESIGN_CONFIG;
  const [config, setConfig] = useState<MenuDesignConfig>({ ...savedConfig });
  const [tab, setTab] = useState<Tab>('background');
  const [previewMode, setPreviewMode] = useState(false);

  const update = useCallback(<K extends keyof MenuDesignConfig>(key: K, val: MenuDesignConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: val }));
  }, []);

  const applyPreset = useCallback((preset: Preset) => {
    setConfig((prev) => ({ ...prev, ...preset.config }));
  }, []);

  const handleRevert = useCallback(() => {
    setConfig({ ...savedConfig });
    toast.info('Design reverted to saved state');
  }, [savedConfig]);

  const resetToDefault = useCallback(() => {
    setConfig({ ...DEFAULT_DESIGN_CONFIG });
    toast.info('Reset to default design');
  }, []);

  const saveMutation = useMutation({
    mutationFn: () => menusApi.update(venueId, menu.id, { designConfig: config }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['menus', venueId] });
      toast.success('Design saved!');
    },
    onError: () => toast.error('Failed to save design'),
  });

  const isDirty = JSON.stringify(config) !== JSON.stringify(savedConfig);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col" style={{ background: '#0a0a0a' }}>
      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div className="h-14 flex items-center px-4 gap-3 border-b shrink-0"
        style={{ borderColor: '#1e1e1e', background: '#0f0f0f' }}>
        <div className="flex items-center gap-2.5 mr-2">
          <div className="w-7 h-7 rounded-lg bg-indigo-600/20 flex items-center justify-center">
            <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
          </div>
          <div>
            <p className="text-[10px] font-semibold text-zinc-500 uppercase tracking-widest leading-none">Design Studio</p>
            <p className="text-sm font-semibold text-white leading-tight mt-0.5">{menu.name}</p>
          </div>
        </div>

        <div className="flex-1" />

        {/* Preview toggle */}
        <button
          type="button"
          onClick={() => setPreviewMode(v => !v)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border',
            previewMode
              ? 'bg-indigo-600/20 border-indigo-500/40 text-indigo-300'
              : 'bg-white/5 border-white/8 text-zinc-400 hover:text-zinc-200 hover:bg-white/8',
          )}
        >
          <Eye className="h-3.5 w-3.5" />
          Preview
        </button>

        {/* Revert */}
        <button
          type="button"
          onClick={handleRevert}
          disabled={!isDirty}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border border-white/8 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/8 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Revert
        </button>

        {/* Reset */}
        <button
          type="button"
          onClick={resetToDefault}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all border border-white/8 bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/8"
        >
          Reset default
        </button>

        {/* Save */}
        <button
          type="button"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !isDirty}
          className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-semibold transition-all bg-indigo-600 hover:bg-indigo-500 text-white disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-900/40"
        >
          {saveMutation.isPending ? (
            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          ) : (
            <Save className="h-3.5 w-3.5" />
          )}
          Save design
        </button>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          className="ml-1 w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-white/8 transition-all border border-white/5"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* ── Body ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 min-h-0">

        {/* ── Left panel (tool tabs) ──────────────────────────────────────── */}
        {!previewMode && (
          <div className="w-72 shrink-0 flex flex-col border-r" style={{ borderColor: '#1e1e1e', background: '#0c0c0c' }}>
            {/* Tab buttons */}
            <div className="flex border-b shrink-0" style={{ borderColor: '#1e1e1e' }}>
              {TABS.map(({ id, icon: Icon, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={cn(
                    'flex-1 flex flex-col items-center gap-1 py-3 text-[9px] font-bold uppercase tracking-wider transition-all border-b-2',
                    tab === id
                      ? 'text-indigo-400 border-indigo-500 bg-indigo-600/5'
                      : 'text-zinc-600 border-transparent hover:text-zinc-400',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-5">

              {/* ── Background tab ───────────────────────────────────────── */}
              {tab === 'background' && (
                <>
                  <div>
                    <SectionTitle icon={Square}>Background type</SectionTitle>
                    <OptionGrid
                      options={[
                        { value: 'solid', label: 'Solid' },
                        { value: 'gradient', label: 'Gradient' },
                        { value: 'image', label: 'Image URL' },
                      ]}
                      value={config.bgType}
                      onChange={(v) => update('bgType', v)}
                    />
                  </div>

                  <div>
                    <SectionTitle icon={Palette}>Background colour</SectionTitle>
                    <ColorSwatch value={config.bgColor} onChange={(v) => update('bgColor', v)} label="Base colour" />
                    {config.bgType === 'gradient' && (
                      <div className="mt-3 space-y-3">
                        <ColorSwatch value={config.bgGradientEnd} onChange={(v) => update('bgGradientEnd', v)} label="Gradient end" />
                        <SliderRow label="Angle" value={config.bgGradientAngle} min={0} max={360} unit="°"
                          onChange={(v) => update('bgGradientAngle', v)} />
                      </div>
                    )}
                    {config.bgType === 'image' && (
                      <div className="mt-3">
                        <input
                          type="text"
                          placeholder="https://example.com/bg.jpg"
                          value={config.bgImageUrl}
                          onChange={(e) => update('bgImageUrl', e.target.value)}
                          className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-200 px-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/20"
                        />
                        <div className="mt-2">
                          <SliderRow label="Overlay opacity" value={config.bgImageOverlay} min={0} max={100} unit="%"
                            onChange={(v) => update('bgImageOverlay', v)} />
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <SectionTitle icon={Star}>Hero section</SectionTitle>
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-[11px] text-zinc-400">Enable hero</span>
                      <button
                        type="button"
                        onClick={() => update('heroEnabled', !config.heroEnabled)}
                        className={cn(
                          'w-9 h-5 rounded-full transition-all relative',
                          config.heroEnabled ? 'bg-indigo-600' : 'bg-zinc-700',
                        )}
                      >
                        <span className={cn(
                          'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                          config.heroEnabled ? 'left-4' : 'left-0.5',
                        )} />
                      </button>
                    </div>
                    {config.heroEnabled && (
                      <div className="space-y-2.5">
                        <ColorSwatch value={config.heroBgColor} onChange={(v) => update('heroBgColor', v)} label="Hero background" />
                        <div>
                          <span className="text-[11px] text-zinc-400 block mb-1">Title</span>
                          <input type="text" value={config.heroTitle} placeholder="Our Menu"
                            onChange={(e) => update('heroTitle', e.target.value)}
                            className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-200 px-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50" />
                        </div>
                        <div>
                          <span className="text-[11px] text-zinc-400 block mb-1">Subtitle</span>
                          <input type="text" value={config.heroSubtitle} placeholder="Crafted with passion"
                            onChange={(e) => update('heroSubtitle', e.target.value)}
                            className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-200 px-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50" />
                        </div>
                        <div>
                          <span className="text-[11px] text-zinc-400 block mb-1">Hero image URL</span>
                          <input type="text" value={config.heroImageUrl} placeholder="https://..."
                            onChange={(e) => update('heroImageUrl', e.target.value)}
                            className="w-full h-8 rounded-lg bg-white/5 border border-white/10 text-[11px] text-zinc-200 px-2.5 placeholder:text-zinc-600 focus:outline-none focus:border-indigo-500/50" />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── Colors tab ────────────────────────────────────────────── */}
              {tab === 'colors' && (
                <>
                  <div>
                    <SectionTitle icon={Palette}>Brand</SectionTitle>
                    <div className="space-y-2.5">
                      <ColorSwatch value={config.accentColor} onChange={(v) => update('accentColor', v)} label="Accent / primary" />
                      <ColorSwatch value={config.priceColor} onChange={(v) => update('priceColor', v)} label="Price colour" />
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={Type}>Text colours</SectionTitle>
                    <div className="space-y-2.5">
                      <ColorSwatch value={config.headingColor} onChange={(v) => update('headingColor', v)} label="Headings" />
                      <ColorSwatch value={config.bodyColor} onChange={(v) => update('bodyColor', v)} label="Body / description" />
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={Square}>Cards</SectionTitle>
                    <div className="space-y-2.5">
                      <ColorSwatch value={config.cardBgColor} onChange={(v) => update('cardBgColor', v)} label="Card background" />
                      <ColorSwatch value={config.cardBorderColor} onChange={(v) => update('cardBorderColor', v)} label="Card border" />
                    </div>
                  </div>

                  <div>
                    <SectionTitle icon={Layers}>Categories</SectionTitle>
                    <div className="space-y-2.5">
                      <ColorSwatch value={config.categoryBgColor} onChange={(v) => update('categoryBgColor', v)} label="Category background" />
                      <ColorSwatch value={config.categoryTextColor} onChange={(v) => update('categoryTextColor', v)} label="Category text" />
                    </div>
                  </div>
                </>
              )}

              {/* ── Typography tab ────────────────────────────────────────── */}
              {tab === 'typography' && (
                <>
                  <div>
                    <SectionTitle icon={Type}>Font family</SectionTitle>
                    <div className="space-y-1">
                      {FONT_OPTIONS.map((font) => (
                        <button
                          key={font}
                          type="button"
                          onClick={() => update('fontFamily', font)}
                          className={cn(
                            'w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all border',
                            config.fontFamily === font
                              ? 'bg-indigo-600/20 border-indigo-500/40 text-white'
                              : 'bg-white/3 border-transparent text-zinc-400 hover:bg-white/8 hover:text-zinc-200',
                          )}
                          style={{ fontFamily: font }}
                        >
                          <span>{font}</span>
                          {config.fontFamily === font && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* ── Layout tab ────────────────────────────────────────────── */}
              {tab === 'layout' && (
                <>
                  <div>
                    <SectionTitle icon={Layout}>Item layout</SectionTitle>
                    <OptionGrid
                      options={[
                        { value: 'list', label: 'List' },
                        { value: 'grid', label: 'Grid' },
                        { value: 'compact', label: 'Compact' },
                      ]}
                      value={config.layout}
                      onChange={(v) => update('layout', v)}
                    />
                  </div>

                  <div>
                    <SectionTitle icon={Layers}>Category style</SectionTitle>
                    <OptionGrid
                      options={[
                        { value: 'pill', label: 'Pill badge' },
                        { value: 'underline', label: 'Underline' },
                        { value: 'banner', label: 'Banner' },
                        { value: 'minimal', label: 'Minimal' },
                      ]}
                      value={config.categoryStyle}
                      onChange={(v) => update('categoryStyle', v)}
                    />
                  </div>

                  <div>
                    <SectionTitle icon={Square}>Card style</SectionTitle>
                    <OptionGrid
                      options={[
                        { value: 'flat', label: 'Flat' },
                        { value: 'shadow', label: 'Shadow' },
                        { value: 'border', label: 'Border' },
                        { value: 'glass', label: 'Glass' },
                      ]}
                      value={config.cardStyle}
                      onChange={(v) => update('cardStyle', v)}
                    />
                  </div>

                  <div>
                    <SectionTitle icon={Sliders}>Card corner radius</SectionTitle>
                    <SliderRow label="Radius" value={config.cardRadius} min={0} max={32} unit="px"
                      onChange={(v) => update('cardRadius', v)} />
                  </div>

                  <div>
                    <SectionTitle icon={Eye}>Visibility</SectionTitle>
                    <div className="space-y-2.5">
                      {[
                        { key: 'showImages' as const, label: 'Show item images' },
                        { key: 'showDescriptions' as const, label: 'Show descriptions' },
                      ].map(({ key, label }) => (
                        <div key={key} className="flex items-center justify-between">
                          <span className="text-[11px] text-zinc-400">{label}</span>
                          <button
                            type="button"
                            onClick={() => update(key, !config[key])}
                            className={cn(
                              'w-9 h-5 rounded-full transition-all relative',
                              config[key] ? 'bg-indigo-600' : 'bg-zinc-700',
                            )}
                          >
                            <span className={cn(
                              'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all',
                              config[key] ? 'left-4' : 'left-0.5',
                            )} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ── Centre: phone preview ────────────────────────────────────────── */}
        <div className={cn(
          'flex-1 flex items-center justify-center overflow-auto',
          'bg-[radial-gradient(ellipse_at_center,_#1a1a2e_0%,_#0a0a0a_70%)]',
        )}>
          <div className="py-10">
            <PhonePreview config={config} menuName={menu.name} />
          </div>
        </div>

        {/* ── Right panel: presets ─────────────────────────────────────────── */}
        {!previewMode && (
          <div className="w-56 shrink-0 border-l overflow-y-auto" style={{ borderColor: '#1e1e1e', background: '#0c0c0c' }}>
            <div className="p-4">
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="h-3.5 w-3.5 text-indigo-400" />
                <span className="text-[10px] font-bold text-zinc-300 uppercase tracking-widest">Presets</span>
              </div>

              <div className="space-y-2">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    className="w-full text-left rounded-xl overflow-hidden border border-white/5 hover:border-indigo-500/40 transition-all group hover:shadow-lg hover:shadow-indigo-900/20"
                  >
                    {/* Colour swatch strip */}
                    <div className="h-10 flex" style={{ background: preset.preview.bg }}>
                      <div className="flex-1" style={{ background: preset.preview.bg }} />
                      <div className="w-8" style={{ background: preset.preview.card }} />
                      <div className="w-6" style={{ background: preset.preview.accent }} />
                    </div>
                    {/* Label */}
                    <div className="px-2.5 py-2" style={{ background: '#111' }}>
                      <div className="flex items-center gap-1.5">
                        <span className="text-base leading-none">{preset.emoji}</span>
                        <span className="text-[11px] font-semibold text-zinc-200 group-hover:text-white transition-colors">{preset.name}</span>
                      </div>
                      <p className="text-[9px] text-zinc-600 mt-0.5 group-hover:text-zinc-500 transition-colors">{preset.description}</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Current config colour chips */}
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <Palette className="h-3.5 w-3.5 text-zinc-600" />
                  <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Current palette</span>
                </div>
                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    config.bgColor, config.accentColor, config.headingColor,
                    config.bodyColor, config.priceColor, config.cardBgColor,
                    config.cardBorderColor, config.categoryBgColor, config.categoryTextColor,
                    config.heroBgColor,
                  ].map((c, i) => (
                    <div key={i} className="aspect-square rounded-md border border-white/8" style={{ background: c }} title={c} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Unsaved changes badge ─────────────────────────────────────────── */}
      {isDirty && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2 rounded-full text-[11px] font-medium border border-amber-500/30 bg-amber-900/20 text-amber-300 shadow-lg pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          Unsaved changes — click "Save design" to persist
        </div>
      )}
    </div>,
    document.body,
  );
}
