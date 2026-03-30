import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

/** Matches recipe ingredient units plus common stock-count labels. */
export const INVENTORY_UNIT_PRESETS = [
  'g',
  'kg',
  'ml',
  'l',
  'ea',
  'portion',
  'oz',
  'lb',
  'tbsp',
  'tsp',
  'cup',
  'case',
  'box',
  'bottle',
  'keg',
] as const;

const CUSTOM = '__custom__';

const presetSet = new Set<string>(INVENTORY_UNIT_PRESETS);

function isPresetUnit(unit: string) {
  return presetSet.has(unit.trim());
}

/**
 * Preset unit dropdown plus optional text field when "Custom…" is chosen or current value is not a preset.
 */
export function InventoryUnitSelect({
  value,
  onChange,
  triggerClassName,
  inputClassName,
  id,
}: {
  value: string;
  onChange: (next: string) => void;
  triggerClassName?: string;
  inputClassName?: string;
  id?: string;
}) {
  const trimmed = value.trim();
  const preset = isPresetUnit(trimmed);
  const selectValue = preset ? trimmed : CUSTOM;

  return (
    <div className="space-y-2">
      <Select
        value={selectValue}
        onValueChange={(v) => {
          if (v === CUSTOM) {
            if (preset) onChange('');
          } else {
            onChange(v);
          }
        }}
      >
        <SelectTrigger id={id} className={cn('h-9 w-full text-sm', triggerClassName)}>
          <SelectValue placeholder="Choose unit" />
        </SelectTrigger>
        <SelectContent>
          {INVENTORY_UNIT_PRESETS.map((u) => (
            <SelectItem key={u} value={u}>
              {u}
            </SelectItem>
          ))}
          <SelectItem value={CUSTOM}>Custom…</SelectItem>
        </SelectContent>
      </Select>
      {selectValue === CUSTOM && (
        <input
          type="text"
          className={cn(
            'w-full h-9 text-sm border border-border rounded-lg px-3 bg-background outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 text-foreground',
            inputClassName,
          )}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="e.g. dozen, slab, 75cl bottle…"
          aria-label="Custom unit"
        />
      )}
    </div>
  );
}
