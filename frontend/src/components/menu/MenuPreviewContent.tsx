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

function isRenderableImage(value?: string | null): boolean {
  const raw = value?.trim() ?? '';
  return /^https?:\/\//i.test(raw) || /^data:image\//i.test(raw);
}

function PreviewProductItem({ product }: { product: MenuPreviewItemRow }) {
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

  return (
    <div className="px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {product.displayImage !== false && isRenderableImage(product.imageUrl) && !imgFailed && (
            <img
              src={product.imageUrl!.trim()}
              alt=""
              loading="lazy"
              onError={() => setImgFailed(true)}
              className="h-9 w-9 shrink-0 rounded object-cover ring-1 ring-gray-200"
            />
          )}
          <span className="truncate text-[13px] font-semibold leading-snug text-gray-900">{product.name}</span>
        </div>
        <span className="shrink-0 whitespace-nowrap tabular-nums text-[13px] font-semibold text-gray-900">
          {formatPence(product.currentPrice)}
        </span>
      </div>
      {ings && <p className="mt-0.5 text-[11px] leading-snug text-gray-500">{ings}</p>}
      {product.description && (
        <p className="mt-0.5 text-[11px] italic leading-snug text-gray-400">{product.description}</p>
      )}
    </div>
  );
}

function FastFoodMenuCard({
  product,
  categoryName,
  accentColor,
}: {
  product: MenuPreviewItemRow;
  categoryName: string;
  accentColor: string;
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
          <h3 className="m-0 flex-1 text-base font-extrabold leading-snug text-white">{product.name}</h3>
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
              expanded ? '' : 'line-clamp-3',
            )}
          >
            {product.description}
          </p>
        ) : (
          <div className="mb-1" />
        )}
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="inline-flex cursor-pointer items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-semibold text-indigo-300"
        >
          <span>{expanded ? 'Hide details' : 'Show details'}</span>
          <span className="text-[9px] opacity-90">{expanded ? '▲' : '▼'}</span>
        </button>
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
  accentColor = '#6366f1',
}: {
  menu: MenuPreviewMenuMeta;
  venueId: string;
  venueName: string;
  menuData: MenuPreviewItemRow[];
  /** Matches venue `publicMenuStyle` — drives QR + eye preview look. */
  menuStyle?: MenuPreviewStyle;
  /** Brand hex for fast-food header / tabs (venue brand color). */
  accentColor?: string;
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

  if (isFf) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#faf9f6] [background-image:radial-gradient(circle,#d6d3d1_1px,transparent_1px)] [background-size:14px_14px]">
        <div className="flex-none border-b border-stone-200 bg-white px-5 pb-2.5 pt-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-500">{venueName}</p>
              <p className="mt-1 text-[22px] font-extrabold leading-tight tracking-tight text-stone-900">
                {menu.name}
              </p>
              {menu.description && (
                <p className="mt-0.5 text-[11px] text-stone-400">{menu.description}</p>
              )}
            </div>
            <span className="shrink-0 text-2xl" title="English">
              🇬🇧
            </span>
          </div>
          <span
            className="mt-2.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ backgroundColor: `${accentColor}18`, color: accentColor }}
          >
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Live pricing
          </span>
        </div>

        <div className="relative flex-none flex items-stretch border-b border-stone-200 bg-white/95 backdrop-blur-md">
          {canScrollLeft && (
            <button
              type="button"
              onClick={slideTabsLeft}
              className="z-10 flex w-7 shrink-0 items-center justify-center border-r border-stone-100 bg-white text-stone-400 hover:text-stone-800"
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
                    ffFilter === 'all' ? 'text-white' : 'bg-transparent text-stone-500',
                  )}
                  style={ffFilter === 'all' ? { backgroundColor: accentColor } : undefined}
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
                      ffFilter === cat.id ? 'text-white' : 'bg-transparent text-stone-500',
                    )}
                    style={ffFilter === cat.id ? { backgroundColor: accentColor } : undefined}
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
              className="z-10 flex w-7 shrink-0 items-center justify-center border-l border-stone-100 bg-white text-stone-400 hover:text-stone-800"
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
          <div className="mx-auto grid max-w-[1100px] grid-cols-2 gap-3.5">
            {categories.flatMap((cat) => {
              const catProducts = items.filter((i) => i.categoryId === cat.id);
              if (ffFilter !== 'all' && ffFilter !== cat.id) return [];
              return catProducts.map((product) => (
                <FastFoodMenuCard
                  key={product.id}
                  product={product}
                  categoryName={cat.name}
                  accentColor={accentColor}
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
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white">
      <div className="flex-none border-b border-gray-200 bg-white px-5 pb-2 pt-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-gray-500">{venueName}</p>
            <p className="text-[18px] font-bold leading-tight tracking-tight text-gray-900">{menu.name}</p>
            {menu.description && <p className="mt-0.5 text-[11px] text-gray-400">{menu.description}</p>}
          </div>
          <span className="mt-0.5 text-2xl" title="English">
            🇬🇧
          </span>
        </div>
      </div>

      <div className="relative flex flex-none items-stretch border-b border-gray-200 bg-white">
        {canScrollLeft && (
          <button
            type="button"
            onClick={slideTabsLeft}
            className="z-10 flex w-7 shrink-0 items-center justify-center border-r border-gray-100 bg-white text-gray-400 transition-colors hover:text-gray-900"
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
                    ? 'border-b-2 border-gray-900 text-gray-900'
                    : 'border-b-2 border-transparent text-gray-400 hover:text-gray-700',
                )}
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
            className="z-10 flex w-7 shrink-0 items-center justify-center border-l border-gray-100 bg-white text-gray-400 transition-colors hover:text-gray-900"
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

      <div ref={contentRef} className="min-h-0 flex-1 overflow-y-auto bg-gray-50" onScroll={handleScroll}>
        {categories.map((cat) => {
          const catProducts = items.filter((i) => i.categoryId === cat.id);
          if (catProducts.length === 0) return null;
          return (
            <div key={cat.id} data-cat={cat.id}>
              <div className="bg-gray-900 py-2 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-white">
                {cat.name}
              </div>
              <div className="mx-3 my-3 divide-y divide-gray-100 overflow-hidden rounded border border-gray-200 bg-white shadow-sm">
                {catProducts.map((product) => (
                  <PreviewProductItem key={product.id} product={product} />
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
