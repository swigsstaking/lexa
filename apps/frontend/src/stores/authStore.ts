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

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  setAuth: (token: string, user: AuthUser) => void;
  logout: () => void;
};

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setAuth: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'lexa.auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
);

export function getAuthToken(): string | null {
  return useAuthStore.getState().token;
}
