import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { queryClient } from '@/queryClient';

export type AuthUser = {
  id: string;
  email: string;
  tenantId: string;
  verified: boolean;
  createdAt: string;
  lastLoginAt: string | null;
};

// S32 : membership fiduciaire
export type FiduciaryClient = {
  tenantId: string;
  role: "owner" | "fiduciary" | "viewer";
  tenantName: string | null;
  addedAt: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  activeTenantId: string | null; // S32 : peut différer de user.tenantId après switch
  setAuth: (token: string, user: AuthUser) => void;
  setToken: (token: string, activeTenantId: string) => void; // S32 : après switch-tenant
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      activeTenantId: null,
      setAuth: (token, user) => {
        // Invalider le cache TanStack Query au login (évite fuites inter-sessions)
        queryClient.removeQueries();
        set({ token, user, activeTenantId: user.tenantId });
      },
      setToken: (token, activeTenantId) => {
        // Invalider le cache TanStack Query lors du switch tenant
        queryClient.removeQueries();
        set({ token, activeTenantId });
      },
      logout: () => {
        // Nuke complet du cache au logout — évite affichage données ex-session
        queryClient.removeQueries();
        set({ token: null, user: null, activeTenantId: null });
      },
    }),
    {
      name: 'lexa.auth',
      partialize: (s) => ({ token: s.token, user: s.user, activeTenantId: s.activeTenantId }),
    },
  ),
);

export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
