/**
 * Conseiller — Page /conseiller/:year (session 31)
 *
 * Agent conseiller optimisation fiscale proactive :
 * - 3 cards "Simulations rapides" : Rachat LPP, Pilier 3a, Dividende vs Salaire
 * - Bouton "Briefing quotidien" → ask agent avec contexte auto
 * - Chat overlay pour questions libres
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Lightbulb,
  TrendingUp,
  MessageSquare,
  X,
  Send,
  ChevronRight,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { lexa } from '@/api/lexa';

// ─── ConseillerChat overlay ───────────────────────────────────────────────────

function ConseillerChat({
  year,
  onClose,
  initialQuestion,
}: {
  year: number;
  onClose: () => void;
  initialQuestion?: string;
}) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; text: string }>>(
    initialQuestion ? [{ role: 'user', text: initialQuestion }] : [],
  );

  const askMutation = useMutation({
    mutationFn: (q: string) =>
      lexa.askConseiller({
        question: q,
        year,
        context: { entityType: 'pm' },
      }),
    onSuccess: (data) => {
      setHistory((h) => [
        ...h,
        {
          role: 'agent',
          text: data.answer + '\n\n_' + data.disclaimer + '_',
        },
      ]);
    },
  });

  // Auto-ask initial question
  useState(() => {
    if (initialQuestion) {
      askMutation.mutate(initialQuestion);
    }
  });

  const handleSend = () => {
    if (!question.trim()) return;
    setHistory((h) => [...h, { role: 'user', text: question.trim() }]);
    askMutation.mutate(question.trim());
    setQuestion('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end p-4 bg-black/20 backdrop-blur-sm">
      <div className="w-full max-w-lg bg-background border border-border rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-amber-400" />
            <span className="font-semibold text-sm">Agent Conseiller — LIFD art. 33</span>
          </div>
          <button onClick={onClose} className="text-muted hover:text-ink transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {history.length === 0 && !askMutation.isPending && (
            <p className="text-sm text-muted italic">
              Posez une question sur l'optimisation fiscale, les déductions LPP/3a, ou la
              comparaison dividende/salaire…
            </p>
          )}
          {history.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-lg p-3 text-sm ${
                  msg.role === 'user'
                    ? 'bg-primary text-white'
                    : 'bg-elevated text-ink border border-border'
                }`}
              >
                <pre className="whitespace-pre-wrap font-sans">{msg.text}</pre>
              </div>
            </div>
          ))}
          {askMutation.isPending && (
            <div className="flex justify-start">
              <div className="bg-elevated border border-border rounded-lg p-3 text-sm text-muted italic">
                Analyse en cours…
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="p-4 border-t border-border">
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
              placeholder="Ex: Comment optimiser mon rachat LPP en Valais ?"
              className="flex-1 bg-elevated border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <button
              onClick={handleSend}
              disabled={!question.trim() || askMutation.isPending}
              className="bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── SimCard Rachat LPP ────────────────────────────────────────────────────────

function RachatLppCard({ year }: { year: number }) {
  const [canton, setCanton] = useState<'VS' | 'GE' | 'VD' | 'FR'>('VS');
  const [income, setIncome] = useState('85000');
  const [purchase, setPurchase] = useState('10000');
  const [civil, setCivil] = useState<'single' | 'married'>('single');

  const sim = useMutation({
    mutationFn: () =>
      lexa.simulateRachatLpp({
        canton,
        year,
        currentIncome: parseFloat(income) || 0,
        additionalLppPurchase: parseFloat(purchase) || 0,
        civilStatus: civil,
      }),
  });

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-green-500" />
        <h3 className="font-semibold text-sm">Rachat LPP</h3>
        <span className="ml-auto text-xs text-muted font-mono">LIFD art. 33 al. 1 d</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-muted mb-1">Canton</label>
          <select
            value={canton}
            onChange={(e) => setCanton(e.target.value as typeof canton)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            {(['VS', 'GE', 'VD', 'FR'] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Statut civil</label>
          <select
            value={civil}
            onChange={(e) => setCivil(e.target.value as typeof civil)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="single">Célibataire</option>
            <option value="married">Marié</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Revenu imposable (CHF)</label>
          <input
            type="number"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Montant rachat (CHF)</label>
          <input
            type="number"
            value={purchase}
            onChange={(e) => setPurchase(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      <button
        onClick={() => sim.mutate()}
        disabled={sim.isPending}
        className="w-full text-xs bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
      >
        {sim.isPending ? 'Calcul…' : 'Simuler'}
        {!sim.isPending && <ChevronRight className="w-3 h-3" />}
      </button>

      {sim.data && (
        <div className="mt-3 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted">Économie fiscale estimée</span>
            <span className="text-lg font-bold text-green-500 mono-num">
              {sim.data.savings.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Taux effectif d'économie</span>
            <span className="font-mono">{sim.data.effectiveSavingsRate}%</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted mt-1">
            <span>Impôt avant / après</span>
            <span className="font-mono">
              {sim.data.baseTax.toLocaleString('fr-CH')} → {sim.data.afterLppTax.toLocaleString('fr-CH')} CHF
            </span>
          </div>
          <p className="text-[10px] text-muted/60 mt-2 italic leading-tight">{sim.data.disclaimer}</p>
        </div>
      )}

      {sim.isError && (
        <div className="mt-2 flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="w-3 h-3" />
          Erreur de simulation
        </div>
      )}
    </div>
  );
}

// ─── SimCard Pilier 3a ────────────────────────────────────────────────────────

function Pilier3aCard({ year }: { year: number }) {
  const [canton, setCanton] = useState<'VS' | 'GE' | 'VD' | 'FR'>('VS');
  const [income, setIncome] = useState('85000');
  const [current3a, setCurrent3a] = useState('0');
  const [target3a, setTarget3a] = useState('7260');
  const [civil, setCivil] = useState<'single' | 'married'>('single');

  const sim = useMutation({
    mutationFn: () =>
      lexa.simulatePilier3a({
        canton,
        year,
        currentIncome: parseFloat(income) || 0,
        current3a: parseFloat(current3a) || 0,
        target3a: parseFloat(target3a) || 0,
        civilStatus: civil,
      }),
  });

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        <h3 className="font-semibold text-sm">Pilier 3a</h3>
        <span className="ml-auto text-xs text-muted font-mono">LIFD art. 33 al. 1 e</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-muted mb-1">Canton</label>
          <select
            value={canton}
            onChange={(e) => setCanton(e.target.value as typeof canton)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            {(['VS', 'GE', 'VD', 'FR'] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Statut civil</label>
          <select
            value={civil}
            onChange={(e) => setCivil(e.target.value as typeof civil)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="single">Célibataire</option>
            <option value="married">Marié</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Revenu imposable (CHF)</label>
          <input
            type="number"
            value={income}
            onChange={(e) => setIncome(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">3a actuel (CHF)</label>
          <input
            type="number"
            value={current3a}
            onChange={(e) => setCurrent3a(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div className="col-span-2">
          <label className="block text-xs text-muted mb-1">Cible 3a (CHF) — plafond avec LPP: 7'260</label>
          <input
            type="number"
            value={target3a}
            onChange={(e) => setTarget3a(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      <button
        onClick={() => sim.mutate()}
        disabled={sim.isPending}
        className="w-full text-xs bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
      >
        {sim.isPending ? 'Calcul…' : 'Simuler'}
        {!sim.isPending && <ChevronRight className="w-3 h-3" />}
      </button>

      {sim.data && (
        <div className="mt-3 p-3 bg-blue-500/5 border border-blue-500/20 rounded-lg">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted">Économie fiscale estimée</span>
            <span className="text-lg font-bold text-blue-500 mono-num">
              {sim.data.savings.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>Contribution additionnelle</span>
            <span className="font-mono">
              {sim.data.cappedAdditionalContribution.toLocaleString('fr-CH')} CHF
            </span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted mt-1">
            <span>Plafond {year}</span>
            <span className="font-mono">{sim.data.plafond2026.toLocaleString('fr-CH')} CHF</span>
          </div>
          <p className="text-[10px] text-muted/60 mt-2 italic leading-tight">{sim.data.disclaimer}</p>
        </div>
      )}

      {sim.isError && (
        <div className="mt-2 flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="w-3 h-3" />
          Erreur de simulation
        </div>
      )}
    </div>
  );
}

// ─── SimCard Dividende vs Salaire ─────────────────────────────────────────────

function DividendVsSalaryCard() {
  const [canton, setCanton] = useState<'VS' | 'GE' | 'VD' | 'FR'>('GE');
  const [amount, setAmount] = useState('100000');
  const [marginal, setMarginal] = useState('25');
  const [legalForm, setLegalForm] = useState<'sarl' | 'sa'>('sa');

  const sim = useMutation({
    mutationFn: () =>
      lexa.simulateDividendVsSalary({
        amountAvailable: parseFloat(amount) || 0,
        shareholderMarginalRate: (parseFloat(marginal) || 25) / 100,
        canton,
        legalForm,
      }),
  });

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-purple-500" />
        <h3 className="font-semibold text-sm">Dividende vs Salaire</h3>
        <span className="ml-auto text-xs text-muted font-mono">LIFD art. 20 al. 1bis</span>
      </div>

      <div className="grid grid-cols-2 gap-2 mb-3">
        <div>
          <label className="block text-xs text-muted mb-1">Canton</label>
          <select
            value={canton}
            onChange={(e) => setCanton(e.target.value as typeof canton)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            {(['VS', 'GE', 'VD', 'FR'] as const).map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Forme juridique</label>
          <select
            value={legalForm}
            onChange={(e) => setLegalForm(e.target.value as typeof legalForm)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          >
            <option value="sa">SA</option>
            <option value="sarl">Sàrl</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Montant disponible (CHF)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label className="block text-xs text-muted mb-1">Taux marginal actionnaire (%)</label>
          <input
            type="number"
            value={marginal}
            min="0"
            max="100"
            onChange={(e) => setMarginal(e.target.value)}
            className="w-full bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      <button
        onClick={() => sim.mutate()}
        disabled={sim.isPending}
        className="w-full text-xs bg-primary text-white rounded-lg px-3 py-2 hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
      >
        {sim.isPending ? 'Calcul…' : 'Comparer'}
        {!sim.isPending && <ChevronRight className="w-3 h-3" />}
      </button>

      {sim.data && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            {/* Salaire */}
            <div
              className={`p-2 rounded-lg border text-xs ${
                sim.data.recommendation === 'salary'
                  ? 'border-green-500/40 bg-green-500/5'
                  : 'border-border bg-elevated'
              }`}
            >
              <div className="font-semibold mb-1 flex items-center gap-1">
                {sim.data.recommendation === 'salary' && (
                  <span className="text-green-500 text-[10px]">✓ Recommandé</span>
                )}
                Salaire
              </div>
              <div className="text-muted">
                Net en main:{' '}
                <span className="font-mono text-ink">
                  {sim.data.salary.netInHand.toLocaleString('fr-CH')} CHF
                </span>
              </div>
              <div className="text-muted">
                Coût société:{' '}
                <span className="font-mono">
                  {sim.data.salary.companyCost.toLocaleString('fr-CH')} CHF
                </span>
              </div>
            </div>

            {/* Dividende */}
            <div
              className={`p-2 rounded-lg border text-xs ${
                sim.data.recommendation === 'dividend'
                  ? 'border-green-500/40 bg-green-500/5'
                  : 'border-border bg-elevated'
              }`}
            >
              <div className="font-semibold mb-1 flex items-center gap-1">
                {sim.data.recommendation === 'dividend' && (
                  <span className="text-green-500 text-[10px]">✓ Recommandé</span>
                )}
                Dividende
              </div>
              <div className="text-muted">
                Net en main:{' '}
                <span className="font-mono text-ink">
                  {sim.data.dividend.netInHand.toLocaleString('fr-CH')} CHF
                </span>
              </div>
              <div className="text-muted">
                IS société:{' '}
                <span className="font-mono">
                  {(sim.data.dividend.corporateTaxIfd + sim.data.dividend.corporateTaxCantonal).toLocaleString('fr-CH')}{' '}
                  CHF
                </span>
              </div>
            </div>
          </div>

          {sim.data.recommendation !== 'equal' && (
            <div className="text-xs text-center text-muted">
              {sim.data.recommendation === 'dividend' ? 'Dividende' : 'Salaire'} plus avantageux de{' '}
              <span className="font-mono text-green-500">
                {Math.abs(sim.data.savingsByDividend).toLocaleString('fr-CH')} CHF
              </span>
            </div>
          )}

          <p className="text-[10px] text-muted/60 italic leading-tight">{sim.data.disclaimer}</p>
        </div>
      )}

      {sim.isError && (
        <div className="mt-2 flex items-center gap-1 text-xs text-danger">
          <AlertCircle className="w-3 h-3" />
          Erreur de simulation
        </div>
      )}
    </div>
  );
}

// ─── BriefingSection ─────────────────────────────────────────────────────────

function BriefingSection({ year }: { year: number }) {
  const queryClient = useQueryClient();

  const { data: briefingsData, isLoading } = useQuery({
    queryKey: ['briefings', 7],
    queryFn: () => lexa.listBriefings(7),
    staleTime: 60_000,
  });

  const generateMutation = useMutation({
    mutationFn: () => lexa.generateBriefingNow(year),
    onSuccess: () => {
      // Poll à 20s et 35s pour récupérer le briefing généré (~25s côté Ollama)
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['briefings', 7] });
      }, 20_000);
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['briefings', 7] });
      }, 35_000);
    },
  });

  const today = new Date().toISOString().slice(0, 10);
  // BUG4 fix: b.date_for peut être "2026-04-17" (DATE PG) ou "2026-04-17T00:00:00.000Z"
  // selon le driver Postgres. On normalise les deux formats en slicant les 10 premiers chars.
  const normDate = (d: string | null | undefined): string =>
    d ? (typeof d === 'string' ? d.slice(0, 10) : new Date(d).toISOString().slice(0, 10)) : '';
  const todayBriefing = briefingsData?.briefings?.find((b) => normDate(b.date_for) === today);
  const historyBriefings = briefingsData?.briefings?.filter((b) => normDate(b.date_for) !== today) ?? [];

  const handleMarkRead = (id: string) => {
    lexa.markBriefingRead(id).then(() => {
      queryClient.invalidateQueries({ queryKey: ['briefings', 7] });
    });
  };

  if (isLoading) {
    return (
      <div className="bg-background border border-border rounded-xl p-6 mb-6 animate-pulse">
        <div className="h-4 bg-elevated rounded w-1/3 mb-3" />
        <div className="h-3 bg-elevated rounded w-2/3" />
      </div>
    );
  }

  return (
    <>
      {/* ── Briefing du jour ── */}
      {todayBriefing ? (
        <section className="bg-background border border-border rounded-xl p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h2 className="text-base font-semibold">Briefing du jour</h2>
            <span className="text-xs text-muted ml-auto font-mono">{todayBriefing.date_for}</span>
            {todayBriefing.read_at && (
              <span className="text-xs text-green-500">Lu</span>
            )}
          </div>
          <div className="prose prose-sm prose-invert max-w-none text-sm leading-relaxed
            prose-headings:text-ink prose-headings:font-semibold prose-headings:mb-2
            prose-h1:text-base prose-h2:text-sm prose-h3:text-sm
            prose-p:text-ink/80 prose-li:text-ink/80 prose-strong:text-ink
            prose-hr:border-border">
            <ReactMarkdown>{todayBriefing.markdown}</ReactMarkdown>
          </div>
          {!todayBriefing.read_at && (
            <button
              onClick={() => handleMarkRead(todayBriefing.id)}
              className="mt-4 text-xs text-muted hover:text-ink transition-colors underline underline-offset-2"
            >
              Marquer comme lu
            </button>
          )}
        </section>
      ) : (
        <section className="bg-background border border-border rounded-xl p-6 mb-6 text-center">
          <Sparkles className="w-8 h-8 mx-auto mb-3 text-warning" />
          <p className="text-sm text-muted mb-1">Pas encore de briefing pour aujourd'hui.</p>
          <p className="text-xs text-muted/60 mb-4">
            Il sera généré automatiquement à 6h du matin, ou vous pouvez le générer maintenant.
          </p>
          <button
            onClick={() => generateMutation.mutate()}
            disabled={generateMutation.isPending || generateMutation.isSuccess}
            className="text-xs bg-amber-500 text-white rounded-lg px-4 py-2 hover:bg-amber-600 disabled:opacity-50 transition-colors"
          >
            {generateMutation.isPending
              ? 'Envoi…'
              : generateMutation.isSuccess
                ? 'En cours de génération (~20s)…'
                : 'Générer maintenant'}
          </button>
          {generateMutation.isSuccess && (
            <p className="text-xs text-muted mt-3">
              Le briefing arrive dans quelques secondes — rechargez si nécessaire.
            </p>
          )}
          {generateMutation.isError && (
            <p className="text-xs text-danger mt-2 flex items-center gap-1 justify-center">
              <AlertCircle className="w-3 h-3" />
              Erreur lors de la génération
            </p>
          )}
        </section>
      )}

      {/* ── Historique 7 jours ── */}
      {historyBriefings.length > 0 && (
        <details className="bg-background border border-border rounded-xl p-4 mb-6">
          <summary className="cursor-pointer text-sm text-muted hover:text-ink transition-colors select-none">
            Historique ({historyBriefings.length} briefing{historyBriefings.length > 1 ? 's' : ''})
          </summary>
          <div className="mt-4 space-y-4">
            {historyBriefings.map((b) => (
              <div key={b.id} className="border-l-2 border-border pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-mono text-muted">{b.date_for}</span>
                  {b.read_at && <span className="text-[10px] text-green-500">Lu</span>}
                </div>
                <div className="prose prose-xs prose-invert max-w-none text-xs leading-relaxed
                  prose-headings:text-ink prose-headings:font-medium prose-headings:text-xs
                  prose-p:text-ink/70 prose-li:text-ink/70">
                  <ReactMarkdown>{b.markdown ?? '_Briefing non disponible_'}</ReactMarkdown>
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function Conseiller() {
  const { year: yearParam } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const year = parseInt(yearParam ?? '2026', 10);
  const [showChat, setShowChat] = useState(false);
  const [chatInitialQuestion, setChatInitialQuestion] = useState<string | undefined>();

  const handleBriefing = () => {
    setChatInitialQuestion(
      `Voici mon dossier fiscal ${year} — bilan actif 228k CHF, bénéfice 264k CHF, charges 62k CHF. ` +
        `Peux-tu me donner un briefing quotidien sur 3 opportunités d'optimisation fiscale prioritaires ?`,
    );
    setShowChat(true);
  };

  return (
    <div className="min-h-screen bg-base">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3 flex items-center gap-3">
        <button
          onClick={() => navigate('/workspace')}
          className="text-muted hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <Lightbulb className="w-5 h-5 text-amber-400" />
        <h1 className="font-semibold text-sm">Conseiller fiscal — {year}</h1>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted">LIFD art. 33 · 58 · 62 · 68 · LHID art. 24-31</span>
          <button
            onClick={handleBriefing}
            className="flex items-center gap-1.5 text-xs bg-amber-500 text-white rounded-lg px-3 py-1.5 hover:bg-amber-600 transition-colors"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            Briefing IA
          </button>
          <button
            onClick={() => {
              setChatInitialQuestion(undefined);
              setShowChat(true);
            }}
            className="flex items-center gap-1.5 text-xs bg-primary text-white rounded-lg px-3 py-1.5 hover:bg-primary/90 transition-colors"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Ask Conseiller
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Briefing quotidien (section principale) ── */}
        <BriefingSection year={year} />

        {/* Intro */}
        <div className="bg-background border border-border rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-amber-400 mt-0.5 flex-shrink-0" />
            <div>
              <h2 className="font-semibold text-sm mb-1">Optimisation fiscale proactive {year}</h2>
              <p className="text-xs text-muted leading-relaxed">
                L'agent conseiller analyse votre situation et identifie des opportunités d'optimisation
                fiscale légitimes : rachat LPP (LIFD art. 33), pilier 3a, stratégie dividende/salaire.
                Toutes les simulations sont indicatives — vérifiez avec votre fiduciaire.
              </p>
            </div>
          </div>
        </div>

        {/* 3 simulation cards */}
        <div>
          <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
            Simulations rapides
          </h2>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <RachatLppCard year={year} />
            <Pilier3aCard year={year} />
            <DividendVsSalaryCard />
          </div>
        </div>

        {/* Legal bases */}
        <div className="bg-background border border-border rounded-xl p-4">
          <h3 className="font-semibold text-sm mb-3">Bases légales — sources tier 0</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 text-xs">
            {[
              { law: 'LIFD', article: '33', note: 'Déductions LPP + 3a (PP)' },
              { law: 'LIFD', article: '58-68', note: 'Bénéfice imposable + IFD PM 8.5%' },
              { law: 'LIFD', article: '62-63', note: 'Amortissements + provisions' },
              { law: 'LIFD', article: '20 al. 1bis', note: 'Réduction dividende 60%' },
              { law: 'LHID', article: '24-31', note: 'Harmonisation cantonale' },
              { law: 'CO', article: '960', note: 'Évaluation actifs' },
            ].map((item, i) => (
              <div key={i} className="p-2 bg-elevated rounded-md border border-border">
                <span className="font-mono font-medium">
                  {item.law} art. {item.article}
                </span>
                <p className="text-muted mt-0.5 text-[10px]">{item.note}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Chat overlay */}
      {showChat && (
        <ConseillerChat
          year={year}
          onClose={() => {
            setShowChat(false);
            setChatInitialQuestion(undefined);
          }}
          initialQuestion={chatInitialQuestion}
        />
      )}
    </div>
  );
}
