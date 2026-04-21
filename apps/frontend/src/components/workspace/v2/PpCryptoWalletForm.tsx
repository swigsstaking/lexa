import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useAddPpCryptoWallet } from '@/api/ppImport';

type Chain = 'eth' | 'btc' | 'sol';

const CHAINS: { value: Chain; label: string; placeholder: string }[] = [
  { value: 'eth', label: 'Ethereum (ETH)',  placeholder: '0x...' },
  { value: 'btc', label: 'Bitcoin (BTC)',   placeholder: 'bc1... ou 1...' },
  { value: 'sol', label: 'Solana (SOL)',    placeholder: 'Adresse base58...' },
];

interface Props {
  onClose: () => void;
  onAdded?: () => void;
}

export function PpCryptoWalletForm({ onClose, onAdded }: Props) {
  const [chain, setChain] = useState<Chain>('eth');
  const [address, setAddress] = useState('');
  const [label, setLabel] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const addMutation = useAddPpCryptoWallet();

  const selectedChain = CHAINS.find((c) => c.value === chain) ?? CHAINS[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address.trim()) {
      setToast('L\'adresse est requise.');
      return;
    }
    try {
      await addMutation.mutateAsync({ chain, address: address.trim(), label: label.trim() });
      onAdded?.();
      onClose();
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 503) {
        setToast('Backend pas encore prêt — réessayez dans quelques minutes.');
      } else if (status === 409) {
        setToast('Ce wallet est déjà enregistré.');
      } else {
        setToast('Erreur lors de l\'ajout. Vérifiez l\'adresse et réessayez.');
      }
    }
  };

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.5)',
          zIndex: 400,
          backdropFilter: 'blur(2px)',
        }}
      />
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'min(440px, 96vw)',
          background: 'rgb(var(--surface, 255 255 255))',
          border: '1px solid rgb(var(--border, 229 229 222))',
          borderRadius: 16,
          zIndex: 401,
          boxShadow: '0 24px 80px rgba(0,0,0,0.18)',
          animation: 'ppCryptoFormIn 0.18s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '18px 20px',
            borderBottom: '1px solid rgb(var(--border, 229 229 222))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <div style={{ fontWeight: 600, fontSize: 15, color: 'rgb(var(--ink, 10 10 10))' }}>
              Ajouter un wallet
            </div>
            <div style={{ fontSize: 11, color: 'rgb(var(--muted, 107 107 102))', marginTop: 2 }}>
              ETH, BTC ou SOL — snapshot annuel au 31.12
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgb(var(--border))',
              background: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              color: 'rgb(var(--muted))',
            }}
            title="Fermer"
          >
            ✕
          </button>
        </div>

        {/* Form */}
        <form onSubmit={(e) => void handleSubmit(e)} style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Chain selector */}
          <div>
            <label
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgb(var(--muted))',
                marginBottom: 6,
              }}
            >
              Blockchain
            </label>
            <div style={{ display: 'flex', gap: 6 }}>
              {CHAINS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => { setChain(c.value); setAddress(''); }}
                  style={{
                    flex: 1,
                    padding: '8px 6px',
                    borderRadius: 8,
                    border: `1px solid ${chain === c.value ? 'var(--lexa, #d4342c)' : 'rgb(var(--border))'}`,
                    background: chain === c.value ? 'rgba(212,52,44,0.06)' : 'rgb(var(--elevated))',
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: chain === c.value ? 600 : 400,
                    color: chain === c.value ? 'var(--lexa, #d4342c)' : 'rgb(var(--ink))',
                    transition: 'all 0.15s',
                  }}
                >
                  {c.value.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div>
            <label
              htmlFor="wallet-address"
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgb(var(--muted))',
                marginBottom: 6,
              }}
            >
              Adresse
            </label>
            <input
              id="wallet-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={selectedChain.placeholder}
              autoComplete="off"
              spellCheck={false}
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid rgb(var(--border))',
                background: 'rgb(var(--elevated))',
                color: 'rgb(var(--ink))',
                fontFamily: '"JetBrains Mono", monospace',
                fontSize: 12,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Label */}
          <div>
            <label
              htmlFor="wallet-label"
              style={{
                display: 'block',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'rgb(var(--muted))',
                marginBottom: 6,
              }}
            >
              Libellé <span style={{ fontWeight: 400, textTransform: 'none' }}>(optionnel)</span>
            </label>
            <input
              id="wallet-label"
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="ex: Wallet principal"
              style={{
                width: '100%',
                padding: '9px 12px',
                borderRadius: 8,
                border: '1px solid rgb(var(--border))',
                background: 'rgb(var(--elevated))',
                color: 'rgb(var(--ink))',
                fontSize: 13,
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: 8,
                border: '1px solid rgb(var(--border))',
                background: 'transparent',
                cursor: 'pointer',
                fontSize: 13,
                color: 'rgb(var(--muted))',
              }}
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={addMutation.isPending}
              style={{
                padding: '8px 18px',
                borderRadius: 8,
                border: 'none',
                background: 'var(--lexa, #d4342c)',
                color: '#fff',
                cursor: addMutation.isPending ? 'not-allowed' : 'pointer',
                fontSize: 13,
                fontWeight: 600,
                opacity: addMutation.isPending ? 0.7 : 1,
              }}
            >
              {addMutation.isPending ? 'Ajout…' : 'Ajouter le wallet'}
            </button>
          </div>
        </form>

        {/* Toast */}
        {toast && (
          <div
            style={{
              position: 'absolute',
              bottom: 16,
              left: 16,
              right: 16,
              background: 'rgb(var(--ink, 10 10 10))',
              color: '#fff',
              borderRadius: 8,
              padding: '10px 14px',
              fontSize: 12,
            }}
          >
            {toast}
          </div>
        )}
      </div>

      <style>{`
        @keyframes ppCryptoFormIn {
          from { opacity: 0; transform: translate(-50%, calc(-50% + 12px)); }
          to   { opacity: 1; transform: translate(-50%, -50%); }
        }
      `}</style>
    </>,
    document.body,
  );
}
