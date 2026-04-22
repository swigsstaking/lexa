/**
 * AuditYear — Page /audit/:year (session 30)
 *
 * Affiche :
 * - Timeline des événements + décisions IA
 * - Widget verify-citations
 * - Chat Agent Audit
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  ArrowLeft,
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MessageSquare,
  Clock,
  Activity,
  X,
  Send,
  Plus,
  Trash2,
} from 'lucide-react';
import { lexa } from '@/api/lexa';

// ─── AuditChat overlay ────────────────────────────────────────────────────────

function AuditChat({ year, onClose }: { year: number; onClose: () => void }) {
  const [question, setQuestion] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'agent'; text: string }>>([]);

  const askMutation = useMutation({
    mutationFn: (q: string) => lexa.askAudit({ question: q, year }),
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
            <Shield className="w-5 h-5 text-amber-500" />
            <span className="font-semibold text-sm">Agent Audit — CO 958f</span>
          </div>
          <button
            onClick={onClose}
            className="text-muted hover:text-ink transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
          {history.length === 0 && (
            <p className="text-sm text-muted italic">
              Posez une question sur la conformité, les citations légales ou l'intégrité des décisions IA…
            </p>
          )}
          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
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
              placeholder="Ex: Vérifier les citations CO 958f…"
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

// ─── CitationsVerifier widget ─────────────────────────────────────────────────

function CitationsVerifier() {
  const [citations, setCitations] = useState<Array<{ law: string; article: string }>>([
    { law: 'CO', article: '957' },
    { law: 'LIFD', article: '33' },
  ]);

  const verifyMutation = useMutation({
    mutationFn: () => lexa.verifyCitations(citations.filter((c) => c.law && c.article)),
  });

  const updateCitation = (index: number, field: 'law' | 'article', value: string) => {
    setCitations((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  };

  const addCitation = () => setCitations((prev) => [...prev, { law: '', article: '' }]);
  const removeCitation = (index: number) =>
    setCitations((prev) => prev.filter((_, i) => i !== index));

  return (
    <div className="bg-background border border-border rounded-xl p-4">
      <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
        <CheckCircle className="w-4 h-4 text-success" />
        Vérification citations légales
      </h3>

      {/* Citation inputs */}
      <div className="space-y-2 mb-3">
        {citations.map((c, i) => (
          <div key={i} className="flex gap-2 items-center">
            <input
              type="text"
              value={c.law}
              onChange={(e) => updateCitation(i, 'law', e.target.value)}
              placeholder="Loi (CO, LIFD…)"
              className="w-28 bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <span className="text-muted text-xs">art.</span>
            <input
              type="text"
              value={c.article}
              onChange={(e) => updateCitation(i, 'article', e.target.value)}
              placeholder="957"
              className="w-20 bg-elevated border border-border rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              onClick={() => removeCitation(i)}
              className="text-muted hover:text-danger transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={addCitation}
          className="flex items-center gap-1 text-xs text-muted hover:text-ink transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Ajouter
        </button>
        <button
          onClick={() => verifyMutation.mutate()}
          disabled={verifyMutation.isPending || citations.filter((c) => c.law && c.article).length === 0}
          className="ml-auto text-xs bg-primary text-white rounded px-3 py-1.5 hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          {verifyMutation.isPending ? 'Vérification…' : 'Vérifier'}
        </button>
      </div>

      {/* Results */}
      {verifyMutation.data && (
        <div className="space-y-2">
          <div className="flex gap-3 text-xs text-muted mb-2">
            <span className="text-success font-medium">{verifyMutation.data.stats.verified} vérifiées</span>
            <span className="text-danger font-medium">{verifyMutation.data.stats.unverified} non vérifiées</span>
            <span className="ml-auto">{verifyMutation.data.durationMs}ms</span>
          </div>
          {verifyMutation.data.results.map((r, i) => (
            <div
              key={i}
              className={`flex items-start gap-2 p-2 rounded-md border text-xs ${
                r.verified
                  ? 'border-success/30 bg-success/5 text-success'
                  : 'border-danger/30 bg-danger/5 text-danger'
              }`}
            >
              {r.verified ? (
                <CheckCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              ) : (
                <XCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
              )}
              <div className="flex-1">
                <span className="font-mono font-medium">
                  {r.citation.law} art. {r.citation.article}
                </span>
                {r.score && (
                  <span className="ml-2 text-muted">score {r.score.toFixed(3)}</span>
                )}
                {r.note && <p className="text-muted mt-0.5 italic">{r.note}</p>}
                {r.matchedText && (
                  <p className="text-ink/70 mt-1 text-xs line-clamp-2">{r.matchedText}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function AuditYear() {
  const { year: yearParam } = useParams<{ year: string }>();
  const navigate = useNavigate();
  const year = parseInt(yearParam ?? '2026', 10);
  const [showChat, setShowChat] = useState(false);

  const trailQuery = useQuery({
    queryKey: ['audit-trail', year],
    queryFn: () => lexa.getAuditTrail(year),
  });

  const trail = trailQuery.data;

  return (
    <div className="min-h-screen bg-base">
      {/* Header — wrap mobile, inline desktop */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-4 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate('/workspace')}
            className="text-muted hover:text-ink transition-colors flex-shrink-0"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Shield className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <h1 className="font-semibold text-sm flex-1 min-w-0 truncate">Audit Intégrité IA — {year}</h1>
          <button
            onClick={() => setShowChat(true)}
            className="flex items-center gap-1.5 text-xs bg-amber-500 text-white rounded-lg px-3 py-1.5 hover:bg-amber-600 transition-colors flex-shrink-0"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Ask Audit Agent</span>
            <span className="sm:hidden">Ask IA</span>
          </button>
        </div>
        <div className="hidden lg:block mt-1 text-xs text-muted">CO art. 958f — Conservation 10 ans</div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats cards */}
        {trail && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Événements</div>
              <div className="text-2xl font-bold mono-num">{trail.stats.totalEvents}</div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Décisions IA</div>
              <div className="text-2xl font-bold mono-num">{trail.stats.totalAiDecisions}</div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Confiance moy.</div>
              <div className="text-2xl font-bold mono-num">
                {trail.stats.averageConfidence != null
                  ? (trail.stats.averageConfidence * 100).toFixed(1) + '%'
                  : '—'}
              </div>
            </div>
            <div className="bg-background border border-border rounded-xl p-4">
              <div className="text-xs text-muted mb-1">Basse confiance</div>
              <div className={`text-2xl font-bold mono-num ${trail.stats.lowConfidenceCount > 0 ? 'text-warning' : 'text-success'}`}>
                {trail.stats.lowConfidenceCount}
              </div>
            </div>
          </div>
        )}

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {/* Citation Verifier */}
          <CitationsVerifier />

          {/* Legal basis */}
          {trail && (
            <div className="bg-background border border-border rounded-xl p-4">
              <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted" />
                Base légale conservation
              </h3>
              <div className="space-y-2 text-xs text-ink">
                <p className="p-2 bg-elevated rounded-md border border-border">{trail.legalBasis.conservation}</p>
                <p className="p-2 bg-elevated rounded-md border border-border">{trail.legalBasis.tva}</p>
              </div>
              <div className="mt-3 pt-3 border-t border-border text-xs text-muted">
                Généré le {new Date(trail.generatedAt).toLocaleString('fr-CH')}
              </div>
            </div>
          )}
        </div>

        {/* Timeline */}
        <div className="bg-background border border-border rounded-xl">
          <div className="p-4 border-b border-border flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted" />
            <h3 className="font-semibold text-sm">Timeline événements {year}</h3>
            {trail && (
              <span className="ml-auto text-xs text-muted">
                {trail.stats.totalEvents} événements
              </span>
            )}
          </div>

          <div className="divide-y divide-border max-h-[500px] overflow-y-auto">
            {trailQuery.isLoading && (
              <div className="p-6 text-center text-muted text-sm">Chargement timeline…</div>
            )}
            {trailQuery.isError && (
              <div className="p-6 text-center text-danger text-sm">
                Erreur chargement trail
              </div>
            )}
            {trail?.events.length === 0 && (
              <div className="p-6 text-center text-muted text-sm italic">
                Aucun événement pour {year}
              </div>
            )}
            {trail?.events
              .filter((e) => e.type === 'TransactionClassified' || e.type === 'TransactionIngested')
              .slice(0, 50)
              .map((event) => (
                <div key={event.eventId} className="p-3 hover:bg-elevated/30 transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5">
                      {event.aiDecision ? (
                        event.aiDecision.confidence >= 0.7 ? (
                          <CheckCircle className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <AlertTriangle className="w-3.5 h-3.5 text-warning" />
                        )
                      ) : (
                        <div className="w-3.5 h-3.5 rounded-full bg-muted/20" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono text-muted">
                          {event.occurredAt
                            ? new Date(event.occurredAt).toLocaleDateString('fr-CH')
                            : '—'}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                          event.type === 'TransactionClassified'
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted/10 text-muted'
                        }`}>
                          {event.type === 'TransactionClassified' ? 'Classifié' : 'Ingéré'}
                        </span>
                        {event.aiDecision && (
                          <span className="text-muted">
                            {event.aiDecision.agent} · {(event.aiDecision.confidence * 100).toFixed(0)}%
                          </span>
                        )}
                        {event.amount != null && (
                          <span className="ml-auto font-mono font-medium text-xs">
                            {event.amount.toLocaleString('fr-CH', { minimumFractionDigits: 2 })} CHF
                          </span>
                        )}
                      </div>
                      {event.description && (
                        <p className="text-xs text-ink mt-0.5 truncate">{event.description}</p>
                      )}
                      {event.aiDecision?.citations && event.aiDecision.citations.length > 0 && (
                        <div className="flex gap-1 mt-1 flex-wrap">
                          {event.aiDecision.citations.map((c, i) => (
                            <span
                              key={i}
                              className="text-[10px] px-1 py-0.5 bg-elevated border border-border rounded font-mono"
                            >
                              {c.law} {c.article}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Chat overlay */}
      {showChat && <AuditChat year={year} onClose={() => setShowChat(false)} />}
    </div>
  );
}
