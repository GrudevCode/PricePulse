import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Sidebar } from './Sidebar';
import { useVenueStore } from '@/store/venueStore';
import { venueApi } from '@/lib/api';

// Expose sidebar width as a root CSS variable so portalled modals can read it
function useSidebarCssVar(width: number) {
  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', `${width}px`);
  }, [width]);
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { setVenues, setSelectedVenue } = useVenueStore();
  const [sidebarWidth, setSidebarWidth] = useState(224);
  const [collapsed, setCollapsed] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const layoutRef = useRef<HTMLDivElement | null>(null);

  // Keep venue list fresh (e.g. after adding a restaurant) and fix stale selection
  useEffect(() => {
    let cancelled = false;
    venueApi
      .list()
      .then((r) => {
        if (cancelled) return;
        const data = r.data.data ?? [];
        setVenues(data);
        if (data.length === 0) {
          setSelectedVenue(null);
          return;
        }
        const sel = useVenueStore.getState().selectedVenueId;
        if (!sel || !data.some((v: { id: string }) => v.id === sel)) {
          setSelectedVenue(data[0].id);
        }
      })
      .catch(() => {
        /* ignore – user may not be authed yet */
      });
    return () => {
      cancelled = true;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (!isResizing || !layoutRef.current || collapsed) return;
      const rect = layoutRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const min = 56;
      const max = 320;
      const next = Math.min(max, Math.max(min, x));
      setSidebarWidth(next);
    }
    function onMouseUp() {
      if (isResizing) setIsResizing(false);
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isResizing, collapsed]);

  const activeSidebarW = collapsed || sidebarWidth <= 120 ? 56 : sidebarWidth;
  useSidebarCssVar(activeSidebarW);

  return (
    <div
      ref={layoutRef}
      className="h-screen bg-background flex overflow-hidden"
    >
      <Sidebar
        width={collapsed || sidebarWidth <= 120 ? 56 : sidebarWidth}
        collapsed={collapsed || sidebarWidth <= 120}
        onToggleCollapse={() => setCollapsed((v) => !v)}
      />
      {/* Resize handle */}
      {!collapsed && (
        <div
          onMouseDown={() => setIsResizing(true)}
          className="w-px cursor-col-resize bg-border hover:bg-primary/40 transition-colors"
        />
      )}
      <div className="relative z-0 flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background isolate">
        {children}
      </div>
    </div>
  );
}
