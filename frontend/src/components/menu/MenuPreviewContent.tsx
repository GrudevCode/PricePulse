import { useEffect, useState, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { categoriesApi, ingredientsApi } from '@/lib/api';
import { cn, formatPence } from '@/lib/utils';

/** Subset of menu item fields used by the dashboard eye preview */
export interface MenuPreviewItemRow {
  id: string;
  name: string;
  category: string;
  categoryId?: string | null;
  description?: string | null;
  currentPrice: number;
  intelligentlyHidden?: boolean;
  imageUrl?: string | null;
  displayImage?: boolean;
  isAvailable?: boolean;
}

export interface MenuPreviewMenuMeta {
  id: string;
  name: string;
  description: string | null;
}

interface DbCategory {
  id: string;
  name: string;
  description: string | null;
  menuId: string;
  displayOrder: number;
}

export type MenuPreviewStyle = 'gourmet' | 'fast_food';
const PLATFORM_ORANGE = '#D25F2A';
export interface MenuPreviewDesignConfig {
  bgType?: 'solid' | 'gradient' | 'image';
  bgColor?: string;
  bgGradientEnd?: string;
  bgGradientAngle?: number;
  bgImageUrl?: string;
  bgImageOverlay?: number;
  heroEnabled?: boolean;
  heroTitle?: string;
  heroSubtitle?: string;
  heroBgColor?: string;
  accentColor?: string;
  headingColor?: string;
  bodyColor?: string;
  priceColor?: string;
  topBarBgColor?: string;
  topBarTextColor?: string;
  cardBgColor?: string;
  cardBorderColor?: string;
  ctaBgColor?: string;
  ctaTextColor?: string;
  navBgColor?: string;
  navInactiveTextColor?: string;
  navActiveBgColor?: string;
  navActiveTextColor?: string;
  categoryBgColor?: string;
  categoryTextColor?: string;
  fontFamily?: string;
  cardRadius?: number;
  layout?: 'list' | 'grid' | 'compact';
  categoryStyle?: 'pill' | 'underline' | 'banner' | 'minimal';
  showImages?: boolean;
  showDescriptions?: boolean;
}

function isRenderableImage(value?: string | null): boolean {
  const raw = value?.trim() ?? '';
  return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
}

function PreviewProductItem({
  product,
  designConfig,
}: {
  product: MenuPreviewItemRow;
  designConfig?: MenuPreviewDesignConfig | null;
}) {
  const [imgFailed, setImgFailed] = useState(false);
  const { data: names = [] } = useQuery<string[]>({
    queryKey: ['preview-ingredients', product.id],
    queryFn: async () => {
      const res = await ingredientsApi.list(product.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (res.data.data as any[]).map((r) => (r.name ?? '') as string).filter(Boolean);
    },
    staleTime: 5 * 60_000,
  });

  const ings = names.join(' · ');
  const showImage = product.displayImage !== false && isRenderableImage(product.imageUrl) && !imgFailed;

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[56px_1fr_auto] items-start gap-x-3 gap-y-1">
        {showImage ? (
          <img
            src={product.imageUrl!.trim()}
            alt=""
            loading="lazy"
            onError={() => setImgFailed(true)}
            className="col-start-1 row-span-3 h-14 w-14 rounded-md object-cover ring-1 ring-gray-200 shadow-sm"
          />
        ) : (
          <div className="col-start-1 row-span-3 h-14 w-14 rounded-md bg-gray-100 ring-1 ring-gray-200" />
        )}

        <span className="col-start-2 row-start-1 truncate text-[13px] font-semibold leading-snug text-gray-900">
          {product.name}
        </span>
        <span className="col-start-3 row-start-1 whitespace-nowrap text-right tabular-nums text-[13px] font-semibold text-gray-900">
          {formatPence(product.currentPrice)}
        </span>
        {ings && (
          <p className="col-start-2 col-span-2 row-start-2 text-[11px] leading-snug text-gray-500 line-clamp-2">
            {ings}
          </p>
        )}
        {product.description && (
          <p className="col-start-2 col-span-2 row-start-3 text-[11px] italic leading-snug text-gray-400 line-clamp-1">
            {product.description}
          </p>
        )}
      </div>
      <div className="mt-2">
        <button
          type="button"
          className="inline-flex h-7 items-center rounded-full px-3 text-[11px] font-semibold text-white"
          style={{ backgroundColor: designConfig?.ctaBgColor ?? PLATFORM_ORANGE, color: designConfig?.ctaTextColor ?? '#fff' }}
        >
          Add to cart
        </button>
      </div>
    </div>
  );
}

function FastFoodMenuCard({
  product,
  categoryName,
  accentColor,
  designConfig,
}: {
  product: MenuPreviewItemRow;
  categoryName: string;
  accentColor: string;
  designConfig?: MenuPreviewDesignConfig | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const raw = product.imageUrl?.trim() ?? '';
  const imgOk = product.displayImage !== false && isRenderableImage(raw) && !imgFailed;

  return (
    <article
      className={cn(
        'relative rounded-[22px] overflow-hidden aspect-[3/4] shadow-[0_6px_24px_rgba(0,0,0,0.1)]',
        product.isAvailable === false && 'opacity-[0.52]',
      )}
    >
      {imgOk ? (
        <img
          src={raw}
          alt=""
          className="absolute inset-0 size-full object-cover"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : (
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(145deg, ${accentColor} 0%, ${accentColor}99 45%, #1c1917 100%)`,
          }}
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 42%, transparent 62%)',
        }}
      />
      <span
        className="absolute top-3 right-3 z-[3] flex size-[38px] items-center justify-center rounded-full bg-white/95 text-lg leading-none text-stone-400"
        aria-hidden
      >
        ♡
      </span>
      <div className="absolute bottom-0 left-0 right-0 z-[2] p-3.5 pb-3">
        <span className="mb-2 inline-block rounded-full bg-black/48 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-white">
          {categoryName}
        </span>
        <div className="mb-1.5 flex items-start justify-between gap-2.5">
          <h3 className="m-0 min-w-0 flex-1 break-words text-base font-extrabold leading-snug text-white line-clamp-2">
            {product.name}
          </h3>
          <span
            className="shrink-0 rounded-full px-3 py-1.5 text-sm font-extrabold tabular-nums text-white"
            style={{ backgroundColor: accentColor }}
          >
            {formatPence(product.currentPrice)}
          </span>
        </div>
        {product.description ? (
          <p
            className={cn(
              'mb-2 text-xs leading-snug text-white/90',
              expanded ? 'line-clamp-4' : 'line-clamp-2',
            )}
          >
            {product.description}
          </p>
        ) : (
          <div className="mb-1" />
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-semibold text-orange-200"
          >
            <span>{expanded ? 'Hide details' : 'Show details'}</span>
            <span className="text-[9px] opacity-90">{expanded ? '▲' : '▼'}</span>
          </button>
          <button
            type="button"
            className="inline-flex h-7 items-center rounded-full px-3 text-[11px] font-semibold text-white"
            style={{ backgroundColor: designConfig?.ctaBgColor ?? PLATFORM_ORANGE, color: designConfig?.ctaTextColor ?? '#fff' }}
          >
            Add to cart
          </button>
        </div>
      </div>
    </article>
  );
}

const BASE_W = 390;
const BASE_H = 790;

/**
 * Inner screen only (white header, tabs, list) — same markup as the dashboard eye preview.
 */
export function MenuPreviewContent({
  menu,
  venueId,
  venueName,
  menuData,
  menuStyle = 'gourmet',
  accentColor = PLATFORM_ORANGE,
  designConfig,
}: {
  menu: MenuPreviewMenuMeta;
  venueId: string;
  venueName: string;
  menuData: MenuPreviewItemRow[];
  /** Matches venue `publicMenuStyle` — drives QR + eye preview look. */
  menuStyle?: MenuPreviewStyle;
  /** Brand hex for fast-food header / tabs (venue brand color). */
  accentColor?: string;
  /** Optional saved design config from Menu Design Studio */
  designConfig?: MenuPreviewDesignConfig | null;
}) {
  const { data: categories = [], isLoading: catsLoading } = useQuery<DbCategory[]>({
    queryKey: ['categories', menu.id],
    queryFn: () => categoriesApi.list(venueId, menu.id).then((r) => r.data.data),
    staleTime: 60_000,
  });

  const catIds = new Set(categories.map((c) => c.id));
  const items = menuData.filter(
    (i) => i.categoryId && catIds.has(i.categoryId) && !i.intelligentlyHidden,
  );

  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  /** Fast-food layout: filter grid by category or show all. */
  const [ffFilter, setFfFilter] = useState('all');
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);
  const tabsRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (categories.length > 0 && !activeTabId) {
      setActiveTabId(categories[0].id);
    }
  }, [categories, activeTabId]);

  function updateScrollArrows() {
    const el = tabsRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    updateScrollArrows();
  }, [categories]);

  function slideTabsLeft() {
    tabsRef.current?.scrollBy({ left: -100, behavior: 'smooth' });
  }
  function slideTabsRight() {
    tabsRef.current?.scrollBy({ left: 100, behavior: 'smooth' });
  }

  function scrollToCategory(catId: string) {
    setActiveTabId(catId);
    const el = contentRef.current?.querySelector<HTMLElement>(`[data-cat="${catId}"]`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    const tabEl = tabsRef.current?.querySelector<HTMLElement>(`[data-tab="${catId}"]`);
    tabEl?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }

  function handleScroll() {
    if (!contentRef.current) return;
    for (const cat of [...categories].reverse()) {
      const el = contentRef.current.querySelector<HTMLElement>(`[data-cat="${cat.id}"]`);
      if (el && el.getBoundingClientRect().top <= 140) {
        setActiveTabId(cat.id);
        break;
      }
    }
  }

  const isFf = menuStyle === 'fast_food';
  const previewAccent = designConfig?.accentColor || PLATFORM_ORANGE;
  const showImages = designConfig?.showImages !== false;
  const showDescriptions = designConfig?.showDescriptions !== false;
  const fontFamily = designConfig?.fontFamily || 'Inter';

  const rootBgStyle: React.CSSProperties =
    designConfig?.bgType === 'gradient'
      ? {
          background: `linear-gradient(${designConfig.bgGradientAngle ?? 135}deg, ${designConfig.bgColor ?? '#faf9f6'}, ${designConfig.bgGradientEnd ?? '#ece8e1'})`,
          fontFamily,
        }
      : designConfig?.bgType === 'image' && designConfig.bgImageUrl
        ? {
            backgroundImage: `url(${designConfig.bgImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            fontFamily,
          }
        : {
            background: designConfig?.bgColor ?? (isFf ? '#faf9f6' : '#f9fafb'),
            fontFamily,
          };

  if (isFf) {
    return (
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden [background-image:radial-gradient(circle,#d6d3d1_1px,transparent_1px)] [background-size:14px_14px]" style={rootBgStyle}>
        {designConfig?.bgType === 'image' && designConfig.bgImageUrl && (
          <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(0,0,0,${(designConfig.bgImageOverlay ?? 45) / 100})` }} />
        )}
        <div className="flex-none border-b border-stone-200 px-5 pb-2.5 pt-3" style={{ background: designConfig?.topBarBgColor ?? '#ffffff' }}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {designConfig?.heroEnabled ? (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: designConfig.topBarTextColor ?? designConfig.bodyColor ?? '#6b7280' }}>{venueName}</p>
                  <p className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight" style={{ color: designConfig.topBarTextColor ?? designConfig.headingColor ?? '#111827' }}>
                    {designConfig.heroTitle || menu.name}
                  </p>
                  {(designConfig.heroSubtitle || menu.description) && (
                    <p className="mt-0.5 text-[11px]" style={{ color: designConfig.bodyColor ?? '#9ca3af' }}>{designConfig.heroSubtitle || menu.description}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: designConfig?.topBarTextColor ?? '#78716c' }}>{venueName}</p>
                  <p className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight" style={{ color: designConfig?.topBarTextColor ?? '#1c1917' }}>
                    {menu.name}
                  </p>
                  {menu.description && (
                    <p className="mt-0.5 text-[11px] text-stone-400">{menu.description}</p>
                  )}
                </>
              )}
            </div>
            <span className="shrink-0 text-2xl" title="English">
              🇬🇧
            </span>
          </div>
          <span
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: `${previewAccent}18`, color: previewAccent }}
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Live pricing
          </span>
        </div>

        <div className="relative flex-none flex items-stretch border-b border-stone-200 backdrop-blur-md" style={{ background: designConfig?.navBgColor ?? '#ffffff' }}>
          {canScrollLeft && (
            <button
              type="button"
              onClick={slideTabsLeft}
              className="z-10 flex w-7 shrink-0 items-center justify-center border-r border-stone-100 hover:text-stone-800"
              style={{ background: designConfig?.navBgColor ?? '#ffffff', color: designConfig?.navInactiveTextColor ?? '#a8a29e' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M7.5 2L4 6l3.5 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
          <div
            ref={tabsRef}
            className="flex flex-1 gap-2 overflow-x-auto px-3 py-2.5"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            onScroll={updateScrollArrows}
          >
            {catsLoading ? (
              <div className="px-2 py-1 text-xs text-stone-400">Loading…</div>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => setFfFilter('all')}
                  className={cn(
                    'shrink-0 rounded-full px-[18px] py-2.5 text-[13px] font-semibold transition-colors',
                    ffFilter === 'all' ? '' : 'bg-transparent',
                  )}
                    style={ffFilter === 'all'
                      ? { backgroundColor: designConfig?.navActiveBgColor ?? previewAccent, color: designConfig?.navActiveTextColor ?? '#fff' }
                      : { color: designConfig?.navInactiveTextColor ?? '#78716c' }}
                >
                  All items
                </button>
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setFfFilter(cat.id)}
                    className={cn(
                      'shrink-0 rounded-full px-[18px] py-2.5 text-[13px] font-semibold transition-colors',
                      ffFilter === cat.id ? '' : 'bg-transparent',
                    )}
                    style={ffFilter === cat.id
                      ? { backgroundColor: designConfig?.navActiveBgColor ?? previewAccent, color: designConfig?.navActiveTextColor ?? '#fff' }
                      : { color: designConfig?.navInactiveTextColor ?? '#78716c' }}
                  >
                    {cat.name}
                  </button>
                ))}
              </>
            )}
          </div>
          {canScrollRight && (
            <button
              type="button"
              onClick={slideTabsRight}
              className="z-10 flex w-7 shrink-0 items-center justify-center border-l border-stone-100 hover:text-stone-800"
              style={{ background: designConfig?.navBgColor ?? '#ffffff', color: designConfig?.navInactiveTextColor ?? '#a8a29e' }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path
                  d="M4.5 2L8 6l-3.5 4"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          )}
        </div>

        <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-6 pt-3.5">
          <div className={cn('mx-auto grid max-w-[1100px] gap-3.5', designConfig?.layout === 'list' ? 'grid-cols-1' : 'grid-cols-2')}>
            {categories.flatMap((cat) => {
              const catProducts = items.filter((i) => i.categoryId === cat.id);
              if (ffFilter !== 'all' && ffFilter !== cat.id) return [];
              return catProducts.map((product) => (
                <FastFoodMenuCard
                  key={product.id}
                  product={showImages ? product : { ...product, imageUrl: null, displayImage: false }}
                  categoryName={cat.name}
                  accentColor={previewAccent}
                  designConfig={designConfig}
                />
              ));
            })}
          </div>
          <p className="mt-6 text-center text-[11px] text-stone-400">
            Prices may update with demand · PricePulse
          </p>
          <div className="h-4" />
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden" style={rootBgStyle}>
      {designConfig?.bgType === 'image' && designConfig.bgImageUrl && (
        <div className="absolute inset-0 pointer-events-none" style={{ background: `rgba(0,0,0,${(designConfig.bgImageOverlay ?? 30) / 100})` }} />
      )}
      <div className="flex-none border-b border-gray-200 px-5 pb-2 pt-3" style={{ background: designConfig?.topBarBgColor ?? '#ffffff' }}>
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em]" style={{ color: designConfig?.topBarTextColor ?? '#6b7280' }}>{venueName}</p>
            <p className="text-[18px] font-bold leading-tight tracking-tight" style={{ color: designConfig?.topBarTextColor ?? '#111827' }}>{menu.name}</p>
            {menu.description && <p className="mt-0.5 text-[11px]" style={{ color: designConfig?.topBarTextColor ?? '#9ca3af' }}>{menu.description}</p>}
          </div>
          <span className="mt-0.5 text-2xl" title="English">
            🇬🇧
          </span>
        </div>
      </div>

      <div className="relative flex flex-none items-stretch border-b border-gray-200" style={{ background: designConfig?.navBgColor ?? '#ffffff' }}>
        {canScrollLeft && (
          <button
            type="button"
            onClick={slideTabsLeft}
            className="z-10 flex w-7 shrink-0 items-center justify-center border-r border-gray-100 transition-colors hover:text-gray-900"
            style={{ background: designConfig?.navBgColor ?? '#ffffff', color: designConfig?.navInactiveTextColor ?? '#9ca3af' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M7.5 2L4 6l3.5 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}

        <div
          ref={tabsRef}
          className="flex overflow-x-auto flex-1"
          style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
          onScroll={updateScrollArrows}
        >
          {catsLoading ? (
            <div className="px-5 py-2.5 text-xs text-gray-400">Loading…</div>
          ) : (
            categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                data-tab={cat.id}
                onClick={() => scrollToCategory(cat.id)}
                className={cn(
                  'shrink-0 px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors',
                  activeTabId === cat.id
                    ? 'border-b-2'
                    : 'border-b-2 border-transparent hover:opacity-80',
                )}
                style={activeTabId === cat.id
                  ? { borderColor: designConfig?.navActiveBgColor ?? '#111827', color: designConfig?.navActiveTextColor ?? '#111827', background: designConfig?.navBgColor ?? '#fff' }
                  : { color: designConfig?.navInactiveTextColor ?? '#9ca3af', background: designConfig?.navBgColor ?? '#fff' }}
              >
                {cat.name}
              </button>
            ))
          )}
        </div>

        {canScrollRight && (
          <button
            type="button"
            onClick={slideTabsRight}
            className="z-10 flex w-7 shrink-0 items-center justify-center border-l border-gray-100 transition-colors hover:text-gray-900"
            style={{ background: designConfig?.navBgColor ?? '#ffffff', color: designConfig?.navInactiveTextColor ?? '#9ca3af' }}
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M4.5 2L8 6l-3.5 4"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        )}
      </div>

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto" onScroll={handleScroll}>
        {categories.map((cat) => {
          const catProducts = items.filter((i) => i.categoryId === cat.id);
          if (catProducts.length === 0) return null;
          return (
            <div key={cat.id} data-cat={cat.id}>
              {designConfig?.categoryStyle === 'pill' && (
                <div className="mx-3 mt-3">
                  <span className="inline-flex rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em]" style={{ background: designConfig.categoryBgColor ?? '#111827', color: designConfig.categoryTextColor ?? '#fff' }}>
                    {cat.name}
                  </span>
                </div>
              )}
              {designConfig?.categoryStyle === 'underline' && (
                <div className="mx-3 mt-3 pb-1 border-b" style={{ borderColor: designConfig.accentColor ?? previewAccent }}>
                  <span className="text-[10px] font-bold uppercase tracking-[0.22em]" style={{ color: designConfig.categoryTextColor ?? '#111827' }}>{cat.name}</span>
                </div>
              )}
              {(!designConfig?.categoryStyle || designConfig.categoryStyle === 'banner' || designConfig.categoryStyle === 'minimal') && (
                <div className="py-2 text-center text-[10px] font-bold uppercase tracking-[0.22em]" style={{ background: designConfig?.categoryBgColor ?? '#111827', color: designConfig?.categoryTextColor ?? '#fff' }}>
                  {cat.name}
                </div>
              )}
              <div className={cn('mx-3 my-3 overflow-hidden rounded border shadow-sm', designConfig?.layout === 'grid' ? 'grid grid-cols-2 divide-x divide-y' : 'divide-y')} style={{ borderColor: designConfig?.cardBorderColor ?? '#e5e7eb', background: designConfig?.cardBgColor ?? '#fff', borderRadius: designConfig?.cardRadius ?? 8 }}>
                {catProducts.map((product) => (
                  <PreviewProductItem
                    key={product.id}
                    product={showImages ? product : { ...product, imageUrl: null, displayImage: false, description: showDescriptions ? product.description : null }}
                    designConfig={designConfig}
                  />
                ))}
              </div>
            </div>
          );
        })}
        <div className="h-8" />
      </div>
    </div>
  );
}

/** iPhone-style shell: notch + home bar — matches dashboard eye preview. */
export function MenuPreviewPhoneShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col shadow-2xl shrink-0"
      style={{ width: BASE_W, height: BASE_H }}
    >
      <div className="flex-1 flex flex-col rounded-[44px] overflow-hidden border-[10px] border-gray-900 bg-gray-900 min-h-0">
        <div className="h-7 bg-gray-900 flex-none flex items-end justify-center pb-1">
          <div className="w-28 h-4 bg-black rounded-b-2xl" />
        </div>
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">{children}</div>
        <div className="h-6 bg-gray-900 flex items-center justify-center shrink-0">
          <div className="w-24 h-1 bg-gray-600 rounded-full" />
        </div>
      </div>
    </div>
  );
}

const TABLET_W = 560;
const TABLET_H = 720;

/** Landscape tablet bezel — wide flat frame, no notch. */
export function MenuPreviewTabletShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col shadow-2xl shrink-0 rounded-[28px] border-[14px] border-zinc-800 bg-zinc-900"
      style={{ width: TABLET_W, height: TABLET_H }}
    >
      <div className="flex-1 min-h-0 flex flex-col rounded-xl overflow-hidden border border-zinc-700/60 bg-white">
        {children}
      </div>
    </div>
  );
}

const LAPTOP_W = 900;
const LAPTOP_H = 560;
const LAPTOP_CHROME = 36;

/** Laptop-style browser chrome + wide content area. */
export function MenuPreviewLaptopShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative flex flex-col shadow-2xl shrink-0 rounded-lg overflow-hidden border border-zinc-700 bg-zinc-900"
      style={{ width: LAPTOP_W, height: LAPTOP_H }}
    >
      <div
        className="flex-none flex items-center gap-2 px-3 bg-zinc-200 border-b border-zinc-300"
        style={{ height: LAPTOP_CHROME }}
      >
        <div className="flex gap-1.5 shrink-0">
          <span className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
        </div>
        <div className="flex-1 h-6 min-w-0 bg-white rounded-md border border-zinc-200/80 text-[10px] text-zinc-500 flex items-center px-2.5 truncate">
          menu · guest preview
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col bg-white overflow-hidden">{children}</div>
    </div>
  );
}

export { BASE_W as MENU_PREVIEW_BASE_WIDTH, BASE_H as MENU_PREVIEW_BASE_HEIGHT };

/**
 * Scaled wrapper for embedding multiple sizes (Integrations). Keeps 390×790 logical layout.
 */
export function MenuPreviewScaledFrame({
  scale,
  label,
  children,
}: {
  scale: number;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <div
        className="overflow-hidden flex justify-center"
        style={{
          width: BASE_W * scale,
          height: BASE_H * scale,
        }}
      >
        <div
          style={{
            transform: `scale(${scale})`,
            transformOrigin: 'top center',
            width: BASE_W,
            height: BASE_H,
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
