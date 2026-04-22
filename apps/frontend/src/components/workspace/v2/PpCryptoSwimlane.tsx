import { useEffect, useState } from 'react';
import { fmtMoney } from './fmtMoney';
import { usePpCryptoWallets, usePpCryptoSnapshot, useRefreshCryptoSnapshot, useDeletePpCryptoWallet } from '@/api/ppImport';
import type { PpCryptoWallet } from '@/api/ppImport';
import { PpCryptoWalletForm } from './PpCryptoWalletForm';

const CHAIN_COLOR: Record<string, string> = {
  eth: 'oklch(0.55 0.14 280)',
  btc: 'oklch(0.65 0.18 50)',
  sol: 'oklch(0.55 0.18 155)',
};

interface Props {
  year?: number;
}

interface WalletRowProps {
  wallet: PpCryptoWallet;
  year: number;
}

function WalletRow({ wallet, year }: WalletRowProps) {
  const refreshMutation = useRefreshCryptoSnapshot();
  const deleteMutation = useDeletePpCryptoWallet();
  // Le backend queue un job async (~20-60s). On garde un état pending local
  // jusqu'à ce que lastSnapshot évolue OU 90s (timeout UX).
  const [refreshingSince, setRefreshingSince] = useState<number | null>(null);
  const lastSnapshotAt = wallet.lastSnapshot?.snapshottedAt ?? null;

  useEffect(() => {
    if (!refreshingSince) return;
    // Auto-reset quand le snapshot a évolué après le click
    if (lastSnapshotAt && new Date(lastSnapshotAt).getTime() > refreshingSince) {
      setRefreshingSince(null);
      return;
    }
    // Timeout dur à 90s pour ne pas bloquer l'UI si le job backend crash
    const hardTimeout = setTimeout(() => setRefreshingSince(null), 90_000);
    return () => clearTimeout(hardTimeout);
  }, [refreshingSince, lastSnapshotAt]);

  const isPending = refreshMutation.isPending || refreshingSince !== null;

  const snap = wallet.lastSnapshot;
  const chainColor = CHAIN_COLOR[wallet.chain] ?? 'rgb(var(--muted))';
  const shortAddr = wallet.address.length > 12
    ? `${wallet.address.slice(0, 6)}…${wallet.address.slice(-4)}`
    : wallet.address;

  const handleRefresh = () => {
    setRefreshingSince(Date.now());
    void refreshMutation.mutateAsync({ walletId: wallet.id, year });
  };

  const handleDelete = () => {
    void deleteMutation.mutateAsync(wallet.id);
  };

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        borderBottom: '1px solid rgb(var(--border, 229 229 222))',
      }}
    >
      {/* Chain badge */}
      <span
        style={{
          padding: '2px 6px',
          borderRadius: 4,
          background: `${chainColor}20`,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 10,
          fontWeight: 700,
          color: chainColor,
          textTransform: 'uppercase',
          flexShrink: 0,
        }}
      >
        {wallet.chain}
      </span>

      {/* Address + label */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: '"JetBrains Mono", monospace',
            fontSize: 11,
            color: 'rgb(var(--ink))',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={wallet.address}
        >
          {shortAddr}
        </div>
        {wallet.label && (
          <div style={{ fontSize: 11, color: 'rgb(var(--subtle))', marginTop: 1 }}>
            {wallet.label}
          </div>
        )}
      </div>

      {/* Snapshot CHF */}
      {snap ? (
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 13,
              fontWeight: 500,
              color: 'rgb(var(--ink))',
            }}
          >
            {fmtMoney(snap.balanceChf)}
          </div>
          <div style={{ fontSize: 10, color: 'rgb(var(--subtle))' }}>
            {snap.balanceNative} {wallet.chain.toUpperCase()}
          </div>
        </div>
      ) : (
        <span style={{ fontSize: 11, color: 'rgb(var(--subtle))', flexShrink: 0 }}>
          Pas de snapshot
        </span>
      )}

      {/* Refresh button */}
      <button
        onClick={handleRefresh}
        disabled={isPending}
        title={isPending ? 'Snapshot en cours… (lookup blockchain 20–60 s)' : 'Rafraîchir le snapshot'}
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid rgb(var(--border))',
          background: 'transparent',
          cursor: isPending ? 'wait' : 'pointer',
          display: 'grid',
          placeItems: 'center',
          fontSize: 12,
          color: 'rgb(var(--muted))',
          flexShrink: 0,
          opacity: isPending ? 0.5 : 1,
        }}
      >
        {isPending ? '…' : '↻'}
      </button>

      {/* Delete button */}
      <button
        onClick={handleDelete}
        disabled={deleteMutation.isPending}
        title="Supprimer ce wallet"
        style={{
          width: 28,
          height: 28,
          borderRadius: 6,
          border: '1px solid rgb(var(--border))',
          background: 'transparent',
          cursor: deleteMutation.isPending ? 'not-allowed' : 'pointer',
          display: 'grid',
          placeItems: 'center',
          fontSize: 11,
          color: 'rgb(var(--muted))',
          flexShrink: 0,
          opacity: deleteMutation.isPending ? 0.5 : 1,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function PpCryptoSwimlane({ year }: Props) {
  const currentYear = year ?? new Date().getFullYear();
  const [showForm, setShowForm] = useState(false);
  const [refreshAllSince, setRefreshAllSince] = useState<number | null>(null);

  const { data: wallets, isLoading: walletsLoading } = usePpCryptoWallets();
  const { data: snapshot, isLoading: snapLoading } = usePpCryptoSnapshot(currentYear - 1);
  const refreshAll = useRefreshCryptoSnapshot();

  const totalChf = snapshot?.totalChf ?? 0;
  const walletList = wallets ?? [];
  const isLoading = walletsLoading || snapLoading;
  // Dernier snapshot mis à jour (max des snapshottedAt de tous les wallets)
  const latestSnapshotAt = Math.max(
    0,
    ...(snapshot?.snapshots ?? []).map((s) => new Date(s.snapshottedAt).getTime()),
  );
  const isRefreshingAll = refreshAll.isPending || refreshAllSince !== null;

  useEffect(() => {
    if (!refreshAllSince) return;
    if (latestSnapshotAt > refreshAllSince) {
      setRefreshAllSince(null);
      return;
    }
    const hardTimeout = setTimeout(() => setRefreshAllSince(null), 90_000);
    return () => clearTimeout(hardTimeout);
  }, [refreshAllSince, latestSnapshotAt]);

  const handleRefreshAll = () => {
    setRefreshAllSince(Date.now());
    for (const w of walletList) {
      void refreshAll.mutateAsync({ walletId: w.id, year: currentYear - 1 });
    }
  };

  return (
    <>
      <div
        style={{
          background: 'rgb(var(--surface))',
          border: '1px solid rgb(var(--border))',
          borderRadius: 12,
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid rgb(var(--border))',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'rgb(var(--ink))' }}>
              Crypto
            </span>
            <span style={{ fontSize: 11, color: 'rgb(var(--subtle))', fontFamily: '"JetBrains Mono", monospace' }}>
              {walletList.length} wallet{walletList.length !== 1 ? 's' : ''}
            </span>
            {snapshot && (
              <span style={{ fontSize: 10, color: 'rgb(var(--subtle))' }}>
                · snapshot au 31.12.{currentYear - 1}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {totalChf > 0 && (
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 13,
                  fontVariantNumeric: 'tabular-nums',
                  fontWeight: 500,
                  color: 'rgb(var(--ink))',
                }}
              >
                {fmtMoney(totalChf)}{' '}
                <span style={{ fontSize: 10, color: 'rgb(var(--subtle))', fontWeight: 400 }}>CHF</span>
              </span>
            )}
            {walletList.length > 0 && (
              <button
                onClick={handleRefreshAll}
                disabled={isRefreshingAll}
                title={isRefreshingAll ? 'Snapshots en cours… (lookup blockchain 20–60 s)' : 'Rafraîchir tous les snapshots'}
                style={{
                  padding: '4px 10px',
                  borderRadius: 6,
                  border: '1px solid rgb(var(--border))',
                  background: 'transparent',
                  cursor: isRefreshingAll ? 'wait' : 'pointer',
                  fontSize: 11,
                  color: 'rgb(var(--muted))',
                  opacity: isRefreshingAll ? 0.6 : 1,
                }}
              >
                {isRefreshingAll ? '… Refresh en cours' : '↻ Refresh'}
              </button>
            )}
            <button
              onClick={() => setShowForm(true)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--lexa, #d4342c)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: 11,
                fontWeight: 600,
              }}
            >
              + Ajouter wallet
            </button>
          </div>
        </div>

        {/* Wallets */}
        {isLoading ? (
          <div style={{ padding: '16px', fontSize: 12, color: 'rgb(var(--muted))' }}>
            Chargement…
          </div>
        ) : walletList.length === 0 ? (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              fontSize: 12,
              color: 'rgb(var(--subtle))',
            }}
          >
            Aucun wallet enregistré · ajoutez votre premier wallet pour obtenir un snapshot CHF au 31.12
          </div>
        ) : (
          <div>
            {walletList.map((w) => (
              <WalletRow key={w.id} wallet={w} year={currentYear - 1} />
            ))}
          </div>
        )}
      </div>

      {showForm && (
        <PpCryptoWalletForm
          onClose={() => setShowForm(false)}
          onAdded={() => setShowForm(false)}
        />
      )}
    </>
  );
}
