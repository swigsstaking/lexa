import { useState } from 'react';
import { Send, Loader2, Sparkles } from 'lucide-react';
import { lexa } from '@/api/lexa';
import type { AgentAnswer } from '@/api/types';

type AgentId = 'reasoning' | 'tva' | 'classifier';

const agents: Array<{ id: AgentId; label: string; desc: string }> = [
  { id: 'reasoning', label: 'Raisonnement', desc: 'Questions juridiques/fiscales générales' },
  { id: 'tva', label: 'TVA', desc: 'LTVA, OLTVA, Info TVA' },
  { id: 'classifier', label: 'Classifier', desc: 'Classification d\'une transaction' },
];

interface Message {
  id: string;
  role: 'user' | 'agent';
  agent?: AgentId;
  content: string;
  answer?: AgentAnswer;
}

export function Chat() {
  const [agent, setAgent] = useState<AgentId>('reasoning');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    const userMsg: Message = { id: `u-${Date.now()}`, role: 'user', content: q };
    setMessages((m) => [...m, userMsg]);
    setInput('');
    setLoading(true);
    try {
      let answer: AgentAnswer;
      if (agent === 'reasoning') answer = await lexa.ragAsk(q);
      else if (agent === 'tva') answer = await lexa.tvaAsk(q);
      else {
        const parts = q.split('|');
        const desc = parts[0]?.trim() ?? q;
        const amt = parseFloat(parts[1] ?? '0') || 0;
        answer = await lexa.classify(desc, amt);
      }
      setMessages((m) => [
        ...m,
        { id: `a-${Date.now()}`, role: 'agent', agent, content: answer.answer, answer },
      ]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          id: `e-${Date.now()}`,
          role: 'agent',
          agent,
          content: `Erreur: ${e instanceof Error ? e.message : 'unknown'}`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl h-full flex flex-col">
      <div className="mb-6">
        <h1 className="text-3xl mb-1">Agents IA</h1>
        <p className="text-lexa-muted text-sm">
          Posez vos questions comptables, fiscales ou TVA. Réponses citées par sources légales.
        </p>
      </div>

      <div className="flex gap-2 mb-4">
        {agents.map((a) => (
          <button
            key={a.id}
            onClick={() => setAgent(a.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              agent === a.id
                ? 'bg-lexa-primary text-white'
                : 'bg-lexa-surface border border-lexa-border text-lexa-ink hover:bg-lexa-bg'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      <div className="card flex-1 flex flex-col overflow-hidden min-h-0">
        <div className="flex-1 overflow-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="h-full grid place-items-center text-center">
              <div>
                <Sparkles className="w-10 h-10 text-lexa-primary mx-auto mb-3" />
                <div className="text-lexa-muted text-sm max-w-md">
                  Agent <strong>{agents.find((a) => a.id === agent)?.label}</strong>.{' '}
                  {agents.find((a) => a.id === agent)?.desc}.
                  <br />
                  {agent === 'classifier' && (
                    <span className="text-xs">
                      Format: <code className="chip">description | montant</code>
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 ${
                  m.role === 'user'
                    ? 'bg-lexa-primary text-white'
                    : 'bg-lexa-bg border border-lexa-border'
                }`}
              >
                <div className="whitespace-pre-wrap text-sm">{m.content}</div>
                {m.answer?.citations && m.answer.citations.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-lexa-border/50 space-y-1">
                    <div className="text-xs font-medium text-lexa-muted uppercase tracking-wider">
                      Citations
                    </div>
                    {m.answer.citations.slice(0, 5).map((c, i) => {
                      const label =
                        [c.law, c.article].filter(Boolean).join(' ') ||
                        c.title ||
                        c.source ||
                        'source';
                      const inner = (
                        <>
                          • {label}
                          {c.heading ? ` — ${c.heading}` : ''}
                          {typeof c.score === 'number' && (
                            <span className="ml-2 opacity-60">{c.score.toFixed(2)}</span>
                          )}
                        </>
                      );
                      return c.url ? (
                        <a
                          key={i}
                          href={c.url}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-xs text-lexa-muted hover:text-lexa-primary truncate"
                        >
                          {inner}
                        </a>
                      ) : (
                        <div key={i} className="text-xs text-lexa-muted truncate">
                          {inner}
                        </div>
                      );
                    })}
                  </div>
                )}
                {m.answer?.durationMs && (
                  <div className="text-xs text-lexa-muted mt-2">
                    {(m.answer.durationMs / 1000).toFixed(1)}s
                  </div>
                )}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-lexa-bg border border-lexa-border rounded-2xl px-4 py-3 flex items-center gap-2 text-sm text-lexa-muted">
                <Loader2 className="w-4 h-4 animate-spin" />
                L'agent réfléchit...
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-lexa-border p-4">
          <div className="flex gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              placeholder={
                agent === 'classifier'
                  ? 'Ex: FIDUCIAIRE DUPONT | 450'
                  : 'Posez votre question...'
              }
              rows={2}
              className="input resize-none flex-1"
            />
            <button onClick={send} disabled={loading || !input.trim()} className="btn-primary">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
