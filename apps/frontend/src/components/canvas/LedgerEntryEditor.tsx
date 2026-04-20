/**
 * LedgerEntryEditor — drawer slide-in depuis la droite pour :
 *   - Corriger une écriture existante (mode 'correct')
 *   - Créer une écriture manuelle (mode 'create')
 * Utilisé depuis LedgerDrawer (context menu TxRow) et bouton "+ Nouvelle écriture".
 */
import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronRight, Edit3, History, Loader2, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import { lexa } from '@/api/lexa';
import type { LedgerEntry } from '@/api/types';

// Comptes Käfer fréquents — débit + crédit
const KAFER_ACCOUNTS = [
  '1000 - Caisse',
  '1020 - Banque',
  '1100 - Clients',
  '1170 - TVA récupérable',
  '2000 - Fournisseurs',
  '2200 - TVA due',
  '3000 - Ventes marchandises',
  '3200 - Prestations de services',
  '4000 - Achats marchandises',
  '5000 - Salaires',
  '6000 - Loyers',
  '6300 - Assurances',
  '6400 - Énergie',
  '6700 - Publicité',
  '8000 - Charges financières',
  '9000 - Capitaux propres',
];

type Mode = 'correct' | 'create';

interface HistoryEvent {
  eventId: number;
  type: string;
  occurredAt: string;
  description?: string;
  debitAccount?: string;
  creditAccount?: string;
  amount?: number;
  reasoning?: string;
}

interface Props {
  mode: Mode;
  entry?: LedgerEntry; // requis si mode === 'correct'
  onClose: () => void;
}

export function LedgerEntryEditor({ mode, entry, onClose }: Props) {
  const queryClient = useQueryClient();
  const drawerRef = useRef<HTMLDivElement | null>(null);

  // Champs du formulaire
  const [debitAccount, setDebitAccount] = useState(entry?.account ?? '');
  const [creditAccount, setCreditAccount] = useState(entry?.counterpartAccount ?? '');
  const [amountTtc, setAmountTtc] = useState(
    entry?.amountTtc !== undefined ? String(entry.amountTtc) : entry?.amount !== undefined ? String(entry.amount) : '',
  );
  const [description, setDescription] = useState(entry?.description ?? '');
  const [reasoning, setReasoning] = useState('');
  const [entryDate, setEntryDate] = useState(
    entry?.date ? entry.date.slice(0, 10) : new Date().toISOString().slice(0, 10),
  );

  // UI states
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ kind: 'success' | 'error'; text: string } | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryEvent[] | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);

  // ESC ferme
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Chargement historique
  const loadHistory = async () => {
    if (!entry?.streamId) return;
    if (history !== null) {
      setHistoryOpen((o) => !o);
      return;
    }
    setHistoryLoading(true);
    try {
      const res = await lexa.getLedgerEntryHistory(entry.streamId);
      setHistory(res.events);
      setHistoryOpen(true);
    } catch {
      setToast({ kind: 'error', text: 'Impossible de charger l\'historique' });
    } finally {
      setHistoryLoading(false);
    }
  };

  // Validation
  const amount = parseFloat(amountTtc);
  const reasoningOk = mode === 'create' || reasoning.trim().length >= 3;
  const amountOk = !isNaN(amount) && amount > 0;
  const accountsOk = debitAccount.trim() !== '' && creditAccount.trim() !== '' && debitAccount !== creditAccount;
  const hasChanges = mode === 'create' || (
    debitAccount !== (entry?.account ?? '') ||
    creditAccount !== (entry?.counterpartAccount ?? '') ||
    amountTtc !== String(entry?.amountTtc ?? entry?.amount ?? '') ||
    description !== (entry?.description ?? '')
  );
  const canSave = reasoningOk && amountOk && accountsOk && hasChanges;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    setToast(null);
    try {
      if (mode === 'correct' && entry) {
        await lexa.correctLedgerEntry(entry.streamId, {
          debitAccount: debitAccount !== entry.account ? debitAccount : undefined,
          creditAccount: creditAccount !== entry.counterpartAccount ? creditAccount : undefined,
          amountTtc: amountTtc !== String(entry.amountTtc ?? entry.amount) ? amount : undefined,
          description: description !== entry.description ? description : undefined,
          reasoning: reasoning.trim(),
        });
        setToast({ kind: 'success', text: 'Écriture corrigée avec succès' });
      } else {
        await lexa.createLedgerEntry({
          date: entryDate,
          description: description.trim(),
          debitAccount: debitAccount.trim(),
          creditAccount: creditAccount.trim(),
          amountTtc: amount,
          reasoning: reasoning.trim() || undefined,
        });
        setToast({ kind: 'success', text: 'Écriture créée avec succès' });
      }
      await queryClient.invalidateQueries({ queryKey: ['ledger'] });
      setTimeout(onClose, 800);
    } catch (err) {
      const msg = isAxiosError(err)
        ? (err.response?.data as { message?: string } | undefined)?.message ?? err.message
        : err instanceof Error ? err.message : 'Erreur inconnue';
      setToast({ kind: 'error', text: msg });
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      ref={drawerRef}
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', damping: 30, stiffness: 280 }}
      className="absolute top-0 right-0 bottom-0 w-[420px] max-w-[95vw] bg-surface border-l border-border z-40 flex flex-col shadow-xl"
    >
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          {mode === 'create' ? (
            <Plus className="w-4 h-4 text-accent" />
          ) : (
            <Edit3 className="w-4 h-4 text-accent" />
          )}
          <h2 className="text-sm font-semibold text-ink">
            {mode === 'create' ? 'Nouvelle écriture' : 'Corriger l\'écriture'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className="p-2 rounded hover:bg-elevated text-subtle hover:text-ink transition-colors min-h-[44px] min-w-[44px] flex items-center justify-center"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
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

      {/* Formulaire */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Date (création seulement) */}
        {mode === 'create' && (
          <div>
            <label className="label" htmlFor="editor-date">Date</label>
            <input
              id="editor-date"
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              className="input w-full"
            />
          </div>
        )}

        {/* Description */}
        <div>
          <label className="label" htmlFor="editor-desc">Description</label>
          <input
            id="editor-desc"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="input w-full"
            placeholder="Libellé de l'écriture"
          />
        </div>

        {/* Compte débit */}
        <div>
          <label className="label" htmlFor="editor-debit">Compte débit</label>
          <input
            id="editor-debit"
            type="text"
            list="kafer-accounts-list"
            value={debitAccount}
            onChange={(e) => setDebitAccount(e.target.value)}
            className="input w-full"
            placeholder="ex: 1020 - Banque"
          />
          <datalist id="kafer-accounts-list">
            {KAFER_ACCOUNTS.map((a) => <option key={a} value={a} />)}
          </datalist>
        </div>

        {/* Compte crédit */}
        <div>
          <label className="label" htmlFor="editor-credit">Compte crédit</label>
          <input
            id="editor-credit"
            type="text"
            list="kafer-accounts-list"
            value={creditAccount}
            onChange={(e) => setCreditAccount(e.target.value)}
            className="input w-full"
            placeholder="ex: 3200 - Prestations de services"
          />
        </div>

        {/* Montant TTC */}
        <div>
          <label className="label" htmlFor="editor-amount">Montant TTC (CHF)</label>
          <input
            id="editor-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amountTtc}
            onChange={(e) => setAmountTtc(e.target.value)}
            className="input w-full mono-num"
            placeholder="0.00"
          />
          {amountTtc !== '' && !amountOk && (
            <p className="text-2xs text-danger mt-1">Le montant doit être supérieur à 0</p>
          )}
        </div>

        {/* Raison de la correction */}
        <div>
          <label className="label" htmlFor="editor-reasoning">
            {mode === 'correct' ? 'Raison de la correction *' : 'Commentaire (optionnel)'}
          </label>
          <textarea
            id="editor-reasoning"
            value={reasoning}
            onChange={(e) => setReasoning(e.target.value)}
            className="input w-full min-h-[80px] resize-y"
            placeholder={
              mode === 'correct'
                ? 'Expliquer pourquoi cette correction est nécessaire…'
                : 'Note optionnelle sur cette écriture…'
            }
          />
          {mode === 'correct' && reasoning.trim().length > 0 && reasoning.trim().length < 3 && (
            <p className="text-2xs text-danger mt-1">Minimum 3 caractères requis</p>
          )}
        </div>

        {/* Validation visuelles */}
        {debitAccount && creditAccount && debitAccount === creditAccount && (
          <p className="text-2xs text-danger">Le compte débit et crédit ne peuvent pas être identiques</p>
        )}

        {/* Section historique — uniquement en mode correction */}
        {mode === 'correct' && entry && (
          <div className="border border-border rounded-md overflow-hidden">
            <button
              type="button"
              onClick={loadHistory}
              className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted hover:bg-elevated transition-colors"
            >
              <span className="flex items-center gap-2">
                {historyLoading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <History className="w-3 h-3" />
                )}
                Historique des modifications
              </span>
              {historyOpen ? (
                <ChevronDown className="w-3 h-3" />
              ) : (
                <ChevronRight className="w-3 h-3" />
              )}
            </button>
            <AnimatePresence>
              {historyOpen && history && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }}
                  className="overflow-hidden border-t border-border"
                >
                  <div className="px-3 py-2 space-y-2 max-h-[200px] overflow-y-auto">
                    {history.length === 0 ? (
                      <p className="text-2xs text-muted">Aucun événement enregistré</p>
                    ) : (
                      history.map((ev) => (
                        <div key={ev.eventId} className="text-2xs border-l-2 border-border pl-2">
                          <div className="flex items-center gap-2 text-muted">
                            <span className="font-mono">{new Date(ev.occurredAt).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short', year: '2-digit' })}</span>
                            <span className="chip">{ev.type}</span>
                          </div>
                          {ev.description && <div className="text-ink mt-0.5">{ev.description}</div>}
                          {ev.reasoning && <div className="text-subtle italic mt-0.5">"{ev.reasoning}"</div>}
                        </div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border flex-shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="btn-secondary !px-4 !py-2 !text-sm"
        >
          Annuler
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={!canSave || saving}
          className="btn-primary !px-4 !py-2 !text-sm"
        >
          {saving ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Enregistrement…
            </>
          ) : (
            mode === 'create' ? 'Créer' : 'Sauvegarder'
          )}
        </button>
      </div>
    </motion.div>
  );
}
