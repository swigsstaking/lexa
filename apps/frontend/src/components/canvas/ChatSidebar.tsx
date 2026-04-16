import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Brain,
  Calculator,
  BookOpen,
  Loader2,
  RefreshCw,
  Send,
  Shield,
  Sparkles,
  MessageSquare,
  X,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import type { AgentAnswer } from '@/api/types';
import { setAgentState } from './hooks/useAgentStates';

const LLM_TIMEOUT_MS = 90_000;

export type CanvasChatAgentId =
  | 'classifier'
  | 'reasoning'
  | 'tva'
  | 'cloture'
  | 'audit'
  | 'conseiller';

const AGENT_LABELS: Record<CanvasChatAgentId, string> = {
  classifier: 'Classifier',
  reasoning: 'Reasoning RAG',
  tva: 'TVA',
  cloture: 'Clôture',
  audit: 'Audit',
  conseiller: 'Conseiller',
};

const AGENT_ICONS: Record<CanvasChatAgentId, React.ElementType> = {
  classifier: Brain,
  reasoning: MessageSquare,
  tva: Calculator,
  cloture: BookOpen,
  audit: Shield,
  conseiller: Sparkles,
};

interface ChatMessage {
  id: string;
  role: 'user' | 'agent';
  content: string;
  answer?: AgentAnswer;
  createdAt: number;
}

interface Props {
  agentId: CanvasChatAgentId;
  onClose: () => void;
}

export function ChatSidebar({ agentId, onClose }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ type: string; message: string } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastQuestion = useRef('');

  const Icon = AGENT_ICONS[agentId] ?? Sparkles;
  const label = AGENT_LABELS[agentId] ?? agentId;

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 150);
    return () => { abortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendQuestion = async (q: string) => {
    if (!q || loading) return;
    setError(null);
    lastQuestion.current = q;

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, role: 'user', content: q, createdAt: Date.now() },
    ]);
    setLoading(true);
    setAgentState(agentId, 'thinking');

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort('timeout'), LLM_TIMEOUT_MS);

    try {
      const year = new Date().getFullYear();

      const fetchPromise = (async (): Promise<AgentAnswer> => {
        if (agentId === 'reasoning') return lexa.ragAsk(q);
        if (agentId === 'tva') return lexa.tvaAsk(q);
        if (agentId === 'classifier') {
          const [desc, amt] = q.split('|').map((s) => s.trim());
          return lexa.classify(desc ?? q, parseFloat(amt ?? '0') || 0);
        }
        if (agentId === 'cloture') return lexa.askCloture({ question: q, year });
        if (agentId === 'audit') return lexa.askAudit({ question: q, year });
        if (agentId === 'conseiller') {
          const res = await lexa.askConseiller({ question: q, year });
          return { answer: res.answer, citations: res.citations, durationMs: res.durationMs };
        }
        return lexa.ragAsk(q);
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' })),
        );
      });

      const answer = await Promise.race([fetchPromise, timeoutPromise]);
      clearTimeout(timeoutId);

      setMessages((prev) => [
        ...prev,
        { id: `a-${Date.now()}`, role: 'agent', content: answer.answer, answer, createdAt: Date.now() },
      ]);
      setAgentState(agentId, 'ready');
    } catch (e) {
      clearTimeout(timeoutId);
      const err = e as Error & { response?: { status?: number } };
      if (err.name === 'AbortError' || err.message === 'AbortError') {
        setError({ type: 'timeout', message: "L'agent met plus de temps que d'habitude. Réessayer ?" });
      } else if (err.response?.status === 502) {
        setError({ type: 'unavailable', message: 'Service IA indisponible (Ollama down).' });
      } else {
        setError({ type: 'generic', message: `Erreur : ${err.message || 'inconnue'}` });
      }
      setAgentState(agentId, 'error');
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const send = async () => {
    const q = input.trim();
    if (!q) return;
    setInput('');
    await sendQuestion(q);
  };

  const retry = async () => {
    setError(null);
    await sendQuestion(lastQuestion.current);
  };

  return (
    <motion.div
      initial={{ x: '100%', opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: '100%', opacity: 0 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="absolute right-0 top-0 bottom-0 w-[380px] max-w-[50vw] z-30 flex flex-col bg-stone-950/98 border-l border-stone-800 shadow-2xl"
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-stone-800 flex-shrink-0">
        <div className="p-1.5 rounded-lg bg-stone-800 border border-stone-700">
          <Icon className="w-4 h-4 text-stone-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-stone-100 font-mono">{label}</div>
          <div className="text-2xs text-stone-500">Agent IA — Canvas spatial</div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 text-stone-500 hover:text-stone-200 hover:bg-stone-800 rounded-md transition-colors"
          aria-label="Fermer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
        {messages.length === 0 && !error && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center py-8 gap-3">
            <div className="p-3 rounded-xl bg-stone-900 border border-stone-800">
              <Icon className="w-8 h-8 text-stone-500" />
            </div>
            <div>
              <div className="text-sm text-stone-300 font-medium">{label}</div>
              <div className="text-xs text-stone-500 mt-1 max-w-[240px] leading-relaxed">
                {agentId === 'classifier' && 'Classifiez une transaction : "achat fournitures | 245.00"'}
                {agentId === 'reasoning' && 'Posez une question sur la fiscalité ou la comptabilité suisse.'}
                {agentId === 'tva' && 'Posez une question sur la TVA suisse (8.1%, méthode effective, TDFN).'}
                {agentId === 'cloture' && 'Interrogez sur la clôture continue (CO 957-963).'}
                {agentId === 'audit' && 'Vérifiez l\'intégrité des enregistrements (CO 958f).'}
                {agentId === 'conseiller' && 'Demandez des conseils d\'optimisation fiscale proactive.'}
              </div>
            </div>
          </div>
        )}

        {messages.map((m) => (
          <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[88%] rounded-xl px-3.5 py-2.5 text-sm ${
                m.role === 'user'
                  ? 'bg-stone-700 text-stone-100'
                  : 'bg-stone-900 border border-stone-700/60 text-stone-200'
              }`}
            >
              <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
              {m.answer?.citations && m.answer.citations.length > 0 && (
                <div className="mt-2.5 pt-2 border-t border-stone-700/50 space-y-0.5">
                  <div className="text-2xs font-medium text-stone-500 uppercase tracking-wider mb-1">Sources</div>
                  {m.answer.citations.slice(0, 4).map((c, i) => {
                    const label = [c.law, c.article].filter(Boolean).join(' ') || c.title || c.source || 'source';
                    return (
                      <div key={i} className="text-2xs text-stone-500 truncate">
                        • {label}{c.heading ? ` — ${c.heading}` : ''}
                        {typeof c.score === 'number' && (
                          <span className="ml-1 opacity-50 font-mono">{c.score.toFixed(2)}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {m.answer?.durationMs && (
                <div className="text-2xs text-stone-600 mt-1 font-mono">
                  {(m.answer.durationMs / 1000).toFixed(1)}s
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex justify-start">
            <div className="bg-stone-900 border border-stone-700/60 rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm text-stone-400">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="text-xs">En train de raisonner…</span>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-stone-900/80 border border-amber-800/40 rounded-xl px-3.5 py-2.5 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-amber-400 text-xs">{error.message}</p>
              {error.type !== 'generic' && (
                <button
                  onClick={() => void retry()}
                  className="mt-1.5 flex items-center gap-1.5 text-2xs text-stone-400 hover:text-stone-200 border border-stone-700 rounded px-2 py-1 transition-colors"
                >
                  <RefreshCw className="w-3 h-3" />
                  Réessayer
                </button>
              )}
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-stone-800 p-3 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            placeholder={
              agentId === 'classifier'
                ? 'description | montant CHF…'
                : 'Posez votre question…'
            }
            rows={2}
            className="flex-1 resize-none bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-sm text-stone-100 placeholder-stone-600 focus:outline-none focus:border-stone-500 transition-colors"
          />
          <button
            onClick={() => void send()}
            disabled={loading || !input.trim()}
            className="p-2.5 rounded-lg bg-stone-700 hover:bg-stone-600 disabled:opacity-40 disabled:cursor-not-allowed text-stone-200 transition-colors flex-shrink-0"
            aria-label="Envoyer"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <div className="mt-1.5 text-2xs text-stone-600 text-right">↵ Envoyer · ⇧↵ Saut de ligne</div>
      </div>
    </motion.div>
  );
}
