import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface Venue {
  id: string;
  name: string;
  slug: string;
  pricingMode: 'auto' | 'suggest' | 'manual';
  currentOccupancyPct: number;
  capacity: number;
  brandColor?: string | null;
  /** Guest / QR menu theme */
  publicMenuStyle?: string | null;
  [key: string]: unknown;
}

interface VenueState {
  selectedVenueId: string | null;
  venues: Venue[];
  setSelectedVenue: (id: string | null) => void;
  setVenues: (venues: Venue[]) => void;
  updateVenue: (id: string, updates: Partial<Venue>) => void;
}

export const useVenueStore = create<VenueState>()(
  persist(
    (set) => ({
      selectedVenueId: null,
      venues: [],
      setSelectedVenue: (id) => set({ selectedVenueId: id }),
      setVenues: (venues) => set({ venues }),
      updateVenue: (id, updates) =>
        set((state) => ({
          venues: state.venues.map((v) => (v.id === id ? { ...v, ...updates } : v)),
        })),
    }),
    {
      name: 'pp-venue',
      // Persist both the selected ID and the venues list so sidebar links always work
      partialize: (state) => ({ selectedVenueId: state.selectedVenueId, venues: state.venues }),
    }
  )
);
