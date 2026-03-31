import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'sonner';
import { useUser } from '@clerk/react';
import { useAuthStore } from '@/store/authStore';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Home from '@/pages/Home';
import Dashboard from '@/pages/Dashboard';
import Scheduler from '@/pages/Scheduler';
import BookingDatabase from '@/pages/BookingDatabase';
import InventoryDatabase from '@/pages/InventoryDatabase';
import NewVenue from '@/pages/NewVenue';
import MenuManagement from '@/pages/MenuManagement';
import History from '@/pages/History';
import Integrations from '@/pages/Integrations';
import BookingAnalysis from '@/pages/BookingAnalysis';
import TransactionAnalysis from '@/pages/TransactionAnalysis';
import InventoryAnalysis from '@/pages/InventoryAnalysis';
import InventoryItemPage from '@/pages/InventoryItemPage';
import OrderEditor from '@/pages/OrderEditor';
import OrderDatabase from '@/pages/OrderDatabase';
import Support from '@/pages/Support';
import SettingsPage from '@/pages/SettingsPage';
import Optimizers from '@/pages/Optimizers';
import ForecastDemand from '@/pages/ForecastDemand';
import DynamicPricing from '@/pages/DynamicPricing';
import POS from '@/pages/POS';
import IntelligentMenu from '@/pages/IntelligentMenu';
import BookingOptimiser from '@/pages/BookingOptimiser';
import InventoryOptimiser from '@/pages/InventoryOptimiser';
import Intelligence from '@/pages/Intelligence';
import RecipeCalculator from '@/pages/RecipeCalculator';
import { RoomAnalysis } from '@/pages/ComingSoon';

/** Mirrors Clerk session into the Zustand store so legacy page code keeps working. */
function useSyncClerkToStore() {
  const { user: clerkUser, isSignedIn, isLoaded } = useUser();
  const syncFromClerk = useAuthStore((s) => s.syncFromClerk);
  const storeLogout   = useAuthStore((s) => s.logout);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn && clerkUser) {
      syncFromClerk(
        {
          id:    clerkUser.id,
          email: clerkUser.primaryEmailAddress?.emailAddress ?? '',
          name:  [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ').trim()
                 || clerkUser.username
                 || clerkUser.primaryEmailAddress?.emailAddress
                 || 'User',
        },
        true,
      );
      return;
    }
    // Signed out (or session cleared) — sync local store only. Do not call Clerk signOut() here:
    // firing it on every mount when already signed out breaks / confuses Clerk and can block the UI.
    storeLogout();
  }, [isLoaded, isSignedIn, clerkUser?.id]); // eslint-disable-line react-hooks/exhaustive-deps
}

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isLoaded, isSignedIn } = useUser();

  if (!isLoaded) {
    return <div className="min-h-screen bg-slate-950" aria-busy="true" aria-label="Loading session" />;
  }

  if (!isSignedIn) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function Auth({ children }: { children: React.ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}

export default function App() {
  useSyncClerkToStore();

  return (
    <BrowserRouter>
      <Toaster
        position="bottom-right"
        theme="dark"
        richColors
        closeButton
        toastOptions={{ duration: 8000 }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login"    element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Home dashboard */}
        <Route path="/home"      element={<Auth><Home /></Auth>} />

        {/* Dynamic Menu Pricing (main engine) */}
        <Route path="/dashboard" element={<Auth><Dashboard /></Auth>} />
        <Route path="/scheduler" element={<Auth><Scheduler /></Auth>} />

        {/* Venue setup */}
        <Route path="/venues/new" element={<Auth><NewVenue /></Auth>} />

        {/* Menu */}
        <Route path="/venues/:id/menu"         element={<Auth><MenuManagement /></Auth>} />

        {/* Dynamic analyses */}
        <Route path="/venues/:id/bookings"           element={<Auth><BookingAnalysis /></Auth>} />
        <Route path="/venues/:id/booking-database"   element={<Auth><BookingDatabase /></Auth>} />
        <Route path="/venues/:id/inventory-database" element={<Auth><InventoryDatabase /></Auth>} />
        <Route path="/venues/:id/orders"             element={<Auth><OrderEditor /></Auth>} />
        <Route path="/venues/:id/order-database"     element={<Auth><OrderDatabase /></Auth>} />
        <Route path="/venues/:id/transactions"       element={<Auth><TransactionAnalysis /></Auth>} />
        <Route path="/venues/:id/inventory"                  element={<Auth><InventoryAnalysis /></Auth>} />
        <Route path="/venues/:id/inventory/item/:itemId"     element={<Auth><InventoryItemPage /></Auth>} />
        <Route path="/venues/:id/rooms"              element={<Auth><RoomAnalysis /></Auth>} />

        {/* System */}
        <Route path="/venues/:id/integrations" element={<Auth><Integrations /></Auth>} />
        <Route path="/venues/:id/history"      element={<Auth><History /></Auth>} />
        <Route path="/venues/:id/settings"     element={<Auth><SettingsPage /></Auth>} />

        {/* Optimizers */}
        <Route path="/optimizers"                        element={<Auth><Optimizers /></Auth>} />
        <Route path="/optimizers/forecast-demand"        element={<Auth><ForecastDemand /></Auth>} />
        <Route path="/optimizers/dynamic-pricing"        element={<Auth><DynamicPricing /></Auth>} />
        <Route path="/optimizers/pos"                    element={<Auth><POS /></Auth>} />
        <Route path="/optimizers/price-history"          element={<Auth><POS /></Auth>} />
        <Route path="/optimizers/intelligent-menu"       element={<Auth><IntelligentMenu /></Auth>} />
        <Route path="/optimizers/booking-optimiser"      element={<Auth><BookingOptimiser /></Auth>} />
        <Route path="/optimizers/inventory-optimiser"    element={<Auth><InventoryOptimiser /></Auth>} />
        <Route path="/optimizers/recipe-calculator"      element={<Auth><RecipeCalculator /></Auth>} />
        <Route path="/intelligence"                      element={<Auth><Intelligence /></Auth>} />
        <Route path="/support"                           element={<Auth><Support /></Auth>} />

        {/* Fallback */}
        <Route path="/" element={<Navigate to="/home" replace />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
