/**
 * Auth store — Clerk-backed.
 *
 * Keeps the same Zustand interface so existing page code (user, isAuthenticated,
 * accessToken checks) doesn't need to change. The store is populated by
 * useSyncClerkToStore() which is called once at the top of App.tsx.
 *
 * accessToken is set to a non-empty sentinel ('clerk') while a Clerk session is
 * active.  Pages that guard on `!!accessToken` continue to work correctly.
 * Actual API tokens are fetched via window.Clerk.session.getToken() in api.ts.
 */
import { create } from 'zustand';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

interface AuthState {
  user: AuthUser | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  setUser: (user: AuthUser) => void;
  setTokens: (access: string, refresh: string) => void;
  syncFromClerk: (user: AuthUser | null, isSignedIn: boolean) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  refreshToken: null,
  isAuthenticated: false,

  setUser: (user) => set({ user, isAuthenticated: true }),

  setTokens: (accessToken, refreshToken) => set({ accessToken, refreshToken }),

  /** Called by useSyncClerkToStore() whenever Clerk auth state changes. */
  syncFromClerk: (user, isSignedIn) =>
    set({
      user,
      isAuthenticated: isSignedIn,
      // Sentinel so legacy `!!accessToken` guards pass when Clerk session is active.
      accessToken: isSignedIn ? 'clerk' : null,
      refreshToken: null,
    }),

  logout: () =>
    set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),
}));
