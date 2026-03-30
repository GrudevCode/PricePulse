/** One intra-day switch: from this clock time (inclusive, Europe/London) use `menuId`. */
export type VenueScheduleTimeSwitch = { hhmm: string; menuId: string };

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map((x) => parseInt(x, 10));
  const hh = Number.isFinite(h) ? h : 0;
  const mm = Number.isFinite(m) ? m : 0;
  return hh * 60 + mm;
}

/**
 * Base menu applies from 00:00 until the first switch time; each switch updates the menu from that time onward (same day).
 * `timeHm` is 24h "HH:mm" in the same timezone context as the switches (Europe/London for live QR).
 */
export function effectiveMenuIdForTime(
  baseMenuId: string,
  timeSwitches: VenueScheduleTimeSwitch[] | null | undefined,
  timeHm: string,
): string {
  const sorted = [...(timeSwitches ?? [])].sort((a, b) => a.hhmm.localeCompare(b.hhmm));
  const t = hhmmToMinutes(timeHm);
  let effective = baseMenuId;
  for (const sw of sorted) {
    if (hhmmToMinutes(sw.hhmm) <= t) effective = sw.menuId;
  }
  return effective;
}

export function normalizeTimeSwitches(raw: unknown): VenueScheduleTimeSwitch[] {
  if (!Array.isArray(raw)) return [];
  const out: VenueScheduleTimeSwitch[] = [];
  for (const x of raw) {
    if (!x || typeof x !== 'object') continue;
    const o = x as Record<string, unknown>;
    if (typeof o.hhmm !== 'string' || typeof o.menuId !== 'string') continue;
    if (!/^\d{2}:\d{2}$/.test(o.hhmm)) continue;
    out.push({ hhmm: o.hhmm, menuId: o.menuId });
  }
  return out;
}
