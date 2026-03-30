import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AppLayout } from '@/components/AppLayout';
import { useVenueStore } from '@/store/venueStore';
import { calendarDateLondon } from '@pricepulse/shared';
import { menusApi, scheduleApi, venueApi, type ScheduleTimeSwitch } from '@/lib/api';
import {
  Save,
  Eraser,
  ChevronLeft,
  ChevronRight,
  Palette,
  ArrowLeftRight,
  Clock,
  Plus,
  Trash2,
  X,
} from 'lucide-react';

// ─── Colour palette choices ───────────────────────────────────────────────────

const COLOR_PALETTE = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308',
  '#22c55e', '#14b8a6', '#3b82f6', '#6366f1',
  '#8b5cf6', '#ec4899', '#64748b', '#84cc16',
];

// ─── Types ────────────────────────────────────────────────────────────────────

interface MenuDef {
  id: string;
  name: string;
  color: string | null;
  isActive: boolean;
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function firstDayOfMonth(year: number, month: number): number {
  // 0 = Sun … shift so Mon = 0
  return (new Date(year, month, 1).getDay() + 6) % 7;
}

function addMonths(year: number, month: number, n: number): { year: number; month: number } {
  const d = new Date(year, month + n, 1);
  return { year: d.getFullYear(), month: d.getMonth() };
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DAY_LABELS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// ─── Single month calendar grid ───────────────────────────────────────────────

function isInRange(date: string, a: string, b: string): boolean {
  const lo = a < b ? a : b;
  const hi = a < b ? b : a;
  return date >= lo && date <= hi;
}

function normalizeSwitches(sw: ScheduleTimeSwitch[] | undefined): ScheduleTimeSwitch[] {
  return [...(sw ?? [])].sort((a, b) => a.hhmm.localeCompare(b.hhmm));
}

function switchesEqual(a: ScheduleTimeSwitch[] | undefined, b: ScheduleTimeSwitch[] | undefined): boolean {
  return JSON.stringify(normalizeSwitches(a)) === JSON.stringify(normalizeSwitches(b));
}

/** HTML `<input type="time">` value is HH:mm in local time; API expects same HH:mm string. */
function hhmmFromTimeInput(v: string): string | null {
  if (!v || !/^\d{2}:\d{2}$/.test(v)) return null;
  return v;
}

function MonthGrid({
  year,
  month,
  schedule,
  menus,
  paintingMenu,
  onDayEnter,
  onDayDown,
  today,
  rangeStart,
  rangeHoverEnd,
  activeMenuColor,
  hasTimeSwitches,
  selectedForSwitches,
}: {
  year: number;
  month: number;
  schedule: Record<string, string>;
  menus: MenuDef[];
  paintingMenu: string | null; // menu id or '__clear__'
  onDayEnter: (date: string) => void;
  onDayDown: (date: string) => void;
  today: string;
  rangeStart?: string | null;
  rangeHoverEnd?: string | null;
  activeMenuColor?: string | null;
  hasTimeSwitches?: (date: string) => boolean;
  selectedForSwitches?: string | null;
}) {
  const days    = daysInMonth(year, month);
  const firstDow = firstDayOfMonth(year, month);
  const menuMap  = new Map(menus.map((m) => [m.id, m]));

  const cells: React.ReactNode[] = [];

  // Leading empty cells (fixed width slot so rows align with headers)
  for (let i = 0; i < firstDow; i++) {
    cells.push(<div key={`e${i}`} className="w-8 h-8 shrink-0" aria-hidden />);
  }

  for (let d = 1; d <= days; d++) {
    const dateStr  = toDateStr(year, month, d);
    const menuId   = schedule[dateStr];
    const menu     = menuId ? menuMap.get(menuId) : undefined;
    const color    = menu?.color ?? null;
    const isPast   = dateStr < today;
    const isToday  = dateStr === today;

    // Range-select preview
    const isRangeAnchor  = rangeStart === dateStr;
    const inRangePreview = !!(rangeStart && rangeHoverEnd && isInRange(dateStr, rangeStart, rangeHoverEnd));
    const previewColor   = paintingMenu === '__clear__' ? '#ef4444' : (activeMenuColor ?? '#6366f1');
    const hasSw = hasTimeSwitches?.(dateStr);
    const isSwitchSelected = selectedForSwitches === dateStr;

    let bgStyle: React.CSSProperties = {};
    let extraClass = '';

    if (isRangeAnchor) {
      bgStyle = { backgroundColor: previewColor };
      extraClass = 'ring-2 ring-offset-1 ring-primary/60 text-white font-semibold';
    } else if (inRangePreview) {
      bgStyle = { backgroundColor: `${previewColor}55` };
      extraClass = 'text-gray-700 font-semibold scale-105';
    } else if (color) {
      bgStyle = { backgroundColor: color };
      extraClass = 'text-white font-semibold';
    }
    if (isSwitchSelected && !isRangeAnchor) {
      extraClass = `${extraClass} ring-2 ring-offset-2 ring-amber-500 ring-offset-white z-[1]`.trim();
    }

    cells.push(
      <div
        key={dateStr}
        data-date={dateStr}
        onMouseDown={() => onDayDown(dateStr)}
        onMouseEnter={() => onDayEnter(dateStr)}
        title={menu ? menu.name : dateStr}
        className={[
          'relative flex items-center justify-center rounded-full cursor-pointer select-none transition-all duration-100',
          'text-[11px] font-medium size-8 min-w-8 min-h-8 max-w-8 max-h-8 shrink-0 box-border',
          isPast ? 'opacity-40' : 'hover:scale-110',
          isToday && !isRangeAnchor ? 'ring-2 ring-offset-1 ring-primary/60' : '',
          !color && !inRangePreview && !isRangeAnchor ? 'text-gray-400 hover:bg-gray-100' : '',
          extraClass,
        ].join(' ')}
        style={Object.keys(bgStyle).length ? bgStyle : undefined}
      >
        {d}
        {hasSw && !isRangeAnchor && (
          <span
            className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500 ring-1 ring-white"
            title="Has time-based menu switches"
          />
        )}
        {isToday && !color && !isRangeAnchor && (
          <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-primary" />
        )}
      </div>,
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm min-w-[248px]">
      <div className="text-center mb-3">
        <span className="text-[13px] font-semibold text-gray-800 tracking-wide">
          {MONTH_NAMES[month]} {year}
        </span>
      </div>
      {/* Day-of-week header — centered tracks so columns align with day bubbles */}
      <div className="grid grid-cols-7 mb-1 justify-items-center gap-x-1">
        {DAY_LABELS.map((l) => (
          <div key={l} className="w-8 text-center text-[10px] font-semibold text-gray-400 uppercase tracking-widest py-0.5">
            {l}
          </div>
        ))}
      </div>
      {/* Day cells — justify-items-center + shrink-0 keeps circles round (grid stretch was squashing them) */}
      <div className="grid grid-cols-7 gap-y-1 gap-x-1 justify-items-center">
        {cells}
      </div>
    </div>
  );
}

// ─── Color picker popover ─────────────────────────────────────────────────────

function ColorPicker({
  current,
  onChange,
  onClose,
}: {
  current: string;
  onChange: (c: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2"
    >
      <div className="grid grid-cols-4 gap-1.5">
        {COLOR_PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => { onChange(c); onClose(); }}
            className={[
              'w-7 h-7 rounded-full border-2 transition-transform hover:scale-110',
              c === current ? 'border-gray-800 scale-110' : 'border-transparent',
            ].join(' ')}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Main Scheduler page ──────────────────────────────────────────────────────

export default function Scheduler() {
  const qc            = useQueryClient();
  const { selectedVenueId } = useVenueStore();
  const venueId       = selectedVenueId ?? '';

  // Local schedule state: date string → menuId (or removed from map = cleared)
  const [localSchedule, setLocalSchedule] = useState<Record<string, string>>({});
  /** Intra-day switches: from `hhmm` (24h) that row's menu applies until the next switch (base menu is before first switch). */
  const [localTimeSwitches, setLocalTimeSwitches] = useState<Record<string, ScheduleTimeSwitch[]>>({});
  const [dirty, setDirty] = useState(false);

  // Painting state
  const [activeMenu,    setActiveMenu]    = useState<string | null>(null); // null = eraser
  const [isPainting,    setIsPainting]    = useState(false);
  const [colorPickerFor, setColorPickerFor] = useState<string | null>(null);

  /** When on, clicking a day selects it for the time-switches panel (no painting). */
  const [switchSelectMode, setSwitchSelectMode] = useState(false);
  const [switchPanelDate, setSwitchPanelDate] = useState<string | null>(null);
  const [switchDraftTime, setSwitchDraftTime] = useState('');
  const [switchDraftMenuId, setSwitchDraftMenuId] = useState('');

  // Range-select mode
  const [rangeMode,     setRangeMode]     = useState(false);
  const [rangeStart,    setRangeStart]    = useState<string | null>(null);
  const [rangeHoverEnd, setRangeHoverEnd] = useState<string | null>(null);

  // Calendar window: always Jan–Dec of selected year
  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  /** Matches live QR `/menu/:slug` default `forDate` (Europe/London). */
  const today = calendarDateLondon();

  useEffect(() => {
    setSwitchPanelDate(null);
  }, [calYear]);

  // Fetch menus (with color)
  const { data: menusRaw = [] } = useQuery<MenuDef[]>({
    queryKey: ['menus', venueId],
    queryFn: () => menusApi.list(venueId).then((r) => r.data.data),
    enabled: !!venueId,
    staleTime: 30_000,
  });
  const menus = menusRaw;

  useEffect(() => {
    setSwitchDraftTime('');
    setSwitchDraftMenuId(menus[0]?.id ?? '');
  }, [switchPanelDate, menus]);

  // Build date range for schedule fetch: full selected year (Jan 1 → Dec 31)
  const rangeFrom = `${calYear}-01-01`;
  const rangeTo   = `${calYear}-12-31`;

  type ScheduleRow = { scheduleDate: string; menuId: string; timeSwitches?: ScheduleTimeSwitch[] | null };

  // Fetch existing schedule from DB
  const { data: scheduleRows = [] } = useQuery<ScheduleRow[]>({
    queryKey: ['schedule', venueId, rangeFrom, rangeTo],
    queryFn: () => scheduleApi.list(venueId, rangeFrom, rangeTo).then((r) => r.data.data as ScheduleRow[]),
    enabled: !!venueId,
    staleTime: 0,
  });

  // Hydrate local state when loaded range changes (including empty years)
  useEffect(() => {
    const map: Record<string, string> = {};
    const sw: Record<string, ScheduleTimeSwitch[]> = {};
    for (const row of scheduleRows) {
      map[row.scheduleDate] = row.menuId;
      sw[row.scheduleDate] = normalizeSwitches(row.timeSwitches ?? undefined);
    }
    setLocalSchedule(map);
    setLocalTimeSwitches(sw);
    setDirty(false);
  }, [scheduleRows]);

  // Auto-select first menu
  useEffect(() => {
    if (menus.length > 0 && activeMenu === null) setActiveMenu(menus[0].id);
  }, [menus, activeMenu]);

  // Local per-menu color overrides (before saving)
  const [colorOverrides, setColorOverrides] = useState<Record<string, string>>({});

  function getMenuColor(menu: MenuDef): string {
    return colorOverrides[menu.id] ?? menu.color ?? COLOR_PALETTE[0];
  }

  // Update menu color mutation
  const colorMutation = useMutation({
    mutationFn: ({ menuId, color }: { menuId: string; color: string }) =>
      menusApi.update(venueId, menuId, { color }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['menus', venueId] }),
    onError: () => toast.error('Failed to save menu colour'),
  });

  // Save schedule mutation
  const saveMutation = useMutation({
    mutationFn: (
      assignments: Array<{ date: string; menuId: string | null; timeSwitches?: ScheduleTimeSwitch[] }>,
    ) => scheduleApi.save(venueId, assignments),
    onSuccess: async () => {
      setDirty(false);
      qc.invalidateQueries({ queryKey: ['schedule', venueId] });
      try {
        await venueApi.updateQrMenuSettings(venueId, { useSchedule: true });
        qc.invalidateQueries({ queryKey: ['venue', venueId] });
        toast.success('Schedule saved — public QR will use these menu assignments.');
      } catch {
        toast.error('Schedule saved but QR settings failed to update. Enable “Follow menu schedule” on Integrations.');
      }
    },
    onError: () => toast.error('Failed to save schedule'),
  });

  // ── Paint helpers ──────────────────────────────────────────────────────────

  const paintDay = useCallback((date: string) => {
    if (!activeMenu) return;
    setLocalSchedule((prev) => {
      const next = { ...prev };
      if (activeMenu === '__clear__') {
        delete next[date];
      } else {
        next[date] = activeMenu;
      }
      return next;
    });
    if (activeMenu === '__clear__') {
      setLocalTimeSwitches((prev) => {
        const next = { ...prev };
        delete next[date];
        return next;
      });
      setSwitchPanelDate((d) => (d === date ? null : d));
    }
    setDirty(true);
  }, [activeMenu]);

  const applyRange = useCallback((startDate: string, endDate: string) => {
    if (!activeMenu) return;
    const lo = startDate < endDate ? startDate : endDate;
    const hi = startDate < endDate ? endDate : startDate;
    const [y0, mo0, d0] = lo.split('-').map((x) => parseInt(x, 10));
    const [y1, mo1, d1] = hi.split('-').map((x) => parseInt(x, 10));
    const start = new Date(y0, mo0 - 1, d0);
    const end = new Date(y1, mo1 - 1, d1);
    setLocalSchedule((prev) => {
      const next = { ...prev };
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
        if (activeMenu === '__clear__') {
          delete next[ds];
        } else {
          next[ds] = activeMenu;
        }
      }
      return next;
    });
    if (activeMenu === '__clear__') {
      setLocalTimeSwitches((prev) => {
        const next = { ...prev };
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
          delete next[ds];
        }
        return next;
      });
      setSwitchPanelDate((cur) => {
        if (!cur) return null;
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const ds = toDateStr(d.getFullYear(), d.getMonth(), d.getDate());
          if (ds === cur) return null;
        }
        return cur;
      });
    }
    setDirty(true);
  }, [activeMenu]);

  function handleDayDown(date: string) {
    if (rangeMode) {
      if (!rangeStart) {
        setRangeStart(date);
        setRangeHoverEnd(date);
      } else {
        applyRange(rangeStart, date);
        setRangeStart(null);
        setRangeHoverEnd(null);
      }
      return;
    }
    if (switchSelectMode) {
      setSwitchPanelDate(date);
      return;
    }
    setIsPainting(true);
    paintDay(date);
  }

  function handleDayEnter(date: string) {
    if (rangeMode && rangeStart) {
      setRangeHoverEnd(date);
      return;
    }
    if (isPainting) paintDay(date);
  }

  useEffect(() => {
    function up() { setIsPainting(false); }
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // ── Quick-fill helpers ─────────────────────────────────────────────────────

  function fillMonths(startMonth: number, endMonth: number) {
    if (!activeMenu || activeMenu === '__clear__') {
      toast.warning('Select a menu first before applying');
      return;
    }
    const next: Record<string, string> = { ...localSchedule };
    for (let m = startMonth; m <= endMonth; m++) {
      const days = daysInMonth(calYear, m);
      for (let day = 1; day <= days; day++) {
        next[toDateStr(calYear, m, day)] = activeMenu;
      }
    }
    setLocalSchedule(next);
    setDirty(true);
    const count = endMonth - startMonth + 1;
    toast.success(
      count === 12
        ? `Filled whole year ${calYear}`
        : `Filled ${MONTH_NAMES[startMonth]}${count > 1 ? ` – ${MONTH_NAMES[endMonth]}` : ''} ${calYear}`,
    );
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  function handleSave() {
    // Compute diff vs DB state
    const dbMap: Record<string, string> = {};
    const dbSwitches: Record<string, ScheduleTimeSwitch[]> = {};
    for (const row of scheduleRows) {
      dbMap[row.scheduleDate] = row.menuId;
      dbSwitches[row.scheduleDate] = normalizeSwitches(row.timeSwitches ?? undefined);
    }

    const assignments: Array<{ date: string; menuId: string | null; timeSwitches?: ScheduleTimeSwitch[] }> = [];

    // Days with a base menu: menu or time switches changed
    for (const [date, menuId] of Object.entries(localSchedule)) {
      const localSw = localTimeSwitches[date] ?? [];
      if (
        dbMap[date] !== menuId ||
        !switchesEqual(dbSwitches[date], localSw)
      ) {
        assignments.push({ date, menuId, timeSwitches: localSw });
      }
    }
    // Days that were cleared (in DB but not in local)
    for (const date of Object.keys(dbMap)) {
      if (!localSchedule[date]) assignments.push({ date, menuId: null });
    }

    // Save any pending color overrides
    for (const [menuId, color] of Object.entries(colorOverrides)) {
      colorMutation.mutate({ menuId, color });
    }
    setColorOverrides({});

    if (assignments.length === 0 && Object.keys(colorOverrides).length === 0) {
      toast.info('No changes to save');
      return;
    }

    if (assignments.length > 0) saveMutation.mutate(assignments);
  }

  // ── 12-month grid: always Jan–Dec of calYear ──────────────────────────────

  const months = Array.from({ length: 12 }, (_, i) => ({ year: calYear, month: i }));

  const activeMenuDef = menus.find((m) => m.id === activeMenu);
  const activeMenuColor = activeMenuDef ? getMenuColor(activeMenuDef) : null;

  function replaceSwitches(date: string, rows: ScheduleTimeSwitch[]) {
    setLocalTimeSwitches((prev) => ({ ...prev, [date]: normalizeSwitches(rows) }));
    setDirty(true);
  }

  const dayHasTimeSwitches = useCallback(
    (date: string) => (localTimeSwitches[date]?.length ?? 0) > 0,
    [localTimeSwitches],
  );

  function addSwitchFromDraft() {
    if (!switchPanelDate) return;
    if (!localSchedule[switchPanelDate]) {
      toast.error('Assign a base menu to this day on the calendar first.');
      return;
    }
    const hhmm = hhmmFromTimeInput(switchDraftTime.trim());
    if (!hhmm) {
      toast.error('Choose a valid time (HH:mm).');
      return;
    }
    if (!switchDraftMenuId) {
      toast.error('Choose a menu for this switch.');
      return;
    }
    const prev = localTimeSwitches[switchPanelDate] ?? [];
    if (prev.some((r) => r.hhmm === hhmm)) {
      toast.error('That time is already in the list.');
      return;
    }
    replaceSwitches(switchPanelDate, [...prev, { hhmm, menuId: switchDraftMenuId }]);
    setSwitchDraftTime('');
  }

  const panelSwitchRows =
    switchPanelDate ? normalizeSwitches(localTimeSwitches[switchPanelDate] ?? []) : [];

  return (
    <AppLayout>
      <div
        className="flex flex-col h-full"
        style={{ animation: 'page-enter 0.25s ease both' }}
        onMouseUp={() => setIsPainting(false)}
      >
        {/* ── Header ── */}
        <div className="h-14 border-b border-border flex items-center justify-between px-6 shrink-0 bg-white/80 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-[15px] font-semibold text-foreground tracking-tight">Menu Scheduler</h1>
              <p className="text-[11px] text-muted-foreground">
                Assign menus by date; use Time switches to change menu after a time (QR uses Europe/London “now”).
              </p>
            </div>
            {/* Year navigator */}
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg px-1 py-0.5">
              <button
                onClick={() => setCalYear((y) => y - 1)}
                className="p-1 rounded hover:bg-white hover:shadow transition text-gray-500 hover:text-gray-900"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-[13px] font-bold text-gray-800 px-2 tabular-nums">{calYear}</span>
              <button
                onClick={() => setCalYear((y) => y + 1)}
                className="p-1 rounded hover:bg-white hover:shadow transition text-gray-500 hover:text-gray-900"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-[11px] text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded-md px-2 py-0.5">
                Unsaved changes
              </span>
            )}
            <button
              onClick={handleSave}
              disabled={saveMutation.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[12px] font-semibold rounded-lg hover:bg-primary/90 transition disabled:opacity-60"
            >
              <Save className="h-3.5 w-3.5" />
              {saveMutation.isPending ? 'Saving…' : 'Save Schedule'}
            </button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          {/* ── Left panel ── */}
          <div className="w-56 shrink-0 border-r border-border flex flex-col bg-white overflow-y-auto">
            <div className="px-3 pt-4 pb-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2">
                Menus
              </p>

              {/* Eraser */}
              <button
                onClick={() => {
                  setActiveMenu('__clear__');
                  setRangeMode(false);
                  setRangeStart(null);
                  setRangeHoverEnd(null);
                  setSwitchSelectMode(false);
                }}
                className={[
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition mb-1',
                  activeMenu === '__clear__' && !rangeMode
                    ? 'bg-gray-900 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                <Eraser className="h-3.5 w-3.5 shrink-0" />
                <span>Eraser / Clear</span>
              </button>

              {/* Range select */}
              <button
                onClick={() => {
                  setRangeMode((v) => !v);
                  setRangeStart(null);
                  setRangeHoverEnd(null);
                  setSwitchSelectMode(false);
                }}
                className={[
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition mb-1',
                  rangeMode
                    ? 'bg-primary text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                <ArrowLeftRight className="h-3.5 w-3.5 shrink-0" />
                <span>
                  {rangeMode
                    ? rangeStart ? 'Click end date…' : 'Click start date…'
                    : 'Range Select'}
                </span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setSwitchSelectMode((v) => !v);
                  setRangeMode(false);
                  setRangeStart(null);
                  setRangeHoverEnd(null);
                  setIsPainting(false);
                }}
                className={[
                  'w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition mb-1.5',
                  switchSelectMode
                    ? 'bg-amber-600 text-white shadow'
                    : 'text-gray-600 hover:bg-gray-100',
                ].join(' ')}
              >
                <Clock className="h-3.5 w-3.5 shrink-0" />
                <span className="text-left leading-tight">
                  {switchSelectMode ? (switchPanelDate ? `Day: ${switchPanelDate}` : 'Click a day…') : 'Time switches'}
                </span>
              </button>

              {/* Menu list */}
              {menus.map((menu) => {
                const color = getMenuColor(menu);
                const isSelected = activeMenu === menu.id;
                return (
                  <div key={menu.id} className="relative group mb-0.5 flex items-center">
                    {/* Select button */}
                    <button
                      onClick={() => {
                        setActiveMenu(menu.id);
                        setRangeStart(null);
                        setRangeHoverEnd(null);
                        setSwitchSelectMode(false);
                      }}
                      className={[
                        'flex-1 flex items-center gap-2 px-2.5 py-2 rounded-lg text-[12px] font-medium transition text-left pr-7',
                        isSelected
                          ? 'bg-gray-900 text-white shadow'
                          : 'text-gray-700 hover:bg-gray-100',
                      ].join(' ')}
                    >
                      <span
                        className="w-3.5 h-3.5 rounded-full shrink-0 ring-1 ring-black/10"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate">{menu.name}</span>
                    </button>

                    {/* Colour-picker trigger — sibling, not nested */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setColorPickerFor(colorPickerFor === menu.id ? null : menu.id);
                      }}
                      title="Change colour"
                      className={[
                        'absolute right-1.5 p-0.5 rounded transition',
                        'opacity-0 group-hover:opacity-100',
                        isSelected ? 'opacity-100 text-white/70 hover:text-white' : 'text-gray-400 hover:text-gray-700',
                      ].join(' ')}
                    >
                      <Palette className="h-3 w-3" />
                    </button>

                    {/* Color popover */}
                    {colorPickerFor === menu.id && (
                      <ColorPicker
                        current={color}
                        onChange={(c) => {
                          setColorOverrides((prev) => ({ ...prev, [menu.id]: c }));
                          setColorPickerFor(null);
                        }}
                        onClose={() => setColorPickerFor(null)}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {/* ── Quick apply ── */}
            <div className="px-3 pt-4 pb-4 border-t border-border mt-2">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-2.5">
                Quick Apply
              </p>
              <p className="text-[10px] text-muted-foreground mb-2 leading-relaxed">
                Fills calendar months with the selected menu.
              </p>
              <div className="flex flex-col gap-0.5">
                {MONTH_NAMES.map((name, idx) => (
                  <button
                    key={idx}
                    onClick={() => fillMonths(idx, idx)}
                    className="text-left px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-600 hover:bg-primary/8 hover:text-primary transition"
                  >
                    {name}
                  </button>
                ))}
                <div className="mt-1 pt-1 border-t border-border flex flex-col gap-0.5">
                  {[
                    { label: 'Q1 (Jan–Mar)',   s: 0,  e: 2  },
                    { label: 'Q2 (Apr–Jun)',   s: 3,  e: 5  },
                    { label: 'Q3 (Jul–Sep)',   s: 6,  e: 8  },
                    { label: 'Q4 (Oct–Dec)',   s: 9,  e: 11 },
                    { label: 'Whole year',     s: 0,  e: 11 },
                  ].map(({ label, s, e }) => (
                    <button
                      key={label}
                      onClick={() => fillMonths(s, e)}
                      className="text-left px-2.5 py-1.5 rounded-lg text-[11px] font-semibold text-primary/80 hover:bg-primary/8 hover:text-primary transition"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* ── Calendar grid ── */}
          <div className="flex-1 min-w-0 overflow-y-auto overflow-x-auto bg-gray-50/60 p-5">
            {/* Legend */}
            <div className="flex flex-wrap gap-3 mb-5">
              {menus.map((menu) => (
                <div key={menu.id} className="flex items-center gap-1.5 text-[11px] text-gray-600 font-medium">
                  <span
                    className="w-3 h-3 rounded-full ring-1 ring-black/10"
                    style={{ backgroundColor: getMenuColor(menu) }}
                  />
                  {menu.name}
                </div>
              ))}
              <div className="flex items-center gap-1.5 text-[11px] text-gray-400 font-medium ml-1">
                <span className="w-3 h-3 rounded-full bg-gray-200" />
                No menu
              </div>
              <div className="flex items-center gap-1.5 text-[11px] text-amber-700 font-medium ml-1">
                <span className="w-2 h-2 rounded-full bg-amber-500 ring-1 ring-amber-200" />
                Dot = has time switches
              </div>
            </div>

            {/* Same-day time → menu switches (inline; no right sidebar) */}
            {(switchSelectMode || switchPanelDate) && (
              <div className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60 mb-0.5">
                      Same-day menu switches
                    </p>
                    <p className="text-[11px] text-muted-foreground max-w-xl">
                      After each time, that menu applies until the next switch (or end of day). Calendar colour is the
                      base menu before the first switch.
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {switchPanelDate && (
                      <button
                        type="button"
                        onClick={() => setSwitchPanelDate(null)}
                        className="text-[11px] text-gray-500 hover:text-gray-800 px-2 py-1 rounded-md hover:bg-gray-100"
                      >
                        Clear day
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setSwitchSelectMode(false);
                        setSwitchPanelDate(null);
                      }}
                      className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                      title="Close"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {!switchPanelDate && (
                  <p className="text-[12px] text-gray-500">
                    Click a date on the calendar to set times for that day.
                  </p>
                )}
                {switchPanelDate && !localSchedule[switchPanelDate] && (
                  <p className="text-[12px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2">
                    This day has no base menu yet. Paint a menu on it first, then add times below.
                  </p>
                )}
                {switchPanelDate && localSchedule[switchPanelDate] && (
                  <div className="flex flex-col lg:flex-row gap-4 lg:gap-8 lg:items-start">
                    <div className="shrink-0">
                      <div className="text-[13px] font-semibold text-gray-800 tabular-nums">{switchPanelDate}</div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Base menu:{' '}
                        <span className="font-medium text-gray-800">
                          {menus.find((m) => m.id === localSchedule[switchPanelDate])?.name ?? '—'}
                        </span>
                      </p>
                    </div>
                    <div className="flex-1 min-w-0 space-y-3 w-full">
                      <ul className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
                        {panelSwitchRows.map((row, i) => (
                          <li
                            key={`${row.hhmm}-${i}`}
                            className="flex flex-wrap items-center gap-2 p-2 rounded-lg border border-gray-200 bg-gray-50/80 sm:min-w-[240px]"
                          >
                            <input
                              type="time"
                              step={60}
                              value={row.hhmm}
                              onChange={(e) => {
                                const v = e.target.value;
                                if (!v || !switchPanelDate) return;
                                const rest = panelSwitchRows.filter((_, j) => j !== i);
                                if (rest.some((r) => r.hhmm === v)) {
                                  toast.error('Duplicate switch time on this day.');
                                  return;
                                }
                                const next = [...panelSwitchRows];
                                next[i] = { ...next[i], hhmm: v };
                                replaceSwitches(switchPanelDate, next);
                              }}
                              className="text-[12px] border border-gray-200 rounded-md px-1.5 py-1 bg-white tabular-nums shrink-0"
                            />
                            <select
                              value={row.menuId}
                              onChange={(e) => {
                                if (!switchPanelDate) return;
                                const next = [...panelSwitchRows];
                                next[i] = { ...next[i], menuId: e.target.value };
                                replaceSwitches(switchPanelDate, next);
                              }}
                              className="text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-white flex-1 min-w-[100px]"
                            >
                              {menus.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.name}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              title="Remove"
                              onClick={() => {
                                if (!switchPanelDate) return;
                                replaceSwitches(
                                  switchPanelDate,
                                  panelSwitchRows.filter((_, j) => j !== i),
                                );
                              }}
                              className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 shrink-0"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </li>
                        ))}
                      </ul>
                      <div className="flex flex-wrap items-end gap-2 pt-2 border-t border-gray-100">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Time</span>
                          <input
                            type="time"
                            step={60}
                            value={switchDraftTime}
                            onChange={(e) => setSwitchDraftTime(e.target.value)}
                            className="text-[12px] border border-gray-200 rounded-md px-1.5 py-1 bg-white tabular-nums"
                          />
                        </div>
                        <div className="flex flex-col gap-0.5 flex-1 min-w-[140px]">
                          <span className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">Menu</span>
                          <select
                            value={switchDraftMenuId}
                            onChange={(e) => setSwitchDraftMenuId(e.target.value)}
                            className="text-[11px] border border-gray-200 rounded-md px-2 py-1.5 bg-white w-full"
                          >
                            {menus.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <button
                          type="button"
                          onClick={addSwitchFromDraft}
                          className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-gray-900 text-white text-[11px] font-semibold hover:bg-gray-800 shrink-0"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          Add switch
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* min-w keeps each month wide enough for round day cells; horizontal scroll when view is narrow */}
            <div className="grid grid-cols-3 gap-4 w-full min-w-[760px]">
              {months.map(({ year, month }) => (
                <MonthGrid
                  key={`${year}-${month}`}
                  year={year}
                  month={month}
                  schedule={localSchedule}
                  menus={menus.map((m) => ({ ...m, color: getMenuColor(m) }))}
                  paintingMenu={activeMenu}
                  onDayDown={handleDayDown}
                  onDayEnter={handleDayEnter}
                  today={today}
                  rangeStart={rangeMode ? rangeStart : null}
                  rangeHoverEnd={rangeMode ? rangeHoverEnd : null}
                  activeMenuColor={activeMenuColor}
                  hasTimeSwitches={dayHasTimeSwitches}
                  selectedForSwitches={switchPanelDate}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
