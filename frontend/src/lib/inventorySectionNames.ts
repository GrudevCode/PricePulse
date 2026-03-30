/** Default section labels when a venue has no rows in `inventory_sections` and no items yet. */
export const DEFAULT_INVENTORY_SECTION_NAMES = [
  'Bar',
  'Cold Kitchen',
  'Desserts',
  'Hot Kitchen',
  'Prep',
] as const;

/**
 * Build the section dropdown list: API + categories from items; if still empty, use defaults.
 */
export function mergeInventorySectionNames(
  fromApi: string[],
  fromItemCategories: string[],
): string[] {
  const set = new Set<string>();
  for (const n of fromApi) {
    const t = n?.trim();
    if (t) set.add(t);
  }
  for (const n of fromItemCategories) {
    const t = n?.trim();
    if (t) set.add(t);
  }
  if (set.size === 0) {
    for (const n of DEFAULT_INVENTORY_SECTION_NAMES) set.add(n);
  }
  return [...set].sort((a, b) => a.localeCompare(b));
}

/** Preset rows for Inventory Editor when the API has no sections (same labels as defaults). */
export function defaultPresetSectionDefs(): { id: string; name: string }[] {
  return DEFAULT_INVENTORY_SECTION_NAMES.map((name) => ({
    id: `preset-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
  }));
}
