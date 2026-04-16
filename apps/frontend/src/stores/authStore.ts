import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
      setAuth: (token, user) => set({ token, user, activeTenantId: user.tenantId }),
      setToken: (token, activeTenantId) => set({ token, activeTenantId }),
      logout: () => set({ token: null, user: null, activeTenantId: null }),
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
