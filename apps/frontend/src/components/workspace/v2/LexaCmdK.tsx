import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { lexa } from '@/api/lexa';
import { useChatStore, type AgentId } from '@/stores/chatStore';
import { useAuthStore } from '@/stores/authStore';
import type { AgentAnswer } from '@/api/types';

// ——— Types ———
interface CmdKAccount {
  code: string;
  name: string;
  balance: number;
}

interface LexaCmdKProps {
  open: boolean;
  setOpen: (v: boolean | ((prev: boolean) => boolean)) => void;
  accounts?: CmdKAccount[];
  onSuggestion?: (title: string) => void;
  onJumpAccount?: (code: string) => void;
  onOpenChat?: () => void;
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
}

const SUGGESTIONS = [
  {
    icon: '§',
    title: 'Préparer la déclaration TVA',
    sub: 'Agent TVA · échéance prochaine',
    k: '↵',
    agent: 'tva' as AgentId,
    query: 'Prépare ma déclaration TVA pour cette période',
  },
  {
    icon: '↻',
    title: 'Rapprocher les écritures de la Banque',
    sub: 'Agent Reconciliation · écritures en attente',
    k: '↵',
    agent: 'reasoning' as AgentId,
    query: 'Quelles écritures bancaires sont en attente de rapprochement ?',
  },
  {
    icon: '!',
    title: 'Vérifier les anomalies détectées',
    sub: 'Agent Anomalies · soldes de sens anormal',
    k: '↵',
    agent: 'reasoning' as AgentId,
    query: 'Quelles anomalies as-tu détectées dans mon grand livre ?',
  },
  {
    icon: '?',
    title: 'Poser une question sur tes comptes',
    sub: 'Pose une question libre sur le grand livre',
    k: '↵',
    agent: 'reasoning' as AgentId,
    query: '',
  },
];

const AGENTS: { id: AgentId; label: string }[] = [
  { id: 'reasoning', label: 'Lexa' },
  { id: 'tva', label: 'TVA' },
  { id: 'classifier', label: 'Classifier' },
];

const LLM_TIMEOUT_MS = 90_000;

// ——— Hook partagé chat IA ———
function useChatEngine(agent: AgentId, tenantId: string | null, year?: number) {
  const { messages, loading, addMessage, setLoading, updateLastMessage, clear } = useChatStore();
  const abortRef = useRef<AbortController | null>(null);
  const pendingQ = useRef('');
  const [error, setError] = useState<string | null>(null);

  const sendQuestion = useCallback(async (q: string) => {
    if (!q.trim() || loading) return;
    setError(null);
    pendingQ.current = q;
    addMessage({ id: `u-${Date.now()}`, role: 'user', content: q, createdAt: Date.now() });
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;
    const timeoutId = setTimeout(() => controller.abort('timeout'), LLM_TIMEOUT_MS);

    // ── Mode streaming SSE pour l'agent Lexa (reasoning) ──────────────────
    if (agent === 'reasoning' && tenantId) {
      const msgId = `a-${Date.now()}`;
      // Ajouter un message vide pour accumuler le streaming
      addMessage({ id: msgId, role: 'agent', agent, content: '', createdAt: Date.now() });

      try {
        let fullText = '';
        let finalCitations: AgentAnswer['citations'] | undefined;
        let finalDurationMs = 0;

        for await (const event of lexa.lexaAskStream(q, tenantId, year)) {
          if (controller.signal.aborted) break;

          if (event.type === 'delta') {
            fullText += event.delta;
            updateLastMessage(msgId, { content: fullText });
          } else if (event.type === 'done') {
            finalCitations = event.citations;
            finalDurationMs = event.durationMs;
            updateLastMessage(msgId, {
              content: fullText,
              answer: {
                answer: fullText,
                citations: finalCitations,
                durationMs: finalDurationMs,
              },
            });
          } else if (event.type === 'error') {
            setError(`Erreur streaming : ${event.message}`);
            // Retirer le message vide en cas d'erreur
            updateLastMessage(msgId, { content: `⚠ ${event.message}` });
          }
        }
      } catch (e) {
        const err = e as Error & { response?: { status?: number } };
        if (err.name === 'AbortError' || err.message === 'AbortError') {
          setError("L'agent met plus de temps que d'habitude. Réessayez.");
        } else {
          setError(`Erreur : ${err.message || 'inconnue'}`);
        }
      } finally {
        clearTimeout(timeoutId);
        setLoading(false);
        abortRef.current = null;
      }
      return;
    }

    // ── Mode non-streaming (tva, classifier, ragAsk) ────────────────────────
    try {
      let answer: AgentAnswer;
      const fetchPromise = (async () => {
        if (agent === 'tva') return lexa.tvaAsk(q);
        if (agent === 'classifier') {
          const [desc, amt] = q.split('|').map((s) => s.trim());
          return lexa.classify(desc ?? q, parseFloat(amt ?? '0') || 0);
        }
        return lexa.ragAsk(q);
      })();

      const timeoutPromise = new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('AbortError'), { name: 'AbortError' }))
        );
      });

      answer = await Promise.race([fetchPromise, timeoutPromise]);
      clearTimeout(timeoutId);
      addMessage({
        id: `a-${Date.now()}`,
        role: 'agent',
        agent,
        content: answer.answer,
        answer,
        createdAt: Date.now(),
      });
    } catch (e) {
      clearTimeout(timeoutId);
      const err = e as Error & { response?: { status?: number } };
      if (err.name === 'AbortError' || err.message === 'AbortError') {
        setError("L'agent met plus de temps que d'habitude. Réessayez.");
      } else if (err.response?.status === 502) {
        setError('Service IA indisponible (Ollama down). Réessayez dans quelques instants.');
      } else {
        setError(`Erreur : ${err.message || 'inconnue'}`);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }, [agent, tenantId, year, loading, addMessage, setLoading, updateLastMessage]);

  const retry = useCallback(() => {
    const q = pendingQ.current;
    if (q) {
      setError(null);
      void sendQuestion(q);
    }
  }, [sendQuestion]);

  return { messages, loading, error, sendQuestion, retry, clear };
}

export function LexaCmdK({
  open,
  setOpen,
  accounts = [],
  onJumpAccount,
}: LexaCmdKProps) {
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [chatMode, setChatMode] = useState(false);
  const [agent, setAgent] = useState<AgentId>('reasoning');
  const inputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const currentYear = new Date().getFullYear();

  // Utilise le store partagé pour les messages
  const storeAgent = useChatStore((s) => s.agent);
  const setStoreAgent = useChatStore((s) => s.setAgent);

  const effectiveAgent: AgentId = chatMode ? agent : storeAgent;
  const { messages, loading, error, sendQuestion, retry, clear } = useChatEngine(
    effectiveAgent,
    activeTenantId,
    currentYear,
  );

  // Focus input quand ouvert
  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Scroll bas sur nouveaux messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Cmd+K + Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        if (e.shiftKey) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') {
        if (chatMode) {
          setChatMode(false);
          setQ('');
        } else {
          setOpen(false);
        }
      }
      if (e.key === 'l' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        clear();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen, chatMode, clear]);

  // Filtrage comptes
  const filteredAccounts = accounts
    .filter(
      (a) =>
        !q ||
        a.code.includes(q) ||
        a.name.toLowerCase().includes(q.toLowerCase()),
    )
    .slice(0, 4);

  const filteredSuggestions = SUGGESTIONS.filter(
    (s) => !q || s.title.toLowerCase().includes(q.toLowerCase()),
  );

  const handleSendMessage = async () => {
    const text = q.trim();
    if (!text) return;
    setQ('');
    setChatMode(true);
    await sendQuestion(text);
  };

  const handleSuggestionClick = async (s: typeof SUGGESTIONS[0]) => {
    setChatMode(true);
    setAgent(s.agent);
    setStoreAgent(s.agent);
    if (s.query) {
      setQ('');
      await sendQuestion(s.query);
    } else {
      // Question libre — mettre le texte dans l'input
      setQ(s.title);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      // BUG-4 fix : Enter doit TOUJOURS envoyer le message si q est non vide.
      // Si q est vide et en mode chat, on ne fait rien (pas de message vide).
      // Les suggestions IA ne se déclenchent via Enter QUE si q est vide ET pas en chatMode.
      // Jamais de "jump account" via Enter — seulement via click.
      if (q.trim()) {
        e.preventDefault();
        await handleSendMessage();
      } else if (!chatMode && filteredSuggestions[selectedIdx]) {
        e.preventDefault();
        await handleSuggestionClick(filteredSuggestions[selectedIdx]);
      }
      // En chatMode avec q vide : Enter ne fait rien (pas de message vide)
    }
    if (e.key === 'ArrowDown') setSelectedIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
    if (e.key === 'ArrowUp') {
      if (chatMode) {
        // ↑ dans historique des messages — on pourrait implémenter si besoin
      } else {
        setSelectedIdx((i) => Math.max(i - 1, 0));
      }
    }
  };

  return createPortal(
    <>
      {/* Overlay opaque */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.82)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 500,
          display: open ? 'grid' : 'none',
          placeItems: 'start center',
          paddingTop: '10vh',
          animation: open ? 'cmdk-fade-in 0.12s ease' : 'none',
        }}
      >
        {/* Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(680px, 94vw)',
            background: '#FFFFFF',
            border: '1px solid #D9D9D0',
            borderRadius: 18,
            boxShadow: '0 32px 96px rgba(0,0,0,0.40)',
            overflow: 'hidden',
            animation: open ? 'cmdk-slide-in 0.15s ease' : 'none',
            display: 'flex',
            flexDirection: 'column',
            maxHeight: '78vh',
          }}
        >
          {/* Header — input + agent selector */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 18px',
              borderBottom: '1px solid #E8E8E1',
              flexShrink: 0,
            }}
          >
            {/* Spark ✦ */}
            <div
              style={{
                width: 22,
                height: 22,
                borderRadius: 6,
                background: '#0A0A0A',
                color: 'var(--lexa)',
                display: 'grid',
                placeItems: 'center',
                fontSize: 11,
                flexShrink: 0,
              }}
            >
              ✦
            </div>
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={
                chatMode
                  ? 'Continuer la conversation…'
                  : 'Demande à Lexa, ou saute vers un compte…'
              }
              style={{
                flex: 1,
                fontSize: 15,
                border: 0,
                outline: 'none',
                background: 'transparent',
                color: '#0A0A0A',
                fontFamily: 'Inter, ui-sans-serif, sans-serif',
              }}
              onKeyDown={(e) => { void handleKeyDown(e); }}
            />
            {/* Agent selector (en mode chat) */}
            {chatMode && (
              <div style={{ display: 'flex', gap: 4 }}>
                {AGENTS.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => { setAgent(a.id); setStoreAgent(a.id); }}
                    style={{
                      padding: '3px 8px',
                      borderRadius: 5,
                      border: 0,
                      fontSize: 10,
                      fontWeight: 600,
                      letterSpacing: '0.04em',
                      textTransform: 'uppercase' as const,
                      cursor: 'pointer',
                      background: agent === a.id ? '#0A0A0A' : '#F3F3EE',
                      color: agent === a.id ? 'var(--lexa)' : '#6B6B66',
                      transition: 'all 80ms',
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            )}
            {/* Bouton reset conversation */}
            {chatMode && messages.length > 0 && (
              <button
                onClick={() => { clear(); setChatMode(false); setQ(''); }}
                title="Nouvelle conversation (⌘L)"
                style={{
                  padding: '3px 8px',
                  borderRadius: 5,
                  border: '1px solid #E8E8E1',
                  fontSize: 10,
                  fontWeight: 500,
                  cursor: 'pointer',
                  background: 'transparent',
                  color: '#9A9A93',
                  flexShrink: 0,
                }}
              >
                ↺ Nouveau
              </button>
            )}
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: '#9A9A93',
              }}
            >
              esc
            </span>
          </div>

          {/* Body — chat OU suggestions */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
            {/* Mode chat — historique conversation */}
            {chatMode && (
              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                {messages.length === 0 && !loading && (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#9A9A93', fontSize: 13 }}>
                    <div style={{ fontSize: 22, marginBottom: 8 }}>✦</div>
                    <div>Pose une question à Lexa…</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>Agent actif : <strong>{agent}</strong></div>
                  </div>
                )}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start',
                    }}
                  >
                    <div
                      style={{
                        maxWidth: '85%',
                        padding: '10px 14px',
                        borderRadius: 12,
                        fontSize: 13,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                        background: m.role === 'user' ? '#0A0A0A' : '#F3F3EE',
                        color: m.role === 'user' ? '#FAFAF7' : '#0A0A0A',
                        border: m.role === 'user' ? 'none' : '1px solid #E8E8E1',
                      }}
                    >
                      {m.content}
                      {m.answer?.citations && m.answer.citations.length > 0 && (
                        <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #D9D9D0' }}>
                          <div style={{ fontSize: 10, textTransform: 'uppercase' as const, letterSpacing: '0.06em', color: '#9A9A93', fontWeight: 600, marginBottom: 4 }}>
                            Sources
                          </div>
                          {m.answer.citations.slice(0, 3).map((c, i) => (
                            <div key={i} style={{ fontSize: 11, color: '#6B6B66', marginBottom: 2 }}>
                              · {[c.law, c.article].filter(Boolean).join(' ') || c.title || c.source || 'source'}
                            </div>
                          ))}
                        </div>
                      )}
                      {m.answer?.durationMs && (
                        <div style={{ fontSize: 10, color: '#9A9A93', marginTop: 6, fontFamily: 'JetBrains Mono, monospace' }}>
                          {(m.answer.durationMs / 1000).toFixed(1)}s
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                {/* Loading */}
                {loading && (
                  <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                    <div
                      style={{
                        padding: '10px 14px',
                        borderRadius: 12,
                        background: '#F3F3EE',
                        border: '1px solid #E8E8E1',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        fontSize: 13,
                        color: '#6B6B66',
                      }}
                    >
                      <span style={{ display: 'inline-flex', gap: 3 }}>
                        {[0, 0.2, 0.4].map((delay, i) => (
                          <span
                            key={i}
                            style={{
                              width: 5,
                              height: 5,
                              borderRadius: '50%',
                              background: 'var(--lexa)',
                              animation: `agentPulse 1.8s ease-in-out ${delay}s infinite`,
                            }}
                          />
                        ))}
                      </span>
                      Lexa réfléchit…
                    </div>
                  </div>
                )}
                {/* Erreur */}
                {error && !loading && (
                  <div
                    style={{
                      padding: '10px 14px',
                      borderRadius: 12,
                      background: '#FFF3F3',
                      border: '1px solid #FFCCCC',
                      fontSize: 12,
                      color: '#CC2222',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    <span>⚠</span>
                    <span style={{ flex: 1 }}>{error}</span>
                    <button
                      onClick={retry}
                      style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        border: '1px solid #FFCCCC',
                        background: 'transparent',
                        color: '#CC2222',
                        fontSize: 11,
                        cursor: 'pointer',
                      }}
                    >
                      Réessayer
                    </button>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            )}

            {/* Mode launcher — suggestions + comptes */}
            {!chatMode && (
              <>
                {/* Suggestions IA */}
                {filteredSuggestions.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: '10px 20px 6px',
                        fontSize: 10,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.08em',
                        color: '#9A9A93',
                        fontWeight: 600,
                      }}
                    >
                      Suggestions IA
                    </div>
                    {filteredSuggestions.map((s, i) => (
                      <div
                        key={i}
                        onClick={() => { void handleSuggestionClick(s); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 20px',
                          cursor: 'pointer',
                          background: i === selectedIdx ? '#F3F3EE' : 'transparent',
                          transition: 'background 80ms',
                        }}
                        onMouseEnter={() => setSelectedIdx(i)}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: '#0A0A0A',
                            color: 'var(--lexa)',
                            display: 'grid',
                            placeItems: 'center',
                            fontWeight: 600,
                            fontSize: 13,
                            flexShrink: 0,
                          }}
                        >
                          {s.icon}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: '#0A0A0A', fontSize: 13 }}>
                            {s.title}
                          </div>
                          <div style={{ color: '#6B6B66', fontSize: 12 }}>{s.sub}</div>
                        </div>
                        <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: '#9A9A93' }}>
                          {s.k}
                        </span>
                      </div>
                    ))}
                  </>
                )}

                {/* Sauter à un compte */}
                {filteredAccounts.length > 0 && (
                  <>
                    <div
                      style={{
                        padding: '10px 20px 6px',
                        fontSize: 10,
                        textTransform: 'uppercase' as const,
                        letterSpacing: '0.08em',
                        color: '#9A9A93',
                        fontWeight: 600,
                      }}
                    >
                      Sauter à un compte
                    </div>
                    {filteredAccounts.map((a) => (
                      <div
                        key={a.code}
                        onClick={() => {
                          onJumpAccount?.(a.code);
                          setOpen(false);
                        }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 20px',
                          cursor: 'pointer',
                          transition: 'background 80ms',
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = '#F3F3EE';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                      >
                        <div
                          style={{
                            width: 28,
                            height: 28,
                            borderRadius: 6,
                            background: '#F3F3EE',
                            display: 'grid',
                            placeItems: 'center',
                            fontFamily: 'JetBrains Mono, monospace',
                            fontSize: 10,
                            color: '#3B3B38',
                            flexShrink: 0,
                          }}
                        >
                          {a.code}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 500, color: '#0A0A0A', fontSize: 13 }}>
                            {a.name}
                          </div>
                          <div style={{ color: '#6B6B66', fontSize: 12 }}>
                            Solde {fmtMoney(a.balance)} CHF
                          </div>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid #E8E8E1',
              display: 'flex',
              justifyContent: 'space-between',
              color: '#9A9A93',
              fontSize: 11,
              background: '#F3F3EE',
              flexShrink: 0,
            }}
          >
            <span>
              {chatMode ? (
                <>✦ Conversation avec <strong>{agent}</strong> · <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>⌘L</span> effacer</>
              ) : (
                'Alimenté par les Agents Lexa'
              )}
            </span>
            <span>
              {chatMode ? (
                <>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>↵</span> envoyer ·{' '}
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>esc</span> fermer
                </>
              ) : (
                <>
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>↑↓</span> naviguer ·{' '}
                  <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>↵</span> valider
                </>
              )}
            </span>
          </div>
        </div>
      </div>

      {/* Animations keyframes */}
      <style>{`
        @keyframes cmdk-fade-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes cmdk-slide-in {
          from { transform: translateY(-8px) scale(0.98); opacity: 0 }
          to   { transform: none; opacity: 1 }
        }
        @keyframes agentPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
      `}</style>
    </>,
    document.body,
  );
}

// ——— Trigger pill "Demande à Lexa" (top-right absolu dans canvas) ———
interface LexaCmdKTriggerProps {
  onOpen: () => void;
}

export function LexaCmdKTrigger({ onOpen }: LexaCmdKTriggerProps) {
  return (
    <button
      onClick={onOpen}
      style={{
        position: 'absolute',
        top: 14,
        right: 16,
        zIndex: 30,
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 10px 7px 12px',
        background: '#0A0A0A',
        color: '#FAFAF7',
        borderRadius: 999,
        border: 0,
        cursor: 'pointer',
        boxShadow: '0 2px 6px rgba(10,10,10,0.18)',
        fontSize: 11,
        fontWeight: 500,
        letterSpacing: '0.02em',
        transition: 'transform 0.15s ease, opacity 0.15s ease',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'translateY(-1px)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.transform = 'none';
      }}
      title="Demande à Lexa (⌘K)"
    >
      {/* Spark ✦ orange */}
      <span style={{ color: 'var(--lexa)', fontSize: 12, lineHeight: 1 }}>✦</span>
      Demande à Lexa
      {/* Kbd ⌘K */}
      <span
        style={{
          fontFamily: 'JetBrains Mono, monospace',
          fontSize: 10,
          background: 'rgba(255,255,255,0.12)',
          padding: '2px 6px',
          borderRadius: 5,
          color: '#A8A8A0',
          letterSpacing: '0.02em',
        }}
      >
        ⌘K
      </span>
    </button>
  );
}

// ——— AgentsPill (top-left absolu dans canvas) — visible seulement si aiWorking ———
interface AgentsPillProps {
  visible: boolean;
}

export function AgentsPill({ visible }: AgentsPillProps) {
  if (!visible) return null;
  return (
    <div
      style={{
        position: 'absolute',
        top: 14,
        left: 16,
        zIndex: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 12px 6px 10px',
        background: '#0A0A0A',
        borderRadius: 999,
        color: '#FAFAF7',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        boxShadow: '0 2px 6px rgba(10,10,10,0.18)',
        fontFamily: 'Inter, ui-sans-serif, sans-serif',
        animation: 'agentsFadeIn 0.25s ease',
      }}
    >
      {/* Dots pulsants rouge-tomate */}
      <span style={{ display: 'inline-flex', gap: 3 }}>
        {[0, 0.2, 0.4].map((delay, i) => (
          <span
            key={i}
            style={{
              width: 5,
              height: 5,
              borderRadius: '50%',
              background: 'var(--lexa)',
              animation: `agentPulse 1.8s ease-in-out ${delay}s infinite`,
            }}
          />
        ))}
      </span>
      Agents
      <style>{`
        @keyframes agentPulse {
          0%, 100% { opacity: 0.4; transform: scale(0.9); }
          50%       { opacity: 1;   transform: scale(1.1); }
        }
        @keyframes agentsFadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to   { opacity: 1; transform: none; }
        }
      `}</style>
    </div>
  );
}
