import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  BookOpen,
  TrendingUp,
  Activity,
  MessageSquare,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Info,
  X,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import type { ClosingAccountLine, LedgerGap } from '@/api/types';

// ─── Sub-components ───────────────────────────────────────────────────────────

function AccountTable({ lines, emptyLabel }: { lines: ClosingAccountLine[]; emptyLabel: string }) {
  if (lines.length === 0) {
    return <p className="text-sm text-muted italic py-4">{emptyLabel}</p>;
  }
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-border">
          <th className="text-left pb-1 text-muted font-normal text-xs">Compte</th>
          <th className="text-left pb-1 text-muted font-normal text-xs pl-2">Libellé</th>
          <th className="text-right pb-1 text-muted font-normal text-xs">Solde CHF</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.account} className="border-b border-border/40 hover:bg-elevated/50">
            <td className="py-1 mono-num text-xs text-subtle">{l.account}</td>
            <td className="py-1 pl-2 text-ink">
              {l.accountName ?? <span className="text-muted italic">—</span>}
            </td>
            <td className="py-1 text-right mono-num font-medium">
              {l.balance.toLocaleString('fr-CH', { minimumFractionDigits: 2 })}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function GapBadge({ gap }: { gap: LedgerGap }) {
  const colors: Record<string, string> = {
    error: 'text-danger bg-danger/10 border-danger/30',
    warning: 'text-warning bg-warning/10 border-warning/30',
    info: 'text-muted bg-elevated border-border',
  };
  const Icon = gap.severity === 'error' ? XCircle : gap.severity === 'warning' ? AlertTriangle : Info;
  return (
    <div className={`flex items-start gap-2 p-2 rounded-md border text-xs ${colors[gap.severity]}`}>
      <Icon className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
      <span>{gap.message}</span>
    </div>
  );
}

// ─── Chat overlay ─────────────────────────────────────────────────────────────

function ClotureChat({
  year,
  bsSummary,
  isPsSummary,
  onClose,
}: {
  year: number;
  bsSummary?: { assetsTotal: number; liabilitiesTotal: number; equityTotal: number; isBalanced: boolean };
  isPsSummary?: { revenuesTotal: number; chargesTotal: number; netResult: number };
  onClose: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  const ask = useMutation({
    mutationFn: (q: string) =>
      lexa.askCloture({
        question: q,
        year,
        balanceSheet: bsSummary,
        incomeStatement: isPsSummary,
      }),
    onSuccess: (data, q) => {
      setHistory((h) => [
        ...h,
        { role: 'user', text: q },
        { role: 'agent', text: data.answer ?? '' },
      ]);
      setQuestion('');
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center p-4">
      <div className="w-full max-w-2xl bg-surface border border-border rounded-xl shadow-2xl flex flex-col max-h-[70vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center text-xs font-bold">
              C
            </div>
            <span className="text-sm font-semibold">Agent Clôture — CO 957-963</span>
            <span className="chip">lexa-cloture</span>
          </div>
          <button onClick={onClose} className="btn-ghost !p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {history.length === 0 && (
            <p className="text-sm text-muted italic text-center py-6">
              Posez votre question sur la clôture comptable, les amortissements, provisions, bilan…
            </p>
          )}
          {history.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-accent text-accent-fg'
                    : 'bg-elevated border border-border text-ink'
                }`}
              >
                {m.text}
              </div>
            </div>
          ))}
          {ask.isPending && (
            <div className="flex justify-start">
              <div className="bg-elevated border border-border rounded-lg px-3 py-2 text-sm text-muted animate-pulse">
                Lexa Clôture réfléchit…
              </div>
            </div>
          )}
          {ask.isError && (
            <p className="text-xs text-danger text-center">
              Erreur agent: {(ask.error as Error).message}
            </p>
          )}
        </div>

        {/* Input */}
        <div className="border-t border-border p-3 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim()) ask.mutate(question.trim());
            }}
            className="flex gap-2"
          >
            <input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Ex: Comment amortir un véhicule professionnel ?"
              className="input flex-1 text-sm"
              disabled={ask.isPending}
            />
            <button
              type="submit"
              disabled={!question.trim() || ask.isPending}
              className="btn-primary !py-1.5 !px-3 text-sm"
            >
              Envoyer
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function CloseYear() {
  const { year: yearParam } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const year = parseInt(yearParam ?? String(new Date().getFullYear()), 10);
  const [activeTab, setActiveTab] = useState<'bilan' | 'resultat' | 'sante'>('bilan');
  const [chatOpen, setChatOpen] = useState(false);

  const bsQuery = useQuery({
    queryKey: ['balance-sheet', year],
    queryFn: () => lexa.getBalanceSheet(year),
    retry: 1,
  });

  const isQuery = useQuery({
    queryKey: ['income-statement', year],
    queryFn: () => lexa.getIncomeStatement(year),
    retry: 1,
  });

  const healthQuery = useQuery({
    queryKey: ['ledger-health', year],
    queryFn: () => lexa.getLedgerHealth(year),
    retry: 1,
  });

  const isLoading = bsQuery.isLoading || isQuery.isLoading || healthQuery.isLoading;

  const tabs = [
    { id: 'bilan' as const, label: 'Bilan', icon: BookOpen },
    { id: 'resultat' as const, label: 'Compte de résultat', icon: TrendingUp },
    { id: 'sante' as const, label: 'Santé comptable', icon: Activity },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-ink">
      {/* Header — wrap mobile, inline desktop */}
      <header className="min-h-12 flex flex-wrap items-center justify-between gap-2 px-4 py-2 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <button
            onClick={() => navigate('/workspace')}
            className="btn-ghost !p-1.5 flex-shrink-0"
            title="Retour au workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center font-semibold text-xs flex-shrink-0">
            L
          </div>
          <span className="text-sm font-semibold truncate">Clôture continue</span>
          <span className="chip flex-shrink-0">Exercice {year}</span>
          {healthQuery.data && (
            <span
              className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${
                healthQuery.data.isBalanced
                  ? 'text-success bg-success/10 border-success/30'
                  : 'text-danger bg-danger/10 border-danger/30'
              }`}
            >
              {healthQuery.data.isBalanced ? (
                <CheckCircle className="w-3 h-3" />
              ) : (
                <XCircle className="w-3 h-3" />
              )}
              {healthQuery.data.isBalanced ? 'Équilibré' : 'Déséquilibré'}
            </span>
          )}
        </div>

        <button
          onClick={() => setChatOpen(true)}
          className="btn-primary !px-3 !py-1.5 flex items-center gap-1.5 flex-shrink-0"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="text-xs hidden sm:inline">Ask agent Clôture</span>
          <span className="text-xs sm:hidden">Ask IA</span>
        </button>
      </header>

      {/* Tabs */}
      <div className="border-b border-border bg-surface flex-shrink-0">
        <div className="flex px-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-accent text-accent font-medium'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <main className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading && (
          <div className="flex items-center justify-center h-32">
            <div className="text-muted text-sm animate-pulse">Projection en cours…</div>
          </div>
        )}

        {/* Tab: Bilan */}
        {!isLoading && activeTab === 'bilan' && bsQuery.data && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Bilan au {bsQuery.data.asOf}
              </h2>
              <span
                className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full border ${
                  bsQuery.data.isBalanced
                    ? 'text-success bg-success/10 border-success/30'
                    : 'text-danger bg-danger/10 border-danger/30'
                }`}
              >
                {bsQuery.data.isBalanced ? (
                  <><CheckCircle className="w-3 h-3" /> Équilibré CO art. 959a</>
                ) : (
                  <><XCircle className="w-3 h-3" /> Déséquilibré — CO art. 958c</>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Actifs */}
              <div className="card-elevated p-4">
                <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                  Actifs
                  <span className="mono-num text-xs text-muted">(classe 1)</span>
                </h3>
                <AccountTable
                  lines={bsQuery.data.assets}
                  emptyLabel="Aucun actif enregistré pour cet exercice."
                />
                <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                  <span>Total Actifs</span>
                  <span className="mono-num">
                    {bsQuery.data.assetsTotal.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                  </span>
                </div>
              </div>

              {/* Passifs + Fonds propres */}
              <div className="space-y-4">
                <div className="card-elevated p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    Passifs
                    <span className="mono-num text-xs text-muted">(classe 2, comptes 20-27)</span>
                  </h3>
                  <AccountTable
                    lines={bsQuery.data.liabilities}
                    emptyLabel="Aucun passif enregistré."
                  />
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                    <span>Total Passifs</span>
                    <span className="mono-num">
                      {bsQuery.data.liabilitiesTotal.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                    </span>
                  </div>
                </div>

                <div className="card-elevated p-4">
                  <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
                    Fonds propres
                    <span className="mono-num text-xs text-muted">(classe 2, comptes 28-29)</span>
                  </h3>
                  <AccountTable
                    lines={bsQuery.data.equity}
                    emptyLabel="Aucun fonds propre enregistré."
                  />
                  <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold">
                    <span>Total Fonds propres</span>
                    <span className="mono-num">
                      {bsQuery.data.equityTotal.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                    </span>
                  </div>
                </div>

                <div className="card-elevated p-3 bg-elevated/60">
                  <div className="flex justify-between text-sm font-bold">
                    <span>Total Passifs + Fonds propres</span>
                    <span className="mono-num">
                      {(bsQuery.data.liabilitiesTotal + bsQuery.data.equityTotal).toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Tab: Compte de résultat */}
        {!isLoading && activeTab === 'resultat' && isQuery.data && (
          <div className="max-w-3xl mx-auto space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold">
                Compte de résultat — {isQuery.data.period.start} → {isQuery.data.period.end}
              </h2>
              <span
                className={`text-xs font-semibold px-2 py-1 rounded-full ${
                  isQuery.data.netResult >= 0
                    ? 'text-success bg-success/10'
                    : 'text-danger bg-danger/10'
                }`}
              >
                {isQuery.data.netResult >= 0 ? 'Bénéfice' : 'Perte'}{' '}
                {Math.abs(isQuery.data.netResult).toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
              </span>
            </div>

            <div className="card-elevated p-4">
              <h3 className="text-sm font-semibold mb-3 text-success flex items-center gap-2">
                Produits d'exploitation
                <span className="text-xs text-muted font-normal">(classe 3)</span>
              </h3>
              <AccountTable
                lines={isQuery.data.revenues}
                emptyLabel="Aucun produit enregistré pour cet exercice."
              />
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold text-success">
                <span>Total Produits</span>
                <span className="mono-num">
                  + {isQuery.data.revenuesTotal.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                </span>
              </div>
            </div>

            <div className="card-elevated p-4">
              <h3 className="text-sm font-semibold mb-3 text-danger flex items-center gap-2">
                Charges
                <span className="text-xs text-muted font-normal">(classes 4/5/6)</span>
              </h3>
              <AccountTable
                lines={isQuery.data.charges}
                emptyLabel="Aucune charge enregistrée pour cet exercice."
              />
              <div className="mt-3 pt-3 border-t border-border flex justify-between text-sm font-semibold text-danger">
                <span>Total Charges</span>
                <span className="mono-num">
                  − {isQuery.data.chargesTotal.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                </span>
              </div>
            </div>

            {(isQuery.data.financialResult !== 0 || isQuery.data.extraordinaryResult !== 0) && (
              <div className="card-elevated p-4 space-y-2">
                {isQuery.data.financialResult !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Résultat financier (classe 7)</span>
                    <span className={`mono-num font-medium ${isQuery.data.financialResult >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isQuery.data.financialResult >= 0 ? '+' : ''}{isQuery.data.financialResult.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                    </span>
                  </div>
                )}
                {isQuery.data.extraordinaryResult !== 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted">Résultat extraordinaire + impôts (8/9)</span>
                    <span className={`mono-num font-medium ${isQuery.data.extraordinaryResult >= 0 ? 'text-success' : 'text-danger'}`}>
                      {isQuery.data.extraordinaryResult >= 0 ? '+' : ''}{isQuery.data.extraordinaryResult.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                    </span>
                  </div>
                )}
              </div>
            )}

            <div className="card-elevated p-4 border-2 border-accent/20">
              <div className="flex justify-between text-base font-bold">
                <span>Résultat net</span>
                <span className={`mono-num ${isQuery.data.netResult >= 0 ? 'text-success' : 'text-danger'}`}>
                  {isQuery.data.netResult >= 0 ? '+' : ''}{isQuery.data.netResult.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                </span>
              </div>
              <p className="text-xs text-muted mt-1">CO art. 959b — Structure du compte de résultat</p>
            </div>
          </div>
        )}

        {/* Tab: Santé */}
        {!isLoading && activeTab === 'sante' && healthQuery.data && (
          <div className="max-w-2xl mx-auto space-y-4">
            <h2 className="text-base font-semibold">Santé comptable — Exercice {year}</h2>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="card-elevated p-4 text-center">
                <p className="text-2xl font-bold mono-num">{healthQuery.data.entriesCount}</p>
                <p className="text-xs text-muted mt-1">Écritures {year}</p>
              </div>
              <div className="card-elevated p-4 text-center">
                <p className="text-sm font-medium">
                  {healthQuery.data.lastEntryDate ?? <span className="text-muted">—</span>}
                </p>
                <p className="text-xs text-muted mt-1">Dernière écriture</p>
              </div>
              <div className="card-elevated p-4 text-center">
                <p
                  className={`text-sm font-semibold flex items-center justify-center gap-1 ${
                    healthQuery.data.co_959c_ready ? 'text-success' : 'text-warning'
                  }`}
                >
                  {healthQuery.data.co_959c_ready ? (
                    <><CheckCircle className="w-4 h-4" /> Prêt</>
                  ) : (
                    <><AlertTriangle className="w-4 h-4" /> Incomplet</>
                  )}
                </p>
                <p className="text-xs text-muted mt-1">Annexe CO 959c</p>
              </div>
            </div>

            {healthQuery.data.gaps.length === 0 ? (
              <div className="card-elevated p-4 flex items-center gap-2 text-success">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <p className="text-sm">Aucune anomalie détectée — CO art. 958c respecté.</p>
              </div>
            ) : (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-muted uppercase tracking-wide">
                  Points d'attention ({healthQuery.data.gaps.length})
                </h3>
                {healthQuery.data.gaps.map((gap, i) => (
                  <GapBadge key={i} gap={gap} />
                ))}
              </div>
            )}

            <div className="card-elevated p-3 text-xs text-muted">
              <p className="font-medium mb-1">Références légales</p>
              <ul className="space-y-0.5">
                <li>• CO art. 958 — Principes de régularité comptable</li>
                <li>• CO art. 958c — Principes d'établissement des comptes (image fidèle)</li>
                <li>• CO art. 959c — Contenu de l'annexe aux comptes annuels</li>
                <li>• CO art. 960 — Évaluation des actifs</li>
              </ul>
            </div>
          </div>
        )}
      </main>

      {/* Floating agent button (mobile fallback) */}
      <button
        onClick={() => setChatOpen(true)}
        className="fixed bottom-6 right-6 btn-primary rounded-full w-12 h-12 flex items-center justify-center shadow-lg md:hidden"
        title="Ask agent Clôture"
      >
        <MessageSquare className="w-5 h-5" />
      </button>

      {/* Chat overlay */}
      {chatOpen && bsQuery.data && (
        <ClotureChat
          year={year}
          bsSummary={{
            assetsTotal: bsQuery.data.assetsTotal,
            liabilitiesTotal: bsQuery.data.liabilitiesTotal,
            equityTotal: bsQuery.data.equityTotal,
            isBalanced: bsQuery.data.isBalanced,
          }}
          isPsSummary={
            isQuery.data
              ? {
                  revenuesTotal: isQuery.data.revenuesTotal,
                  chargesTotal: isQuery.data.chargesTotal,
                  netResult: isQuery.data.netResult,
                }
              : undefined
          }
          onClose={() => setChatOpen(false)}
        />
      )}
    </div>
  );
}
