import { useEffect, useRef, useState } from 'react';
import {
  X,
  ArrowRight,
  Paperclip,
  Briefcase,
  Link2,
  Edit3,
  Link,
  Unlink,
  Check,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { accountDisplayLabel } from './kaferLabels';
import { lexa } from '@/api/lexa';
import { LedgerEntryEditor } from './LedgerEntryEditor';

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

type EditorState =
  | { mode: 'correct'; entry: LedgerEntry }
  | { mode: 'create' }
  | null;

type ContextMenu = {
  x: number;
  y: number;
  tx: LedgerEntry;
} | null;

type Props = {
  selection: LedgerSelection;
  accounts: LedgerAccount[];
  entries: LedgerEntry[];
  onClose: () => void;
  /** Si fourni, ouvre directement en édition pour ce streamId */
  autoCorrectStreamId?: string | null;
};

export function LedgerDrawer({
  selection,
  accounts,
  entries,
  onClose,
  autoCorrectStreamId,
}: Props) {
  const drawerRef = useRef<HTMLElement | null>(null);
  const queryClient = useQueryClient();

  const [editorState, setEditorState] = useState<EditorState>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu>(null);
  const [selectedStreamIds, setSelectedStreamIds] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [lettrageLoading, setLettrageLoading] = useState(false);

  // Auto-ouvrir en édition si autoCorrectStreamId est fourni
  useEffect(() => {
    if (!autoCorrectStreamId || !entries.length) return;
    const entry = entries.find((e) => e.streamId === autoCorrectStreamId);
    if (entry) {
      setEditorState({ mode: 'correct', entry });
    }
  }, [autoCorrectStreamId, entries]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // Fermeture ESC + click extérieur
  useEffect(() => {
    if (!selection) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null);
          return;
        }
        if (editorState) {
          setEditorState(null);
          return;
        }
        onClose();
      }
    }
    function onMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement;
      const isCanvasNode = target.closest('.react-flow__node');
      const isCanvasEdge = target.closest('.react-flow__edge, .react-flow__edge-label');
      if (isCanvasNode || isCanvasEdge) return;
      // Fermer context menu si click en dehors du menu lui-même
      // IMPORTANT : on vérifie que le click n'est PAS sur le menu avant de le fermer,
      // sinon mousedown ferme le menu avant que le click ne se déclenche sur les boutons.
      if (contextMenu) {
        const menuEl = (e.target as HTMLElement).closest('[data-context-menu]');
        if (!menuEl) {
          setContextMenu(null);
        }
        // Si le click est dans le menu, on laisse le click bubble normalement
        return;
      }
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
  }, [selection, onClose, contextMenu, editorState]);

  const handleLettrer = async () => {
    if (selectedStreamIds.size < 2) return;
    setLettrageLoading(true);
    try {
      const result = await lexa.lettrerEntries([...selectedStreamIds]);
      setToast({ kind: 'success', text: `Lettré ${result.letterRef}` });
      setSelectedStreamIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message ?? err.message
        : err instanceof Error ? err.message : 'Erreur inconnue';
      setToast({ kind: 'error', text: msg });
    } finally {
      setLettrageLoading(false);
    }
  };

  const handleUnlettrer = async (letterRef: string) => {
    if (!window.confirm(`Défaire le lettrage ${letterRef} ?`)) return;
    try {
      await lexa.unlettrerEntries(letterRef);
      setToast({ kind: 'success', text: `Lettrage ${letterRef} défait` });
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message ?? err.message
        : err instanceof Error ? err.message : 'Erreur inconnue';
      setToast({ kind: 'error', text: msg });
    }
  };

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
          {/* Header */}
          <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
            <div className="text-2xs uppercase tracking-wider text-subtle font-mono">
              {selection.kind === 'account' ? 'Compte' : 'Transactions agrégées'}
            </div>
            <div className="flex items-center gap-1">
              {/* Bouton "+ Nouvelle écriture" */}
              <button
                onClick={() => setEditorState({ mode: 'create' })}
                className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-accent hover:bg-elevated transition-colors"
                title="Nouvelle écriture manuelle"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Nouvelle</span>
              </button>
              <button
                onClick={onClose}
                className="p-2 rounded hover:bg-elevated text-subtle hover:text-ink transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Toast */}
          {toast && (
            <div
              className={`px-4 py-2 text-xs border-b flex-shrink-0 ${
                toast.kind === 'success'
                  ? 'bg-success/10 border-success/30 text-success'
                  : 'bg-danger/10 border-danger/30 text-danger'
              }`}
            >
              {toast.text}
            </div>
          )}

          <div className="flex-1 overflow-y-auto px-4 py-4 pb-20">
            {selection.kind === 'account' ? (
              <AccountDetails
                accountId={selection.accountId}
                accounts={accounts}
                entries={entries}
                selectedStreamIds={selectedStreamIds}
                onToggleSelect={(streamId, e) => {
                  if (!e.metaKey && !e.ctrlKey) return;
                  e.preventDefault();
                  setSelectedStreamIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(streamId)) next.delete(streamId);
                    else next.add(streamId);
                    return next;
                  });
                }}
                onContextMenu={(tx, x, y) => setContextMenu({ tx, x, y })}
                onCorrect={(tx) => setEditorState({ mode: 'correct', entry: tx })}
                onUnlettrer={handleUnlettrer}
              />
            ) : (
              <EdgeDetails
                source={selection.source}
                target={selection.target}
                entries={entries}
                selectedStreamIds={selectedStreamIds}
                onToggleSelect={(streamId, e) => {
                  if (!e.metaKey && !e.ctrlKey) return;
                  e.preventDefault();
                  setSelectedStreamIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(streamId)) next.delete(streamId);
                    else next.add(streamId);
                    return next;
                  });
                }}
                onContextMenu={(tx, x, y) => setContextMenu({ tx, x, y })}
                onCorrect={(tx) => setEditorState({ mode: 'correct', entry: tx })}
                onUnlettrer={handleUnlettrer}
              />
            )}
          </div>

          {/* Barre flottante multi-select */}
          <AnimatePresence>
            {selectedStreamIds.size >= 2 && (
              <motion.div
                initial={{ y: 80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 80, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="absolute bottom-0 left-0 right-0 px-4 py-3 bg-surface border-t border-border flex items-center justify-between gap-2 z-20"
              >
                <span className="text-xs text-ink">
                  <span className="font-semibold text-accent">{selectedStreamIds.size}</span> écritures sélectionnées
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStreamIds(new Set())}
                    className="text-xs text-muted hover:text-ink transition-colors px-2 py-1 rounded hover:bg-elevated"
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    onClick={handleLettrer}
                    disabled={lettrageLoading}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-violet-600 text-white hover:bg-violet-700 transition-colors disabled:opacity-60"
                  >
                    <Link className="w-3 h-3" />
                    Lettrer ces écritures
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Context menu flottant */}
          <AnimatePresence>
            {contextMenu && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.1 }}
                data-context-menu
                style={{
                  top: contextMenu.y,
                  // Clamp à droite : le drawer fait 380px max, le menu ~180px → max left = 380 - 180 - 8px margin
                  left: Math.min(contextMenu.x, 192),
                }}
                className="absolute z-50 min-w-[180px] rounded-lg border border-border bg-surface shadow-lg py-1"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <button
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-elevated transition-colors text-ink"
                  onClick={() => {
                    setEditorState({ mode: 'correct', entry: contextMenu.tx });
                    setContextMenu(null);
                  }}
                >
                  <Edit3 className="w-3.5 h-3.5 text-muted" />
                  Modifier
                </button>
                <button
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-elevated transition-colors text-ink"
                  onClick={() => {
                    const streamId = contextMenu.tx.streamId;
                    setSelectedStreamIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(streamId)) next.delete(streamId);
                      else next.add(streamId);
                      return next;
                    });
                    setContextMenu(null);
                  }}
                >
                  <Check className="w-3.5 h-3.5 text-muted" />
                  {selectedStreamIds.has(contextMenu.tx.streamId) ? 'Désélectionner' : 'Sélectionner pour lettrer'}
                </button>
                {contextMenu.tx.letterRef && (
                  <button
                    className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-elevated transition-colors text-danger"
                    onClick={() => {
                      handleUnlettrer(contextMenu.tx.letterRef!);
                      setContextMenu(null);
                    }}
                  >
                    <Unlink className="w-3.5 h-3.5" />
                    Défaire le lettrage
                  </button>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Editor slide-in (empilé par-dessus le drawer) */}
          <AnimatePresence>
            {editorState && (
              <LedgerEntryEditor
                mode={editorState.mode}
                entry={editorState.mode === 'correct' ? editorState.entry : undefined}
                onClose={() => setEditorState(null)}
              />
            )}
          </AnimatePresence>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

// ─── Sous-composants ─────────────────────────────────────────────────────────

type SharedRowProps = {
  selectedStreamIds: Set<string>;
  onToggleSelect: (streamId: string, e: React.MouseEvent) => void;
  onContextMenu: (tx: LedgerEntry, x: number, y: number) => void;
  onCorrect: (tx: LedgerEntry) => void;
  onUnlettrer: (letterRef: string) => void;
};

function AccountDetails({
  accountId,
  accounts,
  entries,
  ...rowProps
}: {
  accountId: string;
  accounts: LedgerAccount[];
  entries: LedgerEntry[];
} & SharedRowProps) {
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
      <p className="text-2xs text-muted mb-3">
        <kbd className="kbd">⌘+clic</kbd> pour sélectionner · clic droit pour actions
      </p>
      <ul className="space-y-1.5">
        {txs.map((tx) => (
          <TxRow
            key={`${tx.eventId}-${tx.lineType}`}
            tx={tx}
            {...rowProps}
          />
        ))}
      </ul>
    </>
  );
}

function EdgeDetails({
  source,
  target,
  entries,
  ...rowProps
}: {
  source: string;
  target: string;
  entries: LedgerEntry[];
} & SharedRowProps) {
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
      <p className="text-2xs text-muted mb-3">
        <kbd className="kbd">⌘+clic</kbd> pour sélectionner · clic droit pour actions
      </p>
      <ul className="space-y-1.5">
        {txs.map((tx) => (
          <TxRow
            key={`${tx.eventId}-${tx.lineType}`}
            tx={tx}
            {...rowProps}
          />
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
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch {
    console.error('[LedgerDrawer] openDocument failed for', documentId);
  }
}

function TxRow({
  tx,
  selectedStreamIds,
  onToggleSelect,
  onContextMenu,
}: { tx: LedgerEntry } & SharedRowProps) {
  const isSelected = selectedStreamIds.has(tx.streamId);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const rect = (e.currentTarget as HTMLElement).closest('aside')?.getBoundingClientRect();
    const relX = rect ? e.clientX - rect.left : e.clientX;
    const relY = rect ? e.clientY - rect.top : e.clientY;
    onContextMenu(tx, relX, relY);
  };

  return (
    <li
      className={`flex items-start justify-between gap-2 px-3 py-2 rounded border transition-colors cursor-default select-none ${
        isSelected
          ? 'border-accent bg-accent/5'
          : 'border-border bg-bg hover:border-border-strong'
      }`}
      onClick={(e) => onToggleSelect(tx.streamId, e)}
      onContextMenu={handleContextMenu}
    >
      <div className="min-w-0 flex-1 overflow-hidden">
        <div className="flex items-center gap-2 text-2xs text-subtle font-mono flex-wrap">
          <span>{fmtDate(tx.occurredAt)}</span>
          <span className="text-muted">·</span>
          <span>{tx.lineType === 'debit' ? 'D' : 'C'}</span>

          {/* Badge pièce justificative */}
          {tx.documentId && (
            <button
              onClick={(e) => { e.stopPropagation(); openDocument(tx.documentId!); }}
              className="text-subtle hover:text-accent transition-colors"
              title="Voir la pièce justificative"
              aria-label="Ouvrir le document source"
            >
              <Paperclip className="w-3 h-3" />
            </button>
          )}

          {/* Badge source Pro */}
          {tx.source?.startsWith('swigs-pro-') && (
            <span
              className="inline-flex items-center gap-0.5 text-accent"
              title={`Source : ${tx.source}`}
            >
              <Briefcase className="w-3 h-3" />
              <span className="text-2xs font-mono">Pro</span>
            </span>
          )}

          {/* Badge réconcilié */}
          {tx.reconciles && (
            <span
              className="inline-flex items-center gap-0.5 text-emerald-500"
              title={`Réconciliée — liée à la facture ${tx.reconciles.slice(0, 8)}…`}
            >
              <Link2 className="w-3 h-3" />
              <span className="text-2xs font-mono">Réconciliée</span>
            </span>
          )}

          {/* Badge V1.1 — modifiée */}
          {tx.corrected && (
            <span
              className="inline-flex items-center gap-0.5 text-amber-400"
              title={tx.lastReasoning ? `Modifiée : ${tx.lastReasoning}` : 'Écriture modifiée'}
            >
              <Edit3 className="w-3 h-3" />
              <span className="text-2xs font-mono">Modifiée</span>
            </span>
          )}

          {/* Badge V1.1 — lettrée */}
          {tx.letterRef && (
            <span
              className="inline-flex items-center gap-0.5 text-violet-400"
              title={`Lettrée — ${tx.letterRef}`}
            >
              <Link className="w-3 h-3" />
              <span className="text-2xs font-mono">{tx.letterRef.slice(-4)}</span>
            </span>
          )}

          {/* Checkmark sélection */}
          {isSelected && (
            <span className="text-accent">
              <Check className="w-3 h-3" />
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
