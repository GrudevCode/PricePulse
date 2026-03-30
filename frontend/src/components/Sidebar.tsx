import { Link, useLocation } from 'react-router-dom';
import { VenueSwitcher } from '@/components/VenueSwitcher';
import { useAuthStore } from '@/store/authStore';
import { useClerk } from '@clerk/react';
import { useVenueStore } from '@/store/venueStore';
import { cn } from '@/lib/utils';
import {
  Zap, LayoutDashboard, Link2,
  Settings, LogOut, CalendarDays, Package,
  BedDouble, HeadphonesIcon, ChevronRight, CalendarRange, Database,
  Brain, SlidersHorizontal, BookOpen, ClipboardList, Building2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NavItem {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  href: string;
  indent?: boolean;
  hotelOnly?: boolean;
  comingSoon?: boolean;
}

function NavLink({
  item,
  isActive,
  isHotel,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  isHotel: boolean;
  collapsed: boolean;
}) {
  if (item.hotelOnly && !isHotel) return null;

  return (
    <Link
      to={item.href === '#' ? '#' : item.href}
      onClick={(e) => item.href === '#' && e.preventDefault()}
      className={cn(
        'group flex items-center px-2.5 py-2 rounded-md text-sm transition-all duration-150 relative',
        collapsed ? 'justify-center gap-0' : 'gap-2.5',
        item.indent && 'ml-3 pl-2.5 border-l border-border/60',
        isActive
          ? 'bg-primary/12 text-primary font-medium shadow-sm border border-primary/15'
          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80',
        item.comingSoon && 'opacity-40 cursor-default pointer-events-none'
      )}
    >
      <item.icon className={cn(
        'h-[15px] w-[15px] shrink-0 transition-colors',
        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
      )} />
      {!collapsed && (
        <>
          <span className="hidden lg:block truncate text-[13px] font-medium leading-tight tracking-[-0.01em]">
            {item.label}
          </span>
          {item.comingSoon && (
            <span className="hidden lg:block ml-auto text-[9px] text-muted-foreground/50 bg-muted border border-border/60 rounded px-1.5 py-0.5 shrink-0 font-medium">
              Soon
            </span>
          )}
          {isActive && !item.comingSoon && (
            <ChevronRight className="hidden lg:block h-3 w-3 ml-auto text-primary/50 shrink-0" />
          )}
        </>
      )}
    </Link>
  );
}

function SectionLabel({ label, collapsed }: { label: string; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div className="hidden lg:block px-2.5 pt-4 pb-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/50">
        {label}
      </span>
    </div>
  );
}

export function Sidebar({
  width,
  collapsed,
  onToggleCollapse,
}: {
  width: number;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { signOut } = useClerk();
  const { selectedVenueId, venues } = useVenueStore();

  // Use || (not ??) so empty strings are treated as falsy and we fall through correctly
  const urlVenueId = location.pathname.match(/^\/venues\/([^/]+)/)?.[1] || '';
  const vid = selectedVenueId || urlVenueId || venues[0]?.id || '';

  const currentVenue = venues.find((v) => v.id === vid);
  const isHotel = String(currentVenue?.cuisineType ?? '').toLowerCase() === 'hotel';

  function isActive(path: string) {
    if (path === '#') return false;
    return location.pathname === path || location.pathname.startsWith(path + '/');
  }

  const handleLogout = () => {
    logout();
    void signOut({ redirectUrl: '/login' });
  };

  const displayName = user?.name ?? 'Guest';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0]?.toUpperCase() ?? '')
    .join('');

  const NAV: Array<NavItem | { divider: true; label: string }> = [
    { icon: LayoutDashboard,      label: 'Dashboard',          href: '/home' },
    { icon: SlidersHorizontal,    label: 'Optimizers',         href: '/optimizers' },
    { icon: Brain,                label: 'Intelligence',       href: '/intelligence', comingSoon: true },

    { divider: true, label: 'Menu' },
    { icon: BookOpen,             label: 'Menu Editor',        href: '/dashboard' },
    { icon: CalendarRange,        label: 'Menu Scheduler',     href: '/scheduler' },

    { divider: true, label: 'Booking' },
    { icon: CalendarDays,         label: 'Booking Editor',     href: vid ? `/venues/${vid}/bookings` : '#' },
    { icon: Database,             label: 'Booking Database',   href: vid ? `/venues/${vid}/booking-database` : '#' },

    { divider: true, label: 'Order' },
    { icon: ClipboardList,        label: 'Order Editor',       href: vid ? `/venues/${vid}/orders` : '#' },
    { icon: Database,             label: 'Order Database',     href: vid ? `/venues/${vid}/order-database` : '#' },

    { divider: true, label: 'Inventory' },
    { icon: Package,              label: 'Inventory Editor',   href: vid ? `/venues/${vid}/inventory` : '#' },
    { icon: Database,             label: 'Inventory Database', href: vid ? `/venues/${vid}/inventory-database` : '#' },

    { divider: true, label: 'System' },
    { icon: BedDouble,            label: 'Dynamic Room Analysis', href: vid ? `/venues/${vid}/rooms` : '#',  comingSoon: true, hotelOnly: true },
    { icon: Link2,                label: 'Integrations',       href: vid ? `/venues/${vid}/integrations` : '#' },
    { icon: HeadphonesIcon,       label: 'Support',            href: '/support' },
    { icon: Settings,             label: 'Settings',           href: vid ? `/venues/${vid}/settings` : '#' },
  ];

  return (
    <aside
      className="shrink-0 border-r border-border flex flex-col bg-sidebar h-screen sticky top-0"
      style={{ width }}
    >
      {/* Logo */}
      <div className="h-14 px-3 border-b border-border flex items-center gap-2">
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <div className="w-7 h-7 rounded-lg bg-primary/12 border border-primary/20 flex items-center justify-center shrink-0">
            <Zap className="h-3.5 w-3.5 text-primary" />
          </div>
          {!collapsed && (
            <span className="font-bold text-[15px] hidden lg:block gradient-text tracking-tight">
              PricePulse
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapse}
          className="ml-1 text-[11px] text-muted-foreground/60 hover:text-foreground px-1.5 py-0.5 rounded-md hover:bg-secondary transition-colors hidden lg:inline-flex font-mono"
        >
          {collapsed ? '»' : '«'}
        </button>
      </div>

      {/* Venue switcher + add restaurant */}
      {!collapsed ? (
        <div className="hidden min-w-0 overflow-hidden lg:block border-b border-border/60 px-2 pb-2 pt-1">
          <VenueSwitcher stacked triggerClassName="h-9 w-full min-w-0 text-xs" />
        </div>
      ) : (
        <div className="flex justify-center border-b border-border/60 py-2">
          <Link
            to="/venues/new"
            title="Add restaurant"
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-primary"
          >
            <Building2 className="h-4 w-4" />
          </Link>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 px-2 py-2 overflow-y-auto space-y-0.5">
        {NAV.map((item, i) => {
          if ('divider' in item) {
            return <SectionLabel key={`div-${i}`} label={item.label} collapsed={collapsed} />;
          }
          return (
            <NavLink
              key={item.label}
              item={item}
              isActive={isActive(item.href)}
              isHotel={isHotel}
              collapsed={collapsed}
            />
          );
        })}
      </nav>

      {/* Profile + logout at bottom (aligned with nav links) */}
      <div className="px-2.5 py-3 border-t border-border/80">
        <div className="flex items-center gap-2 px-0 py-0 rounded-md text-[13px] text-muted-foreground">
          {!collapsed && (
            <>
              <button
                type="button"
                onClick={() => vid && navigate(`/venues/${vid}/settings`)}
                className="flex items-center gap-2 flex-1 rounded-md hover:bg-secondary px-1 py-1 transition-colors"
              >
                <span className="w-7 h-7 rounded-full bg-primary/10 border border-primary/30 flex items-center justify-center text-[11px] font-semibold text-primary mr-2">
                  {initials || 'PP'}
                </span>
                <span className="truncate text-[13px] font-medium">{displayName}</span>
              </button>
              <button
                type="button"
                onClick={handleLogout}
                className="ml-1 inline-flex items-center justify-center w-7 h-7 rounded-md text-[11px] text-muted-foreground/80 hover:text-destructive hover:bg-destructive/5 border border-border/60"
                title="Logout"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            </>
          )}
          {collapsed && (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center rounded-md text-[11px] text-muted-foreground/80 hover:text-destructive hover:bg-destructive/5 border border-border/60"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
