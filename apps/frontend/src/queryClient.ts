/**
 * Singleton QueryClient — partagé entre main.tsx, authStore, et Login.tsx
 * BUG-P1-01 : permet l'invalidation du cache TanStack Query lors des changements d'auth
 */

import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});
