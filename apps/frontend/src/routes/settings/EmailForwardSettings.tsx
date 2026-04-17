/**
 * Page /settings/email-forward — Configuration du forward email IMAP par tenant.
 *
 * Phase 1 V1.2 — whitepaper "zéro saisie manuelle" 80% → 95%.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Copy,
  Check,
  RefreshCw,
  Mail,
  Clock,
  Paperclip,
  AlertCircle,
  Loader2,
  ToggleLeft,
  ToggleRight,
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

const STATUS_LABELS: Record<string, string> = {
  processed: 'Traité',
  ignored: 'Ignoré',
  error: 'Erreur',
};

const STATUS_CLASSES: Record<string, string> = {
  processed: 'text-success',
  ignored: 'text-muted',
  error: 'text-danger',
};

export function EmailForwardSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ['email-forward-settings'],
    queryFn: lexa.getEmailForwardSettings,
    staleTime: 30_000,
  });

  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['email-forward-history'],
    queryFn: () => lexa.listEmailForwardHistory(20),
    staleTime: 60_000,
  });

  const regenerateMutation = useMutation({
    mutationFn: lexa.regenerateEmailForwardToken,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-forward-settings'] });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (enabled: boolean) => lexa.toggleEmailForward(enabled),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['email-forward-settings'] });
    },
  });

  const handleCopy = async () => {
    if (!data?.forwardAddress) return;
    await navigator.clipboard.writeText(data.forwardAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRegenerate = () => {
    if (!window.confirm('Régénérer le token ? L\'ancienne adresse ne fonctionnera plus.')) return;
    regenerateMutation.mutate();
  };

  const handleToggle = () => {
    if (data) toggleMutation.mutate(!data.enabled);
  };

  return (
    <div className="min-h-screen bg-bg text-ink">
      {/* Header */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            className="btn-ghost !px-2 !py-1.5 text-muted hover:text-ink transition-colors"
            title="Retour au workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <span className="w-px h-5 bg-border" />
          <Mail className="w-4 h-4 text-accent" />
          <span className="text-sm font-medium">Import email automatique</span>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-accent" />
          </div>
        ) : error ? (
          <div className="card p-4 flex items-center gap-3 text-danger">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm">Erreur de chargement des paramètres email.</span>
          </div>
        ) : data ? (
          <>
            {/* Bloc 1 — Adresse de forward */}
            <section className="card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-ink">Votre adresse de forward</h2>
                <button
                  type="button"
                  onClick={handleToggle}
                  disabled={toggleMutation.isPending}
                  className="flex items-center gap-1.5 text-xs text-muted hover:text-ink transition-colors"
                  title={data.enabled ? 'Désactiver le forward' : 'Activer le forward'}
                >
                  {data.enabled ? (
                    <>
                      <ToggleRight className="w-5 h-5 text-success" />
                      <span>Actif</span>
                    </>
                  ) : (
                    <>
                      <ToggleLeft className="w-5 h-5 text-muted" />
                      <span>Inactif</span>
                    </>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2">
                <code className="flex-1 text-sm bg-elevated border border-border rounded-md px-3 py-2 font-mono text-accent truncate">
                  {data.forwardAddress}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="btn-ghost !px-2.5 !py-2 flex-shrink-0"
                  title="Copier l'adresse"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-success" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerateMutation.isPending}
                  className="btn-ghost !px-2.5 !py-2 flex-shrink-0"
                  title="Régénérer le token"
                >
                  {regenerateMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <RefreshCw className="w-4 h-4" />
                  )}
                </button>
              </div>

              {data.lastEmailAt && (
                <p className="text-2xs text-muted flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  Dernier email reçu le {formatDate(data.lastEmailAt)}
                </p>
              )}
            </section>

            {/* Bloc 2 — Instructions */}
            <section className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Comment configurer le forward</h2>
              <p className="text-xs text-muted leading-relaxed">
                Copiez l'adresse ci-dessus et configurez un transfert automatique depuis votre boîte email.
                Toutes les pièces jointes (PDF, JPEG, PNG, XML) seront extraites par OCR et importées dans Lexa.
              </p>
              <div className="space-y-2">
                <p className="text-2xs font-medium text-subtle uppercase tracking-wider">Gmail</p>
                <p className="text-xs text-muted">
                  Paramètres → Voir tous les paramètres → Transfert et POP/IMAP → Ajouter une adresse de transfert.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-2xs font-medium text-subtle uppercase tracking-wider">Outlook / Microsoft 365</p>
                <p className="text-xs text-muted">
                  Paramètres → Afficher tous les paramètres Outlook → Transfert → Activer le transfert vers l'adresse ci-dessus.
                </p>
              </div>
              <div className="space-y-2">
                <p className="text-2xs font-medium text-subtle uppercase tracking-wider">Alternative (sujet)</p>
                <p className="text-xs text-muted">
                  Si le subaddressing ne fonctionne pas, incluez{' '}
                  <code className="bg-elevated px-1 rounded font-mono">[lexa-{data.token}]</code>{' '}
                  dans le sujet de l'email.
                </p>
              </div>
            </section>

            {/* Bloc 3 — Historique */}
            <section className="card p-5 space-y-3">
              <h2 className="text-sm font-semibold text-ink">Historique des emails reçus</h2>
              {historyLoading ? (
                <div className="flex items-center gap-2 text-muted py-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span className="text-xs">Chargement...</span>
                </div>
              ) : !history?.emails?.length ? (
                <p className="text-xs text-muted py-2">Aucun email reçu pour l'instant.</p>
              ) : (
                <div className="space-y-1">
                  {history.emails.map((email) => (
                    <div
                      key={email.id}
                      className="flex items-start gap-3 py-2.5 border-b border-border last:border-0"
                    >
                      <Mail className="w-3.5 h-3.5 text-muted mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="text-xs text-ink truncate font-medium">
                            {email.from_address}
                          </span>
                          <span className={`text-2xs flex-shrink-0 ${STATUS_CLASSES[email.status] ?? 'text-muted'}`}>
                            {STATUS_LABELS[email.status] ?? email.status}
                          </span>
                        </div>
                        {email.subject && (
                          <p className="text-2xs text-muted truncate mt-0.5">{email.subject}</p>
                        )}
                        <div className="flex items-center gap-3 mt-0.5">
                          <span className="text-2xs text-subtle">{formatDate(email.received_at)}</span>
                          {email.attachments_count > 0 && (
                            <span className="text-2xs text-muted flex items-center gap-1">
                              <Paperclip className="w-2.5 h-2.5" />
                              {email.attachments_count} pièce{email.attachments_count > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
}
