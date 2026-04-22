/**
 * Page /settings/integrations/pro — Toggle sync Swigs Pro par tenant.
 *
 * V1.1 Feature — import bulk historique + dashboard statistiques.
 * Phase 3 V1.1 — permet au tenant Lexa de refuser les events Pro même si Pro publie.
 */

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Save,
  Download,
  BarChart3,
  FileText,
  CreditCard,
  TrendingUp,
  Clock,
  ExternalLink,
  ShieldCheck,
  Wallet,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useAuthStore } from '@/stores/authStore';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCHF(amount: number): string {
  return new Intl.NumberFormat('fr-CH', {
    style: 'currency',
    currency: 'CHF',
    maximumFractionDigits: 2,
  }).format(amount);
}

export function ProSyncSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const hubUserId = useAuthStore((s) => s.hubUserId);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Import bulk state
  const [hubUserIdInput, setHubUserIdInput] = useState('');
  const [syncResult, setSyncResult] = useState<{
    ok: boolean;
    invoicesProcessed: number;
    expensesProcessed: number;
    bankTxProcessed: number;
    ingested: { created: number; sent: number; paid: number; expenses: number; bankTransactions: number };
  } | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings-pro-sync'],
    queryFn: lexa.getProSyncSettings,
  });

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['settings-pro-stats'],
    queryFn: lexa.getProStats,
    refetchInterval: syncResult ? 5000 : false,
  });

  useEffect(() => {
    if (settings && enabled === null) {
      setEnabled(settings.enabled);
    }
  }, [settings, enabled]);

  const saveMutation = useMutation({
    mutationFn: () =>
      lexa.setProSyncSettings(enabled ?? true, reason || undefined),
    onSuccess: () => {
      setSaveSuccess(true);
      setSaveError(null);
      queryClient.invalidateQueries({ queryKey: ['settings-pro-sync'] });
      setTimeout(() => setSaveSuccess(false), 3000);
    },
    onError: (err: Error) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        err.message ??
        'Erreur lors de la sauvegarde';
      setSaveError(msg);
    },
  });

  const syncMutation = useMutation({
    mutationFn: () => lexa.syncProData(hubUserIdInput.trim() || undefined),
    onSuccess: (data) => {
      setSyncResult(data);
      setSyncError(null);
      queryClient.invalidateQueries({ queryKey: ['settings-pro-stats'] });
    },
    onError: (err: Error) => {
      const msg =
        (err as { response?: { data?: { error?: string; message?: string } } })?.response?.data?.message ??
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        err.message ??
        'Erreur lors de la synchronisation';
      setSyncError(msg);
      setSyncResult(null);
    },
  });

  const currentEnabled = enabled ?? settings?.enabled ?? true;
  const hasMapping = Boolean(stats && (stats.invoicesCreated > 0 || stats.expensesCount > 0));

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center gap-3 px-4 border-b border-border bg-surface flex-shrink-0">
        <button onClick={() => navigate('/workspace')} className="btn-ghost !p-1.5">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-border" />
        <Briefcase className="w-4 h-4 text-accent" />
        <span className="text-sm font-semibold">Intégrations · Swigs Pro</span>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">

        {/* Section Statistiques */}
        <section className="card p-6 flex flex-col gap-4">
          <div className="flex items-center gap-2 flex-wrap">
            <BarChart3 className="w-4 h-4 text-violet-400" />
            <h2 className="text-sm font-semibold text-ink">Statistiques Swigs Pro</h2>
            {statsLoading && <Loader2 className="w-3 h-3 animate-spin text-subtle" />}
            {stats?.lastEventAt && (
              <div className="ml-auto flex items-center gap-1.5 rounded-md bg-stone-700/50 border border-stone-600/40 px-2.5 py-1 text-2xs text-stone-300">
                <Clock className="w-3 h-3 text-violet-400 flex-shrink-0" />
                <span>Dernier sync : <span className="font-medium text-ink">{formatDate(stats.lastEventAt)}</span></span>
              </div>
            )}
          </div>

          {stats ? (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {/* Factures émises */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <FileText className="w-3 h-3" />
                    <span>Factures émises</span>
                  </div>
                  <span className="text-lg font-semibold text-ink">{stats.invoicesCreated}</span>
                </div>

                {/* Factures payées */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    <span>Factures payées</span>
                  </div>
                  <span className="text-lg font-semibold text-emerald-400">{stats.invoicesPaid}</span>
                </div>

                {/* Factures en attente */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <Clock className="w-3 h-3 text-amber-400" />
                    <span>En attente</span>
                  </div>
                  <span className="text-lg font-semibold text-amber-400">
                    {Math.max(0, stats.invoicesUnpaid)}
                  </span>
                </div>

                {/* CA YTD */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <TrendingUp className="w-3 h-3 text-violet-400" />
                    <span>CA total</span>
                  </div>
                  <span className="text-base font-semibold text-ink">{formatCHF(stats.caTotal)}</span>
                </div>

                {/* Notes de frais */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <CreditCard className="w-3 h-3" />
                    <span>Notes de frais</span>
                  </div>
                  <span className="text-lg font-semibold text-ink">{stats.expensesCount}</span>
                </div>

                {/* Total frais */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <CreditCard className="w-3 h-3 text-rose-400" />
                    <span>Total frais</span>
                  </div>
                  <span className="text-base font-semibold text-rose-400">{formatCHF(stats.expensesTotal)}</span>
                </div>

                {/* Transactions bancaires — count */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <Wallet className="w-3 h-3 text-sky-400" />
                    <span>TX bancaires</span>
                  </div>
                  <span className="text-lg font-semibold text-sky-400">{stats.bankTransactionsCount}</span>
                </div>

                {/* Encaissements bancaires */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <Wallet className="w-3 h-3 text-emerald-400" />
                    <span>Encaissements</span>
                  </div>
                  <span className="text-base font-semibold text-emerald-400">{formatCHF(stats.bankTransactionsIn)}</span>
                </div>

                {/* Décaissements bancaires */}
                <div className="rounded-lg bg-stone-800/60 px-4 py-3 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-2xs text-subtle">
                    <Wallet className="w-3 h-3 text-rose-400" />
                    <span>Décaissements</span>
                  </div>
                  <span className="text-base font-semibold text-rose-400">{formatCHF(stats.bankTransactionsOut)}</span>
                </div>
              </div>

              {hasMapping && (
                <div className="flex justify-end pt-1">
                  <button
                    onClick={() => navigate('/documents?source=swigs-pro')}
                    className="flex items-center gap-1.5 text-2xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Voir dans /documents</span>
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-2xs text-subtle italic">
              {statsLoading ? 'Chargement des statistiques...' : 'Aucune donnée Pro importée.'}
            </div>
          )}
        </section>

        {/* Section Import bulk */}
        <section className="card p-6 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
              <Download className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Importer mes données Swigs Pro</h2>
              <p className="text-2xs text-subtle mt-0.5">
                Importe en une fois tout l'historique de factures et notes de frais depuis votre compte Pro.
              </p>
            </div>
          </div>

          {/* Statut lien Hub SSO */}
          {hubUserId ? (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-900/20 border border-emerald-700/30 px-4 py-3 text-2xs text-emerald-300">
              <ShieldCheck className="w-4 h-4 flex-shrink-0" />
              <span>
                <span className="font-semibold">Compte Swigs Hub lié</span> — sync sécurisé activé.
                Aucune saisie manuelle requise.
              </span>
            </div>
          ) : (
            <>
              {/* Input hubUserId si pas encore de mapping et pas de SSO */}
              {!hasMapping && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-2xs text-subtle font-medium">
                    ID compte Swigs Pro (hubUserId)
                  </label>
                  <input
                    type="text"
                    value={hubUserIdInput}
                    onChange={(e) => setHubUserIdInput(e.target.value)}
                    placeholder="Ex : 507f1f77bcf86cd799439011"
                    className="input text-sm font-mono"
                  />
                  <p className="text-2xs text-stone-500">
                    Retrouvez cet ID dans votre profil Swigs Pro · Settings · Mon compte.
                  </p>
                </div>
              )}
              <div className="flex items-center gap-2 rounded-lg bg-amber-900/20 border border-amber-700/30 px-4 py-3 text-2xs text-amber-300">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>
                  Pour plus de sécurité, liez votre compte au Swigs Hub depuis la{' '}
                  <button
                    type="button"
                    onClick={() => navigate('/login')}
                    className="underline hover:text-amber-200"
                  >
                    page de connexion
                  </button>
                  .
                </span>
              </div>
            </>
          )}

          {/* Bouton import */}
          <div className="flex items-center gap-3 flex-wrap">
            <button
              onClick={() => {
                setSyncResult(null);
                setSyncError(null);
                syncMutation.mutate();
              }}
              disabled={syncMutation.isPending}
              className="btn-primary flex items-center gap-2"
            >
              {syncMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              <span>{syncMutation.isPending ? 'Import en cours...' : 'Importer maintenant'}</span>
            </button>

            {syncResult && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>
                  {syncResult.invoicesProcessed} facture{syncResult.invoicesProcessed !== 1 ? 's' : ''} +{' '}
                  {syncResult.expensesProcessed} frais importés
                </span>
              </div>
            )}
            {syncError && (
              <div className="flex items-center gap-1.5 text-xs text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                <span>{syncError}</span>
              </div>
            )}
          </div>

          {syncResult && (
            <div className="rounded-lg bg-emerald-900/20 border border-emerald-700/30 px-4 py-3 text-2xs text-emerald-300 flex flex-col gap-1">
              <p className="font-medium">Import terminé</p>
              <p>
                Factures créées : {syncResult.ingested.created} · Envoyées : {syncResult.ingested.sent} · Payées : {syncResult.ingested.paid}
              </p>
              <p>
                Frais : {syncResult.ingested.expenses} · TX bancaires : {syncResult.ingested.bankTransactions ?? syncResult.bankTxProcessed}
              </p>
            </div>
          )}

          <p className="text-2xs text-stone-500 italic">
            Re-cliquer ne créera pas de doublons — la déduplication est automatique par identifiant Pro.
          </p>
        </section>

        {/* Section Swigs Pro toggle */}
        <section className="card p-6 flex flex-col gap-5">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center flex-shrink-0">
              <Briefcase className="w-5 h-5 text-violet-400" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-ink">Swigs Pro</h2>
              <p className="text-2xs text-subtle mt-0.5">
                Recevoir automatiquement les factures et notes de frais publiées depuis Swigs Pro
              </p>
            </div>
          </div>

          {isLoading ? (
            <div className="flex items-center gap-2 text-subtle">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Chargement...</span>
            </div>
          ) : (
            <>
              {/* Toggle */}
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-ink">
                    Synchronisation Pro
                  </p>
                  <p className="text-2xs text-subtle mt-0.5">
                    {currentEnabled
                      ? 'Activée — les events Pro sont acceptés'
                      : 'Désactivée — les events Pro sont ignorés'}
                  </p>
                  {!currentEnabled && settings?.disabledAt && (
                    <p className="text-2xs text-amber-400 mt-1">
                      Désactivé depuis {formatDate(settings.disabledAt)}
                      {settings.disabledReason && ` · ${settings.disabledReason}`}
                    </p>
                  )}
                </div>

                {/* Switch Tailwind dark stone */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={currentEnabled}
                  onClick={() => {
                    setEnabled(!currentEnabled);
                    setSaveSuccess(false);
                    setSaveError(null);
                  }}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 focus:ring-offset-bg ${
                    currentEnabled
                      ? 'bg-emerald-500'
                      : 'bg-stone-600'
                  }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      currentEnabled ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Raison si désactivé */}
              {!currentEnabled && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-2xs text-subtle font-medium">
                    Raison de désactivation (optionnel)
                  </label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Ex : Migration en cours, désactivation temporaire..."
                    className="input text-sm"
                  />
                </div>
              )}

              {/* Bouton Sauvegarder */}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={() => {
                    setSaveSuccess(false);
                    setSaveError(null);
                    saveMutation.mutate();
                  }}
                  disabled={saveMutation.isPending}
                  className="btn-primary flex items-center gap-2"
                >
                  {saveMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4" />
                  )}
                  <span>Sauvegarder</span>
                </button>

                {saveSuccess && (
                  <div className="flex items-center gap-1.5 text-xs text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Paramètre sauvegardé</span>
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-1.5 text-xs text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>{saveError}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </section>

        {/* Explication */}
        <section className="card p-5 flex flex-col gap-2 bg-stone-900/50">
          <h3 className="text-xs font-semibold text-ink">Comment ca fonctionne ?</h3>
          <ul className="flex flex-col gap-1.5 text-2xs text-subtle">
            <li className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0">·</span>
              <span>Quand activé, les factures et notes de frais créées dans Swigs Pro apparaissent automatiquement dans votre grand livre et dans /documents.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0">·</span>
              <span>Le bouton "Importer maintenant" récupère tout l'historique passé en une seule opération. Re-cliquer est sans danger grâce à la déduplication automatique.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0">·</span>
              <span>Quand désactivé, les events Pro reçus par le bridge sont ignorés avec un code 202 (pro_sync_disabled) — aucune donnée n'est enregistrée.</span>
            </li>
            <li className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0">·</span>
              <span>Ce toggle n'affecte pas les imports manuels (upload, CAMT.053, email forward).</span>
            </li>
          </ul>
        </section>

      </main>
    </div>
  );
}
