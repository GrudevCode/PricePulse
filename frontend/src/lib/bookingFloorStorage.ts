/** localStorage key for floor-plan cache — scoped per venue so accounts/venues never share layout */
export function floorStorageKey(venueId: string | null | undefined): string {
  /* v5: invalidate cached layouts after removing DB/demo seed; DB is source of truth */
  return venueId ? `pp_floor_v5:${venueId}` : 'pp_floor_v5';
}
