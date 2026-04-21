import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { lexa } from './lexa';
import type { PpImportRow, PpCryptoWallet, PpCryptoSnapshot } from './lexa';

export type { PpImportRow, PpCryptoWallet, PpCryptoSnapshot };

// ── Imports documents ────────────────────────────────────────────────────────

export function usePpImports() {
  return useQuery({
    queryKey: ['pp-imports'],
    queryFn: () => lexa.listPpImports(),
    refetchInterval: (query) => {
      const items = query.state.data?.items ?? [];
      const hasActive = items.some(
        (i) => i.status === 'pending' || i.status === 'processing',
      );
      return hasActive ? 3000 : false;
    },
    staleTime: 0,
  });
}

export function useUploadPpImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, category }: { file: File; category: string }) =>
      lexa.uploadPpImport(file, category),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pp-imports'] });
    },
  });
}

export function useValidatePpImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) =>
      lexa.validatePpImport(id, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pp-imports'] });
    },
  });
}

// ── Wallets crypto ───────────────────────────────────────────────────────────

export function usePpCryptoWallets() {
  return useQuery({
    queryKey: ['pp-crypto-wallets'],
    queryFn: () => lexa.listCryptoWallets(),
    staleTime: 60_000,
  });
}

export function useAddPpCryptoWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { chain: 'eth' | 'btc' | 'sol'; address: string; label: string }) =>
      lexa.addCryptoWallet(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pp-crypto-wallets'] });
      void queryClient.invalidateQueries({ queryKey: ['pp-crypto-snapshot'] });
    },
  });
}

export function useDeletePpCryptoWallet() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (walletId: string) => lexa.deleteCryptoWallet(walletId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pp-crypto-wallets'] });
      void queryClient.invalidateQueries({ queryKey: ['pp-crypto-snapshot'] });
    },
  });
}

// ── Snapshots crypto ─────────────────────────────────────────────────────────

export function usePpCryptoSnapshot(year: number) {
  return useQuery({
    queryKey: ['pp-crypto-snapshot', year],
    queryFn: () => lexa.getCryptoSnapshot(year),
    staleTime: 5 * 60_000,
  });
}

export function useRefreshCryptoSnapshot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ walletId, year }: { walletId: string; year: number }) =>
      lexa.refreshCryptoSnapshot(walletId, year),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['pp-crypto-snapshot'] });
    },
  });
}
