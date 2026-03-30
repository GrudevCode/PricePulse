/** Settings for the public QR menu URL (`/menu/:slug`). Stored on `venues.qr_menu_settings`. */
export type QrMenuSettings = {
  menuIds?: string[];
  useSchedule?: boolean;
  defaultMenuId?: string | null;
};

export function normalizeQrMenuSettings(raw: unknown): QrMenuSettings {
  if (!raw || typeof raw !== 'object') return {};
  const o = raw as Record<string, unknown>;
  const menuIds = Array.isArray(o.menuIds)
    ? o.menuIds.filter((x): x is string => typeof x === 'string')
    : undefined;
  return {
    menuIds,
    useSchedule: o.useSchedule === true,
    defaultMenuId:
      typeof o.defaultMenuId === 'string'
        ? o.defaultMenuId
        : o.defaultMenuId === null
          ? null
          : undefined,
  };
}

export function isStructuredQrMenu(s: QrMenuSettings): boolean {
  if (s.useSchedule) return true;
  if (s.defaultMenuId) return true;
  if (Array.isArray(s.menuIds) && s.menuIds.length > 0) return true;
  return false;
}

/**
 * Picks which menu UUID the QR URL should show for a given calendar day.
 * When this returns null, the host should fall back to the legacy “all items by legacy category” layout.
 */
export function resolveQrEffectiveMenuId(
  rawSettings: unknown,
  opts: { scheduledMenuId: string | null | undefined },
): string | null {
  const settings = normalizeQrMenuSettings(rawSettings);
  if (!isStructuredQrMenu(settings)) return null;

  const menuIds = settings.menuIds ?? [];
  const poolOpen = menuIds.length === 0;

  function pickAllowed(id: string | null | undefined): string | null {
    if (!id) return null;
    if (poolOpen) return id;
    return menuIds.includes(id) ? id : null;
  }

  if (settings.useSchedule) {
    const fromSched = pickAllowed(opts.scheduledMenuId ?? null);
    if (fromSched) return fromSched;
    const def = pickAllowed(settings.defaultMenuId ?? null);
    if (def) return def;
    if (menuIds.length > 0) return menuIds[0];
    return null;
  }

  return pickAllowed(settings.defaultMenuId ?? null) ?? (menuIds.length > 0 ? menuIds[0] : null);
}
