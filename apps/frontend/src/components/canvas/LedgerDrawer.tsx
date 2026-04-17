import { useEffect, useRef } from 'react';
import { X, ArrowRight, Paperclip, Briefcase } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { accountDisplayLabel } from './kaferLabels';
import { lexa } from '@/api/lexa';

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

const fmtDate = (s?: string) => {
  if (!s) return '';
  try {
    return new Date(s).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' });
  } catch {
    return s;
  }
};

export type LedgerSelection =
  | { kind: 'account'; accountId: string }
  | { kind: 'edge'; source: string; target: string }
  | null;

type Props = {
  selection: LedgerSelection;
  accounts: LedgerAccount[];
  entries: LedgerEntry[];
  onClose: () => void;
};

export function LedgerDrawer({ selection, accounts, entries, onClose }: Props) {
  const drawerRef = useRef<HTMLElement | null>(null);

  // Fermeture ESC + click extérieur
  useEffect(() => {
    if (!selection) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      // Ignorer les clicks sur nodes/edges react-flow (pour permettre de switcher
      // entre sélections sans fermer-rouvrir)
      const isCanvasNode = target.closest('.react-flow__node');
      const isCanvasEdge = target.closest('.react-flow__edge, .react-flow__edge-label');
      if (isCanvasNode || isCanvasEdge) return;
      if (drawerRef.current && !drawerRef.current.contains(target)) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [selection, onClose]);

  return (
    <AnimatePresence>
      {selection && (
        <motion.aside
          ref={drawerRef}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 280 }}
          className="absolute top-0 right-0 bottom-0 w-[380px] max-w-[90vw] bg-surface border-l border-border z-30 flex flex-col"
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-border">
            <div className="text-2xs uppercase tracking-wider text-subtle font-mono">
              {selection.kind === 'account' ? 'Compte' : 'Transactions agrégées'}
            </div>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-elevated text-subtle hover:text-ink transition-colors"
              aria-label="Fermer"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            {selection.kind === 'account' ? (
              <AccountDetails accountId={selection.accountId} accounts={accounts} entries={entries} />
            ) : (
              <EdgeDetails
                source={selection.source}
                target={selection.target}
                entries={entries}
              />
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

function AccountDetails({
  accountId,
  accounts,
  entries,
}: {
  accountId: string;
  accounts: LedgerAccount[];
  entries: LedgerEntry[];
}) {
  const account = accounts.find((a) => a.account === accountId);
  if (!account) return <div className="text-muted">Compte introuvable</div>;

  const txs = entries
    .filter((e) => e.account === accountId)
    .slice(0, 20);

  const code = account.account.match(/^(\d+)/)?.[1] ?? account.account;
  const rawLabel = account.account.replace(/^\d+\s*-\s*/, '').trim();
  const label = accountDisplayLabel(code, rawLabel);

  return (
    <>
      <div className="mb-6">
        <div className="text-2xs uppercase tracking-wider font-mono text-muted">{code}</div>
        <h2 className="text-lg font-semibold text-ink mt-0.5 break-words leading-tight">{label}</h2>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <Stat label="Solde" value={fmtChf(account.balance)} emphasize />
        <Stat label="Débit total" value={fmtChf(account.totalDebit)} />
        <Stat label="Crédit total" value={fmtChf(account.totalCredit)} />
      </div>

      <div className="text-2xs uppercase tracking-wider text-subtle font-mono mb-2">
        {txs.length > 0 ? `${txs.length} dernières transactions` : 'Aucune transaction'}
      </div>
      <ul className="space-y-1.5">
        {txs.map((tx) => (
          <TxRow key={`${tx.eventId}-${tx.lineType}`} tx={tx} />
        ))}
      </ul>
    </>
  );
}

function EdgeDetails({
  source,
  target,
  entries,
}: {
  source: string;
  target: string;
  entries: LedgerEntry[];
}) {
  // Transactions entre les 2 comptes (paire non-ordonnée debit→credit)
  const txs = entries.filter(
    (e) =>
      e.lineType === 'debit' &&
      ((e.account === target && e.counterpartAccount === source) ||
        (e.account === source && e.counterpartAccount === target)),
  );

  const total = txs.reduce((sum, t) => sum + t.amount, 0);
  const sourceCode = source.match(/^(\d+)/)?.[1] ?? source;
  const targetCode = target.match(/^(\d+)/)?.[1] ?? target;

  return (
    <>
      <div className="mb-6 flex items-center gap-3">
        <div className="mono-num text-sm text-ink font-semibold">{sourceCode}</div>
        <ArrowRight className="w-4 h-4 text-subtle" />
        <div className="mono-num text-sm text-ink font-semibold">{targetCode}</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6">
        <Stat label="Montant total" value={fmtChf(total)} emphasize />
        <Stat label="Transactions" value={`${txs.length}`} />
      </div>

      <div className="text-2xs uppercase tracking-wider text-subtle font-mono mb-2">
        Détail
      </div>
      <ul className="space-y-1.5">
        {txs.map((tx) => (
          <TxRow key={`${tx.eventId}-${tx.lineType}`} tx={tx} />
        ))}
      </ul>
    </>
  );
}

function Stat({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <div className="card-elevated px-3 py-2 min-w-0">
      <div className="text-2xs uppercase tracking-wider text-subtle font-mono truncate">{label}</div>
      <div
        className={`mono-num mt-1 truncate ${
          emphasize ? 'text-base font-semibold text-ink' : 'text-sm text-ink'
        }`}
      >
        {value}
      </div>
    </div>
  );
}

async function openDocument(documentId: string) {
  try {
    const blob = await lexa.downloadDocument(documentId);
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank', 'noopener,noreferrer');
    // Libérer l'URL après 60s (le browser garde une copie interne)
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    console.error('[LedgerDrawer] openDocument failed for', documentId);
  }
}

function TxRow({ tx }: { tx: LedgerEntry }) {
  return (
    <li className="flex items-start justify-between gap-2 px-3 py-2 rounded border border-border bg-bg hover:border-border-strong transition-colors">
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-2 text-2xs text-subtle font-mono">
          <span>{fmtDate(tx.occurredAt)}</span>
          <span className="text-muted">·</span>
          <span>{tx.lineType === 'debit' ? 'D' : 'C'}</span>
          {tx.documentId && (
            <button
              onClick={() => openDocument(tx.documentId!)}
              className="text-subtle hover:text-accent transition-colors"
              title="Voir la pièce justificative"
              aria-label="Ouvrir le document source"
            >
              <Paperclip className="w-3 h-3" />
            </button>
          )}
          {tx.source?.startsWith('swigs-pro-') && (
            <span
              className="inline-flex items-center gap-0.5 text-accent"
              title={`Source : ${tx.source}`}
            >
              <Briefcase className="w-3 h-3" />
              <span className="text-2xs font-mono">Pro</span>
            </span>
          )}
        </div>
        <div className="text-xs text-ink truncate mt-0.5" title={tx.description || '—'}>
          {tx.description || '—'}
        </div>
      </div>
      <div
        className={`mono-num text-xs font-medium whitespace-nowrap shrink-0 ${
          tx.lineType === 'debit' ? 'text-ink' : 'text-muted'
        }`}
      >
        {fmtChf(tx.amount)}
      </div>
    </li>
  );
}
