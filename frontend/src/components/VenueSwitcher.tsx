import { Link } from 'react-router-dom';
import { useVenueStore } from '@/store/venueStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';

export function VenueSwitcher({
  className,
  triggerClassName,
  hideAddLink,
  /** Vertical layout: use in narrow sidebars so the add link stays inside the column */
  stacked = false,
}: {
  className?: string;
  triggerClassName?: string;
  hideAddLink?: boolean;
  stacked?: boolean;
}) {
  const { selectedVenueId, venues, setSelectedVenue } = useVenueStore();
  const value = selectedVenueId ?? '';

  return (
    <div
      className={cn(
        'flex min-w-0',
        stacked ? 'flex-col items-stretch gap-1.5' : 'items-center gap-2',
        className,
      )}
    >
      <Select value={value} onValueChange={(id) => setSelectedVenue(id)} disabled={venues.length === 0}>
        <SelectTrigger
          className={cn(
            'h-8',
            stacked ? 'w-full min-w-0' : 'min-w-[10rem]',
            triggerClassName,
          )}
        >
          <SelectValue placeholder={venues.length === 0 ? 'No venues yet' : 'Select venue'} />
        </SelectTrigger>
        <SelectContent>
          {venues.map((v) => (
            <SelectItem key={v.id} value={v.id}>
              {v.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hideAddLink && (
        <Link
          to="/venues/new"
          className={cn(
            'text-xs font-medium text-primary hover:underline',
            stacked ? 'truncate pl-0.5' : 'shrink-0 whitespace-nowrap',
          )}
        >
          + Add restaurant
        </Link>
      )}
    </div>
  );
}
