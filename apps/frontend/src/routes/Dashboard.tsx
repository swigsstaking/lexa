import { useQuery } from '@tanstack/react-query';
import { Activity, CheckCircle2, Database, Scale } from 'lucide-react';
import { lexa } from '@/api/lexa';

export function Dashboard() {
  const health = useQuery({ queryKey: ['health'], queryFn: lexa.health });
  const stats = useQuery({ queryKey: ['stats'], queryFn: lexa.transactionStats });
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 10], queryFn: () => lexa.ledgerList(10) });

  const totalDebit = balance.data?.accounts.reduce((s, a) => s + a.totalDebit, 0) ?? 0;
  const totalCredit = balance.data?.accounts.reduce((s, a) => s + a.totalCredit, 0) ?? 0;
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  return (
    <div className="p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl mb-1">Tableau de bord</h1>
        <p className="text-lexa-muted text-sm">Vue d'ensemble de votre comptabilité Lexa</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          icon={Activity}
          label="Évènements"
          value={stats.data?.total ?? '—'}
          loading={stats.isLoading}
        />
        <StatCard
          icon={Database}
          label="Comptes utilisés"
          value={balance.data?.accountsCount ?? '—'}
          loading={balance.isLoading}
        />
        <StatCard
          icon={Scale}
          label="Total débit"
          value={`CHF ${totalDebit.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}`}
          loading={balance.isLoading}
        />
        <StatCard
          icon={CheckCircle2}
          label="Balance"
          value={balanced ? 'Équilibrée' : 'Déséquilibre'}
          tone={balanced ? 'success' : 'danger'}
          loading={balance.isLoading}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6">
          <h2 className="text-lg mb-4">Services backend</h2>
          {health.isLoading && <div className="text-sm text-lexa-muted">Vérification...</div>}
          {health.data && (
            <div className="space-y-2">
              <ServiceRow name="Postgres" ok={health.data.services.postgres} />
              <ServiceRow
                name="Qdrant"
                ok={health.data.services.qdrant}
                extra={`${health.data.services.qdrantPoints} pts KB`}
              />
              <ServiceRow name="Ollama (LLM)" ok={health.data.services.ollama} />
              <ServiceRow name="BGE-M3 (embeddings)" ok={health.data.services.embedder} />
            </div>
          )}
          {health.error && (
            <div className="text-sm text-lexa-danger">
              Backend injoignable. Vérifiez la connexion à .59:3010.
            </div>
          )}
        </div>

        <div className="card p-6">
          <h2 className="text-lg mb-4">Écritures récentes</h2>
          {entries.isLoading && <div className="text-sm text-lexa-muted">Chargement...</div>}
          {entries.data && entries.data.entries.length === 0 && (
            <div className="text-sm text-lexa-muted">
              Aucune écriture. Envoyez une transaction via Swigs Pro ou l'API.
            </div>
          )}
          {entries.data && entries.data.entries.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-auto">
              {entries.data.entries.slice(0, 10).map((e, i) => (
                <div
                  key={`${e.eventId}-${e.lineType}-${i}`}
                  className="flex items-start justify-between gap-3 py-2 border-b border-lexa-border last:border-0"
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-sm truncate">{e.description}</div>
                    <div className="text-xs text-lexa-muted mt-0.5 truncate">
                      {e.account}
                      {e.tvaCode && <span className="ml-2 chip">{e.tvaCode}</span>}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-mono flex-shrink-0 ${
                      e.lineType === 'debit' ? 'text-lexa-success' : 'text-lexa-danger'
                    }`}
                  >
                    {e.lineType === 'debit' ? '+' : '−'}
                    {e.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
  tone = 'default',
}: {
  icon: typeof Activity;
  label: string;
  value: string | number;
  loading?: boolean;
  tone?: 'default' | 'success' | 'danger';
}) {
  const toneCls =
    tone === 'success' ? 'text-lexa-success' : tone === 'danger' ? 'text-lexa-danger' : '';
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 text-lexa-muted text-xs uppercase tracking-wider mb-3">
        <Icon className="w-4 h-4" />
        {label}
      </div>
      <div className={`text-2xl font-display ${toneCls}`}>
        {loading ? '...' : value}
      </div>
    </div>
  );
}

function ServiceRow({ name, ok, extra }: { name: string; ok: boolean; extra?: string }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-lexa-border last:border-0">
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${ok ? 'bg-lexa-success' : 'bg-lexa-danger'}`}
        />
        <span className="text-sm">{name}</span>
      </div>
      <div className="text-xs text-lexa-muted">{extra}</div>
    </div>
  );
}
