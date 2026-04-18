/**
 * Page /settings/integrations/pro — Toggle sync Swigs Pro par tenant.
 *
 * Phase 3 V1.1 — permet au tenant Lexa de refuser les events Pro même si Pro publie.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Briefcase,
  AlertCircle,
  Loader2,
  CheckCircle2,
  Save,
} from 'lucide-react';
import { lexa } from '@/api/lexa';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString('fr-CH', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function ProSyncSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [reason, setReason] = useState('');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const { data: settings, isLoading } = useQuery({
    queryKey: ['settings-pro-sync'],
    queryFn: lexa.getProSyncSettings,
    onSuccess: (data) => {
      if (enabled === null) {
        setEnabled(data.enabled);
      }
    },
  });

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

  const currentEnabled = enabled ?? settings?.enabled ?? true;

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

        {/* Section Swigs Pro */}
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
          <h3 className="text-xs font-semibold text-ink">Comment ça fonctionne ?</h3>
          <ul className="flex flex-col gap-1.5 text-2xs text-subtle">
            <li className="flex gap-2">
              <span className="text-violet-400 flex-shrink-0">·</span>
              <span>Quand activé, les factures et notes de frais créées dans Swigs Pro apparaissent automatiquement dans votre grand livre et dans /documents.</span>
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
