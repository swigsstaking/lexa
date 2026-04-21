import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowRight,
  BookOpen,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Clock,
  LogOut,
  Settings,
  Users,
  XCircle,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import type { PortfolioClient } from '@/api/types';
import { useAuthStore } from '@/stores/authStore';
import { useCompaniesStore } from '@/stores/companiesStore';

// ── Helpers ────────────────────────────────────────────────────────────────

function legalFormLabel(lf: string): string {
  const MAP: Record<string, string> = {
    sa: 'SA',
    sarl: 'Sàrl',
    cooperative: 'Coopérative',
    raison_individuelle: 'Raison ind.',
    association: 'Association',
    fondation: 'Fondation',
  };
  return MAP[lf] ?? lf.toUpperCase();
}

function healthColor(h: PortfolioClient['ledgerHealth']): 'green' | 'orange' | 'red' {
  if (h.txCount === 0) return 'orange';
  if (!h.balanced) return 'red';
  return 'green';
}

function fmtAmount(n: number): string {
  return new Intl.NumberFormat('fr-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(n);
}

// ── Skeleton card ──────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-3 animate-pulse"
      style={{ background: 'var(--v2-surface)', border: '1px solid var(--line-1)' }}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg" style={{ background: 'var(--line-1)' }} />
        <div className="flex-1 space-y-2">
          <div className="h-4 rounded w-2/3" style={{ background: 'var(--line-1)' }} />
          <div className="h-3 rounded w-1/3" style={{ background: 'var(--line-1)' }} />
        </div>
      </div>
      <div className="h-px" style={{ background: 'var(--line-1)' }} />
      <div className="space-y-2">
        <div className="h-3 rounded w-4/5" style={{ background: 'var(--line-1)' }} />
        <div className="h-3 rounded w-1/2" style={{ background: 'var(--line-1)' }} />
      </div>
      <div className="h-8 rounded-lg mt-1" style={{ background: 'var(--line-1)' }} />
    </div>
  );
}

// ── Client card ────────────────────────────────────────────────────────────

function ClientCard({
  client,
  onOpen,
  switching,
}: {
  client: PortfolioClient;
  onOpen: () => void;
  switching: boolean;
}) {
  const color = healthColor(client.ledgerHealth);
  const HealthIcon =
    color === 'green' ? CheckCircle2 : color === 'orange' ? AlertCircle : XCircle;
  const healthCss =
    color === 'green'
      ? 'var(--success, #22c55e)'
      : color === 'orange'
        ? 'var(--warning, #f59e0b)'
        : 'var(--danger, #ef4444)';

  const isPm =
    client.legalForm === 'sa' || client.legalForm === 'sarl' || client.legalForm === 'cooperative';

  return (
    <div
      className="rounded-xl p-5 flex flex-col gap-4 transition-shadow hover:shadow-md"
      style={{ background: 'var(--v2-surface)', border: '1px solid var(--line-1)' }}
    >
      {/* Header */}
      <div className="flex items-start gap-3 min-w-0">
        <div
          className="w-8 h-8 rounded-lg grid place-items-center flex-shrink-0"
          style={{ background: 'rgb(var(--accent) / 0.12)' }}
        >
          {isPm ? (
            <Building2 className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          ) : (
            <Users className="w-4 h-4" style={{ color: 'rgb(var(--accent))' }} />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate" style={{ color: 'var(--ink-1)' }}>
              {client.name}
            </span>
            {client.canton && (
              <span
                className="text-2xs px-1.5 py-0.5 rounded font-medium"
                style={{ background: 'var(--chrome-bg-2)', color: 'var(--chrome-ink-2)', border: '1px solid var(--chrome-line)' }}
              >
                {client.canton}
              </span>
            )}
          </div>
          <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
            {legalFormLabel(client.legalForm)}
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="h-px" style={{ background: 'var(--line-1)' }} />

      {/* KPIs */}
      <div className="flex flex-col gap-2.5">
        {/* Santé comptable */}
        <div className="flex items-center gap-2">
          <HealthIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: healthCss }} />
          <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
            {client.ledgerHealth.txCount === 0 ? (
              'Aucune transaction'
            ) : (
              <>
                <span className="font-medium mono-num">{client.ledgerHealth.txCount}</span> tx ·{' '}
                {fmtAmount(client.ledgerHealth.totalDebit)}
              </>
            )}
          </span>
        </div>

        {/* Prochaine échéance */}
        {client.nextDeadline && (
          <div className="flex items-center gap-2">
            <Calendar className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <span className="text-xs" style={{ color: 'var(--ink-2)' }}>
              {client.nextDeadline.label} —{' '}
              <span
                className="font-medium"
                style={{
                  color: client.nextDeadline.daysLeft <= 7 ? 'var(--danger, #ef4444)' : 'var(--ink-1)',
                }}
              >
                J-{client.nextDeadline.daysLeft}
              </span>
            </span>
          </div>
        )}

        {/* Dernière activité */}
        {client.lastActivity && (
          <div className="flex items-center gap-2">
            <Clock className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--ink-3)' }} />
            <span className="text-xs" style={{ color: 'var(--ink-3)' }}>
              Dernière écriture :{' '}
              {new Date(client.lastActivity).toLocaleDateString('fr-CH', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        )}

        {/* Alertes */}
        {client.alerts.map((alert, i) => (
          <div key={i} className="flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--danger, #ef4444)' }} />
            <span className="text-xs font-medium" style={{ color: 'var(--danger, #ef4444)' }}>
              {alert}
            </span>
          </div>
        ))}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onOpen}
        disabled={switching}
        className="w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-medium transition-opacity hover:opacity-80 disabled:opacity-50 mt-auto"
        style={{ background: 'rgb(var(--accent))', color: 'var(--accent-fg, #fff)' }}
      >
        {switching ? (
          <span className="animate-pulse">Chargement…</span>
        ) : (
          <>
            Ouvrir
            <ChevronRight className="w-3.5 h-3.5" />
          </>
        )}
      </button>
    </div>
  );
}

// ── Page principale ────────────────────────────────────────────────────────

export function Fiduciaire() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const token = useAuthStore((s) => s.token);
  const setToken = useAuthStore((s) => s.setToken);
  const authLogout = useAuthStore((s) => s.logout);
  const addCompany = useCompaniesStore((s) => s.addCompany);
  const setActive = useCompaniesStore((s) => s.setActive);
  const clear = useCompaniesStore((s) => s.clear);

  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['fiduciary-portfolio'],
    queryFn: lexa.getPortfolio,
    staleTime: 2 * 60 * 1000,
    retry: 2,
    enabled: !!token,
  });

  const handleOpen = async (tenantId: string) => {
    if (switchingId) return;
    setSwitchingId(tenantId);
    try {
      const { token: newToken, activeTenantId: newTenantId } = await lexa.switchTenant(tenantId);
      setToken(newToken, newTenantId);
      try {
        const me = await lexa.me();
        if (me.company) {
          addCompany(me.company);
          setActive(me.company.tenantId);
        }
      } catch {
        setActive(newTenantId);
      }
      await queryClient.invalidateQueries();
      navigate('/workspace');
    } catch (err) {
      console.error('[Fiduciaire] switch-tenant failed:', err);
    } finally {
      setSwitchingId(null);
    }
  };

  const handleLogout = () => {
    authLogout();
    clear();
    navigate('/login', { replace: true });
  };

  return (
    <div className="h-screen w-screen flex flex-col" style={{ background: 'rgb(var(--bg))', color: 'var(--ink-1)' }}>
      {/* Header */}
      <header
        className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0"
        style={{ background: 'var(--chrome-bg)', borderColor: 'var(--chrome-line)', color: 'var(--chrome-ink-1)' }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity min-h-[44px]"
          >
            <div className="w-6 h-6 rounded-md bg-accent grid place-items-center font-semibold text-xs text-accent-fg">
              L
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--chrome-ink-1)' }}>
              Lexa
            </span>
          </button>
          <span className="w-px h-5" style={{ background: 'var(--chrome-line)' }} />
          <div className="flex items-center gap-1.5">
            <BookOpen className="w-3.5 h-3.5" style={{ color: 'var(--chrome-ink-2)' }} />
            <span className="text-sm font-medium" style={{ color: 'var(--chrome-ink-1)' }}>
              Portefeuille fiduciaire
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => navigate('/workspace')}
            className="hidden md:flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
            style={{ color: 'var(--chrome-ink-2)' }}
          >
            <ArrowRight className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </button>
          <button
            type="button"
            onClick={() => navigate('/settings')}
            className="hidden md:flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--chrome-ink-2)' }}
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleLogout}
            className="hidden md:flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors hover:opacity-70"
            style={{ color: 'var(--chrome-ink-2)' }}
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-6">
        <div className="max-w-5xl mx-auto">
          {/* Title row */}
          <div className="mb-6">
            <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--ink-1)' }}>
              Vos clients
            </h1>
            {!isLoading && data && (
              <p className="text-sm" style={{ color: 'var(--ink-3)' }}>
                {data.clients.length} client{data.clients.length !== 1 ? 's' : ''} dans votre portefeuille
              </p>
            )}
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {[1, 2, 3].map((i) => <SkeletonCard key={i} />)}
            </div>
          )}

          {/* Error state */}
          {isError && !isLoading && (
            <div
              className="rounded-xl p-8 text-center"
              style={{ background: 'var(--v2-surface)', border: '1px solid var(--line-1)' }}
            >
              <XCircle className="w-8 h-8 mx-auto mb-3" style={{ color: 'var(--danger, #ef4444)' }} />
              <p className="text-sm font-medium mb-1" style={{ color: 'var(--ink-1)' }}>
                Impossible de charger le portefeuille
              </p>
              <p className="text-xs" style={{ color: 'var(--ink-3)' }}>
                Vérifiez votre connexion et rechargez la page.
              </p>
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !isError && data && data.clients.length === 0 && (
            <div
              className="rounded-xl p-12 text-center"
              style={{ background: 'var(--v2-surface)', border: '1px solid var(--line-1)' }}
            >
              <Users className="w-10 h-10 mx-auto mb-4" style={{ color: 'var(--ink-3)' }} />
              <h2 className="text-base font-semibold mb-2" style={{ color: 'var(--ink-1)' }}>
                Aucun client fiduciaire
              </h2>
              <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--ink-3)' }}>
                Vous n'avez pas encore de clients dans votre portefeuille. Invitez un client depuis le workspace.
              </p>
              <button
                type="button"
                onClick={() => navigate('/workspace')}
                className="mt-6 inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-80"
                style={{ background: 'rgb(var(--accent))', color: 'var(--accent-fg, #fff)' }}
              >
                Aller au workspace
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Client grid */}
          {!isLoading && !isError && data && data.clients.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.clients.map((client) => (
                <ClientCard
                  key={client.tenantId}
                  client={client}
                  onOpen={() => handleOpen(client.tenantId)}
                  switching={switchingId === client.tenantId}
                />
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
