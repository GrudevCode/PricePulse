import { and, eq } from 'drizzle-orm';
import {
  calendarDateLondon,
  clockTimeLondon,
  effectiveMenuIdForTime,
  normalizeTimeSwitches,
  resolveQrEffectiveMenuId,
} from '@pricepulse/shared';
import * as schema from '../db/schema';
import type { getDb } from '../db';
import { getMenuItemIngredientStockMap } from './ingredientStock';

type Db = ReturnType<typeof getDb>;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export { calendarDateLondon };

export function parseOptionalForDate(q: unknown): string | null {
  if (typeof q !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(q)) return null;
  return q;
}

export function parseOptionalForTimeHm(q: unknown): string | undefined {
  if (typeof q !== 'string' || !/^\d{2}:\d{2}$/.test(q)) return undefined;
  return q;
}

type MenuItemRow = typeof schema.menuItems.$inferSelect;

export type PublicMenuStyle = 'gourmet' | 'fast_food';

export function normalizedPublicMenuStyle(venue: { publicMenuStyle?: string | null }): PublicMenuStyle {
  return venue.publicMenuStyle === 'fast_food' ? 'fast_food' : 'gourmet';
}

function isItemPubliclyVisible(
  item: MenuItemRow,
  stockMap: Map<string, 'out_of_stock' | 'not_tracked' | string>,
): boolean {
  if (!item.intelligentInventorySync) return true;
  return stockMap.get(item.id) !== 'out_of_stock';
}

export type PublicMenuLegacyCategory = { name: string; items: MenuItemRow[] };

export type PublicMenuStructuredCategory = {
  id: string;
  name: string;
  items: MenuItemRow[];
};

export type BuiltPublicMenu =
  | {
      mode: 'legacy';
      effectiveMenuId: null;
      menuTitle: string;
      legacyCategories: PublicMenuLegacyCategory[];
    }
  | {
      mode: 'structured';
      effectiveMenuId: string;
      menuTitle: string;
      menuDescription: string | null;
      structuredCategories: PublicMenuStructuredCategory[];
    }
  | {
      mode: 'empty';
      effectiveMenuId: string | null;
      menuTitle: string;
      message: string;
    };

export async function buildPublicMenu(
  db: Db,
  venue: typeof schema.venues.$inferSelect,
  forDate: string,
  forTimeHm?: string,
): Promise<BuiltPublicMenu> {
  const stockMap = await getMenuItemIngredientStockMap(venue.id);

  const schedRow = await db.query.venueSchedule.findFirst({
    where: and(
      eq(schema.venueSchedule.venueId, venue.id),
      eq(schema.venueSchedule.scheduleDate, forDate),
    ),
  });

  let scheduledMenuId: string | null = null;
  if (schedRow) {
    const switches = normalizeTimeSwitches(schedRow.timeSwitches);
    const londonToday = calendarDateLondon();
    const timeHm =
      forTimeHm ??
      (forDate === londonToday ? clockTimeLondon() : '00:00');
    scheduledMenuId = effectiveMenuIdForTime(schedRow.menuId, switches, timeHm);
  }

  const effectiveId = resolveQrEffectiveMenuId(venue.qrMenuSettings, {
    scheduledMenuId,
  });

  const allItems = await db.query.menuItems.findMany({
    where: eq(schema.menuItems.venueId, venue.id),
    orderBy: (m, { asc }) => [asc(m.category), asc(m.name)],
  });

  const visibleItems = allItems.filter((item) => isItemPubliclyVisible(item, stockMap));

  if (effectiveId === null) {
    const categories: Record<string, MenuItemRow[]> = {};
    for (const item of visibleItems) {
      if (!categories[item.category]) categories[item.category] = [];
      categories[item.category].push(item);
    }
    const legacyCategories = Object.entries(categories).map(([name, items]) => ({ name, items }));
    return {
      mode: 'legacy',
      effectiveMenuId: null,
      menuTitle: venue.name,
      legacyCategories,
    };
  }

  const menuRow = await db.query.menus.findFirst({
    where: and(eq(schema.menus.id, effectiveId), eq(schema.menus.venueId, venue.id)),
  });

  if (!menuRow) {
    return {
      mode: 'empty',
      effectiveMenuId: null,
      menuTitle: venue.name,
      message: 'This menu is not available.',
    };
  }

  const categories = await db.query.menuCategories.findMany({
    where: eq(schema.menuCategories.menuId, effectiveId),
    orderBy: (c, { asc }) => [asc(c.displayOrder), asc(c.name)],
  });

  const structuredCategories: PublicMenuStructuredCategory[] = [];

  for (const cat of categories) {
    const items = visibleItems.filter((i) => i.categoryId === cat.id);
    if (items.length === 0) continue;
    structuredCategories.push({ id: cat.id, name: cat.name, items });
  }

  if (structuredCategories.length === 0) {
    return {
      mode: 'empty',
      effectiveMenuId: effectiveId,
      menuTitle: menuRow.name,
      message: 'No items in this menu right now.',
    };
  }

  return {
    mode: 'structured',
    effectiveMenuId: effectiveId,
    menuTitle: menuRow.name,
    menuDescription: menuRow.description,
    structuredCategories,
  };
}

type LightMenuCategory = { id: string; name: string; items: MenuItemRow[] };

function lightItemRow(item: MenuItemRow): string {
  const un = !item.isAvailable ? ' unavailable' : '';
  return `<div class="row${un}" data-item-id="${item.id}">
    <div>
      <div class="n">${escapeHtml(item.name)}</div>
      ${item.description ? `<div class="d">${escapeHtml(item.description)}</div>` : ''}
    </div>
    <div class="p item-price" id="price-${item.id}">£${(item.currentPrice / 100).toFixed(2)}</div>
  </div>`;
}

/** Safe fragment for use inside CSS url('…'). */
function cssUrlEscape(url: string): string {
  return url.replace(/\\/g, '/').replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
}

function fastFoodItemCard(item: MenuItemRow, categoryName: string, categoryId: string, brandColor: string): string {
  const raw = item.imageUrl?.trim() ?? '';
  const imgOk = /^https?:\/\//i.test(raw);
  const bgStyle = imgOk ? `background-image:url('${cssUrlEscape(raw)}');` : '';
  const noImgClass = imgOk ? '' : ' ff-card-bg--placeholder';
  const un = !item.isAvailable ? ' ff-card--unavailable' : '';
  const desc = item.description?.trim() ? escapeHtml(item.description) : '';
  return `<article class="ff-card${un}" data-item-id="${item.id}" data-cat="${escapeHtml(categoryId)}">
  <div class="ff-card-bg${noImgClass}" style="${bgStyle}"></div>
  <button type="button" class="ff-fav" aria-hidden="true" tabindex="-1">♡</button>
  <div class="ff-card-inner">
    <span class="ff-cat">${escapeHtml(categoryName)}</span>
    <div class="ff-row-title">
      <h3 class="ff-name">${escapeHtml(item.name)}</h3>
      <span class="ff-price item-price" id="price-${item.id}">£${(item.currentPrice / 100).toFixed(2)}</span>
    </div>
    ${desc ? `<p class="ff-desc">${desc}</p>` : '<p class="ff-desc ff-desc--empty">&nbsp;</p>'}
    <button type="button" class="ff-details-btn"><span class="ff-details-label">Show details</span><span class="ff-chev">▼</span></button>
  </div>
</article>`;
}

/** Pixel-style card grid: dotted page, category pills, full-bleed photos, gradient footer. */
function renderFastFoodMenuDocument(
  venue: typeof schema.venues.$inferSelect,
  opts: {
    brandColor: string;
    venueNameEscaped: string;
    menuTitleEscaped: string;
    subtitleEscaped: string;
    categories: LightMenuCategory[];
  },
): string {
  const { brandColor, venueNameEscaped, menuTitleEscaped, subtitleEscaped, categories } = opts;
  const pills = [
    `<button type="button" class="ff-pill active" data-filter="all">All items</button>`,
    ...categories.map(
      (c) =>
        `<button type="button" class="ff-pill" data-filter="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`,
    ),
  ].join('');

  const grid = categories
    .flatMap((cat) => cat.items.map((item) => fastFoodItemCard(item, cat.name, cat.id, brandColor)))
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${venueNameEscaped} — ${menuTitleEscaped}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body.ff { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #faf9f6; color: #1c1917; min-height: 100vh;
      background-image: radial-gradient(circle, #d6d3d1 1px, transparent 1px); background-size: 14px 14px; }
    .ff-top { background: #fff; border-bottom: 1px solid #e7e5e4; padding: 18px 20px 14px; }
    .ff-top h1 { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.16em; color: #78716c; display: flex; align-items: center; gap: 8px; }
    .ff-top .menu-name { font-size: 22px; font-weight: 800; letter-spacing: -0.02em; margin-top: 6px; color: #0c0a09; }
    .ff-top .sub { font-size: 12px; color: #a8a29e; margin-top: 4px; }
    .ff-live { display: inline-flex; align-items: center; gap: 6px; margin-top: 10px; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; background: ${brandColor}18; color: ${brandColor}; }
    .ff-live-dot { width: 7px; height: 7px; background: #22c55e; border-radius: 50%; animation: ff-pulse 2s infinite; }
    @keyframes ff-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
    .ff-tabs-wrap { position: sticky; top: 0; z-index: 40; background: rgba(255,255,255,0.92); backdrop-filter: blur(8px); border-bottom: 1px solid #e7e5e4; }
    .ff-tabs { display: flex; gap: 8px; padding: 12px 16px; overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .ff-tabs::-webkit-scrollbar { display: none; }
    .ff-pill { flex: 0 0 auto; border: none; padding: 10px 18px; border-radius: 999px; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; background: transparent; color: #78716c; }
    .ff-pill.active { background: ${brandColor}; color: #fff; }
    .ff-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 14px; padding: 16px; max-width: 1100px; margin: 0 auto; padding-bottom: 32px; }
    @media (min-width: 640px) { .ff-grid { grid-template-columns: repeat(3, 1fr); } }
    .ff-card { position: relative; border-radius: 22px; overflow: hidden; aspect-ratio: 3 / 4; box-shadow: 0 6px 24px rgba(0,0,0,0.1); }
    .ff-card--unavailable { opacity: 0.52; }
    .ff-card-bg { position: absolute; inset: 0; background-size: cover; background-position: center; }
    .ff-card-bg--placeholder { background: linear-gradient(145deg, ${brandColor} 0%, ${brandColor}99 45%, #1c1917 100%); }
    .ff-card::after { content: ''; position: absolute; inset: 0; pointer-events: none;
      background: linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.35) 42%, transparent 62%); }
    .ff-fav { position: absolute; top: 12px; right: 12px; z-index: 3; width: 38px; height: 38px; border-radius: 50%; border: none;
      background: rgba(255,255,255,0.95); cursor: default; display: flex; align-items: center; justify-content: center; color: #a8a29e; font-size: 18px; line-height: 1; }
    .ff-card-inner { position: absolute; bottom: 0; left: 0; right: 0; z-index: 2; padding: 14px 14px 12px; }
    .ff-cat { display: inline-block; padding: 5px 11px; border-radius: 999px; background: rgba(0,0,0,0.48); color: #fff; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 8px; }
    .ff-row-title { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .ff-name { font-size: 16px; font-weight: 800; color: #fff; line-height: 1.2; flex: 1; margin: 0; }
    .ff-price { flex-shrink: 0; padding: 7px 13px; border-radius: 999px; background: ${brandColor}; color: #fff; font-size: 14px; font-weight: 800; tabular-nums; }
    .ff-desc { font-size: 12px; color: rgba(255,255,255,0.92); line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 3; -webkit-box-orient: vertical; overflow: hidden; margin-bottom: 8px; }
    .ff-desc--empty { opacity: 0; min-height: 0; margin-bottom: 4px; }
    .ff-card.ff-expanded .ff-desc { -webkit-line-clamp: unset; display: block; }
    .ff-details-btn { border: none; background: none; color: #a5b4fc; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 5px; padding: 0; }
    .ff-chev { font-size: 9px; opacity: 0.9; }
    .ff-footer { text-align: center; padding: 8px 16px 28px; color: #a8a29e; font-size: 11px; }
    .ff-hidden { display: none !important; }
    .item-price.updated { animation: ff-flash 0.65s; }
    @keyframes ff-flash { 0% { color: #4ade80; } 100% { color: inherit; } }
  </style>
</head>
<body class="ff">
  <div class="ff-top">
    <h1><span aria-hidden="true">🇬🇧</span>${venueNameEscaped}</h1>
    <div class="menu-name">${menuTitleEscaped}</div>
    <div class="sub">${subtitleEscaped}</div>
    <span class="ff-live"><span class="ff-live-dot"></span> Live pricing</span>
  </div>
  <div class="ff-tabs-wrap"><div class="ff-tabs" id="ff-tabs">${pills}</div></div>
  <div class="ff-grid" id="ff-grid">${grid}</div>
  <div class="ff-footer">Prices may update with demand · Powered by PricePulse</div>
  <script>
    (function(){
      document.querySelectorAll('.ff-pill').forEach(function(p) {
        p.addEventListener('click', function() {
          var f = p.getAttribute('data-filter');
          document.querySelectorAll('.ff-pill').forEach(function(x) { x.classList.toggle('active', x === p); });
          document.querySelectorAll('.ff-card').forEach(function(card) {
            var c = card.getAttribute('data-cat');
            var show = f === 'all' || c === f;
            card.classList.toggle('ff-hidden', !show);
          });
        });
      });
      document.querySelectorAll('.ff-details-btn').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var card = btn.closest('.ff-card');
          if (!card) return;
          card.classList.toggle('ff-expanded');
          var lab = btn.querySelector('.ff-details-label');
          var chev = btn.querySelector('.ff-chev');
          if (lab) lab.textContent = card.classList.contains('ff-expanded') ? 'Hide details' : 'Show details';
          if (chev) chev.textContent = card.classList.contains('ff-expanded') ? '▲' : '▼';
        });
      });
    })();
    var evtSource = new EventSource('/sse/menu/${venue.id}');
    evtSource.addEventListener('price_update', function(e) {
      var updates = JSON.parse(e.data);
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        var el = document.getElementById('price-' + u.itemId);
        if (el) {
          el.textContent = '£' + (u.newPricePence / 100).toFixed(2);
          el.classList.remove('updated');
          void el.offsetWidth;
          el.classList.add('updated');
        }
      }
    });
  </script>
</body>
</html>`;
}

/** Stacked sections + sticky scroll-tabs — gourmet only; fast_food uses {@link renderFastFoodMenuDocument}. */
function renderLightMenuDocument(
  venue: typeof schema.venues.$inferSelect,
  opts: {
    brandColor: string;
    venueNameEscaped: string;
    menuTitleEscaped: string;
    subtitleEscaped: string;
    categories: LightMenuCategory[];
    menuStyle: PublicMenuStyle;
  },
): string {
  const { brandColor, venueNameEscaped, menuTitleEscaped, subtitleEscaped, categories, menuStyle } = opts;
  if (menuStyle === 'fast_food') {
    return renderFastFoodMenuDocument(venue, {
      brandColor,
      venueNameEscaped,
      menuTitleEscaped,
      subtitleEscaped,
      categories,
    });
  }
  const bodyClass = 'pp-gourmet';
  const tabs = categories
    .map(
      (cat, i) =>
        `<button type="button" class="tab${i === 0 ? ' active' : ''}" data-tab="${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</button>`,
    )
    .join('');

  const sections = categories
    .map(
      (cat) => `
    <section class="cat-section" data-cat="${escapeHtml(cat.id)}">
      <div class="banner">${escapeHtml(cat.name)}</div>
      <div class="card-list">
        ${cat.items.map((item) => lightItemRow(item)).join('')}
      </div>
    </section>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${venueNameEscaped} — ${menuTitleEscaped}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #fafafa; color: #18181b; min-height: 100vh; }
    .header { background: #fff; border-bottom: 1px solid #e4e4e7; padding: 16px 20px 12px; }
    .header h1 { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.18em; color: #71717a; display: flex; align-items: center; gap: 6px; }
    .header .flag { font-size: 14px; line-height: 1; }
    .header .menu-name { font-size: 22px; font-weight: 700; margin-top: 4px; color: #18181b; }
    .header .sub { font-size: 12px; color: #a1a1aa; margin-top: 4px; }
    .live-row { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
    .live-badge { display: inline-flex; align-items: center; gap: 6px; background: ${brandColor}15; color: ${brandColor}; padding: 4px 10px; border-radius: 999px; font-size: 11px; font-weight: 600; }
    .live-dot { width: 7px; height: 7px; background: #22c55e; border-radius: 50%; animation: pulse 2s infinite; }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .tabs-wrap { position: sticky; top: 0; z-index: 30; background: #fff; border-bottom: 1px solid #e4e4e7; }
    .tabs { display: flex; overflow-x: auto; gap: 0; -webkit-overflow-scrolling: touch; }
    .tabs::-webkit-scrollbar { display: none; }
    .tab { flex: 0 0 auto; padding: 12px 16px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.12em; border: none; background: none; cursor: pointer; color: #a1a1aa; border-bottom: 2px solid transparent; }
    .tab.active { color: #18181b; border-bottom-color: #18181b; }
    .menu-body { padding-bottom: 32px; }
    .cat-section { scroll-margin-top: 112px; }
    .banner { background: #18181b; color: #fff; text-align: center; padding: 10px; font-size: 10px; font-weight: 700; letter-spacing: 0.2em; text-transform: uppercase; margin: 12px 12px 0; border-radius: 4px 4px 0 0; }
    .card-list { margin: 0 12px 16px; background: #fff; border: 1px solid #e4e4e7; border-top: none; border-radius: 0 0 8px 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.04); }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 12px 16px; border-bottom: 1px solid #f4f4f5; }
    .row:last-child { border-bottom: none; }
    .row.unavailable { opacity: 0.45; }
    .row .n { font-size: 13px; font-weight: 600; color: #18181b; }
    .row .p { font-size: 13px; font-weight: 600; tabular-nums; color: #18181b; white-space: nowrap; }
    .row .d { font-size: 11px; color: #a1a1aa; margin-top: 4px; font-style: italic; }
    .footer { text-align: center; padding: 20px; color: #a1a1aa; font-size: 11px; }
    .item-price.updated { animation: flash 0.6s; }
    @keyframes flash { 0% { color: #22c55e; } 100% { color: inherit; } }
  </style>
</head>
<body class="${bodyClass}">
  <div class="header">
    <h1><span class="flag" aria-hidden="true">🇬🇧</span>${venueNameEscaped}</h1>
    <div class="menu-name">${menuTitleEscaped}</div>
    <div class="sub">${subtitleEscaped}</div>
    <div class="live-row">
      <span class="live-badge"><span class="live-dot"></span> Live pricing</span>
    </div>
  </div>
  <div class="tabs-wrap">
    <div class="tabs" id="tabs">${tabs}</div>
  </div>
  <div class="menu-body" id="menu-body">${sections}</div>
  <div class="footer">Prices may update with demand · Powered by PricePulse</div>
  <script>
    (function(){
      var tabs = document.querySelectorAll('.tab');
      var sections = document.querySelectorAll('.cat-section');
      var thresh = 120;
      function scrollToCat(id) {
        var el = document.querySelector('.cat-section[data-cat="' + id + '"]');
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      function updateActiveFromScroll() {
        var activeId = null;
        sections.forEach(function(s) {
          var r = s.getBoundingClientRect();
          if (r.top <= thresh) activeId = s.getAttribute('data-cat');
        });
        if (!activeId && sections.length) activeId = sections[0].getAttribute('data-cat');
        tabs.forEach(function(t) {
          t.classList.toggle('active', t.getAttribute('data-tab') === activeId);
        });
      }
      tabs.forEach(function(t) {
        t.addEventListener('click', function() {
          scrollToCat(t.getAttribute('data-tab'));
        });
      });
      window.addEventListener('scroll', updateActiveFromScroll, { passive: true });
      updateActiveFromScroll();
    })();
    var evtSource = new EventSource('/sse/menu/${venue.id}');
    evtSource.addEventListener('price_update', function(e) {
      var updates = JSON.parse(e.data);
      for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        var el = document.getElementById('price-' + u.itemId);
        if (el) {
          el.textContent = '£' + (u.newPricePence / 100).toFixed(2);
          el.classList.remove('updated');
          void el.offsetWidth;
          el.classList.add('updated');
        }
      }
    });
  </script>
</body>
</html>`;
}

/** Light “app style” layout aligned with the menu editor preview (legacy + structured). */
export function renderPublicMenuHtml(
  venue: typeof schema.venues.$inferSelect,
  built: BuiltPublicMenu,
  forDate: string,
): string {
  const brandColor = venue.brandColor || '#6366f1';
  const venueName = escapeHtml(venue.name);
  const menuStyle = normalizedPublicMenuStyle(venue);

  if (built.mode === 'empty') {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${venueName} — Menu</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f4f4f5; color: #18181b; min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 24px; }
    .card { background: #fff; border-radius: 16px; padding: 32px; max-width: 400px; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.06); }
    h1 { font-size: 18px; margin-bottom: 8px; }
    p { color: #71717a; font-size: 14px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>${escapeHtml(built.menuTitle)}</h1>
    <p>${escapeHtml(built.message)}</p>
    <p style="margin-top:12px;font-size:12px;">${escapeHtml(forDate)}</p>
  </div>
</body>
</html>`;
  }

  if (built.mode === 'legacy') {
    const categories: LightMenuCategory[] = built.legacyCategories.map((cat, i) => ({
      id: `leg-${i}`,
      name: cat.name,
      items: cat.items,
    }));
    return renderLightMenuDocument(venue, {
      brandColor,
      venueNameEscaped: venueName,
      menuTitleEscaped: escapeHtml(built.menuTitle),
      subtitleEscaped: `Live menu · ${escapeHtml(forDate)}`,
      categories,
      menuStyle,
    });
  }

  const subtitle = built.menuDescription
    ? escapeHtml(built.menuDescription)
    : `Updated for ${escapeHtml(forDate)}`;

  return renderLightMenuDocument(venue, {
    brandColor,
    venueNameEscaped: venueName,
    menuTitleEscaped: escapeHtml(built.menuTitle),
    subtitleEscaped: subtitle,
    categories: built.structuredCategories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items,
    })),
    menuStyle,
  });
}

export function publicMenuToJsonPayload(
  venue: typeof schema.venues.$inferSelect,
  built: BuiltPublicMenu,
  forDate: string,
) {
  const baseVenue = {
    name: venue.name,
    slug: venue.slug,
    brandColor: venue.brandColor,
    publicMenuStyle: normalizedPublicMenuStyle(venue),
  };

  const itemShape = (item: MenuItemRow) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    currentPrice: item.currentPrice,
    description: item.description,
    isAvailable: item.isAvailable,
    imageUrl: item.imageUrl,
  });

  if (built.mode === 'legacy') {
    const items = built.legacyCategories.flatMap((c) => c.items.map(itemShape));
    return {
      forDate,
      mode: 'legacy' as const,
      effectiveMenuId: null as string | null,
      venue: baseVenue,
      items,
    };
  }

  if (built.mode === 'empty') {
    return {
      forDate,
      mode: 'empty' as const,
      effectiveMenuId: built.effectiveMenuId,
      venue: baseVenue,
      menuTitle: built.menuTitle,
      message: built.message,
      items: [] as ReturnType<typeof itemShape>[],
    };
  }

  return {
    forDate,
    mode: 'structured' as const,
    effectiveMenuId: built.effectiveMenuId,
    venue: baseVenue,
    menuName: built.menuTitle,
    menuDescription: built.menuDescription,
    categories: built.structuredCategories.map((c) => ({
      id: c.id,
      name: c.name,
      items: c.items.map(itemShape),
    })),
  };
}
