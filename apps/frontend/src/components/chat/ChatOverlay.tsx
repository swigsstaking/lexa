import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, Send, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lexa } from '@/api/lexa';
import type { AgentAnswer } from '@/api/types';
import { useChatStore, type AgentId } from '@/stores/chatStore';

const AGENTS: AgentId[] = ['reasoning', 'tva', 'classifier'];

export function ChatOverlay() {
  const { t } = useTranslation();
  const { open, agent, messages, loading, setOpen, setAgent, addMessage, setLoading } =
    useChatStore();
  const [input, setInput] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useChatStore.getState().toggle();
      } else if (e.key === 'Escape' && useChatStore.getState().open) {
        useChatStore.getState().setOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const send = async () => {
    const q = input.trim();
    if (!q || loading) return;
    addMessage({
      id: `u-${Date.now()}`,
      role: 'user',
      content: q,
      createdAt: Date.now(),
    });
    setInput('');
    setLoading(true);
    try {
      let answer: AgentAnswer;
      if (agent === 'reasoning') answer = await lexa.ragAsk(q);
      else if (agent === 'tva') answer = await lexa.tvaAsk(q);
      else {
        const [desc, amt] = q.split('|').map((s) => s.trim());
        answer = await lexa.classify(desc ?? q, parseFloat(amt ?? '0') || 0);
      }
      addMessage({
        id: `a-${Date.now()}`,
        role: 'agent',
        agent,
        content: answer.answer,
        answer,
        createdAt: Date.now(),
      });
    } catch (e) {
      addMessage({
        id: `e-${Date.now()}`,
        role: 'agent',
        agent,
        content: `${t('common.error')}: ${e instanceof Error ? e.message : 'unknown'}`,
        createdAt: Date.now(),
      });
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 bg-bg/70 backdrop-blur-sm grid place-items-start pt-24"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ y: -16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -16, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={(e) => e.stopPropagation()}
            className="card-elevated w-full max-w-2xl mx-4 overflow-hidden flex flex-col max-h-[70vh]"
          >
            <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-accent" />
                <span className="text-sm font-medium">{t('chat.title')}</span>
              </div>
              <div className="flex items-center gap-1">
                {AGENTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAgent(a)}
                    className={`px-2.5 py-1 rounded-md text-2xs uppercase tracking-wider font-medium transition-colors ${
                      agent === a
                        ? 'bg-accent text-accent-fg'
                        : 'text-muted hover:text-ink hover:bg-elevated'
                    }`}
                  >
                    {t(`chat.agent_${a}`)}
                  </button>
                ))}
                <button
                  onClick={() => setOpen(false)}
                  className="ml-2 p-1 text-muted hover:text-ink"
                  aria-label={t('common.close')}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="h-full grid place-items-center text-center py-8">
                  <div>
                    <div className="text-sm text-muted max-w-md">
                      <strong className="text-ink">{t(`chat.agent_${agent}`)}</strong>
                      <span className="text-muted"> — {t(`chat.agent_${agent}_desc`)}</span>
                    </div>
                    <div className="mt-3 text-2xs text-subtle flex items-center gap-2 justify-center">
                      <kbd className="kbd">⌘</kbd>
                      <kbd className="kbd">K</kbd>
                      <span>pour ouvrir/fermer</span>
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
                    className={`max-w-[85%] rounded-xl px-3.5 py-2.5 text-sm ${
                      m.role === 'user'
                        ? 'bg-accent text-accent-fg'
                        : 'bg-elevated border border-border text-ink'
                    }`}
                  >
                    <div className="whitespace-pre-wrap">{m.content}</div>
                    {m.answer?.citations && m.answer.citations.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-border/50 space-y-0.5">
                        <div className="text-2xs font-medium text-muted uppercase tracking-wider mb-1">
                          {t('chat.citations')}
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
                                <span className="ml-2 opacity-60 mono-num">
                                  {c.score.toFixed(2)}
                                </span>
                              )}
                            </>
                          );
                          return c.url ? (
                            <a
                              key={i}
                              href={c.url}
                              target="_blank"
                              rel="noreferrer"
                              className="block text-2xs text-muted hover:text-accent truncate"
                            >
                              {inner}
                            </a>
                          ) : (
                            <div key={i} className="text-2xs text-muted truncate">
                              {inner}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {m.answer?.durationMs && (
                      <div className="text-2xs text-muted mt-1.5 mono-num">
                        {(m.answer.durationMs / 1000).toFixed(1)}s
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex justify-start">
                  <div className="bg-elevated border border-border rounded-xl px-3.5 py-2.5 flex items-center gap-2 text-sm text-muted">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {t('chat.thinking')}
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            <div className="border-t border-border p-3">
              <div className="flex gap-2 items-end">
                <textarea
                  ref={inputRef}
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
                      ? t('chat.placeholder_classifier')
                      : t('chat.placeholder')
                  }
                  rows={2}
                  className="input resize-none flex-1 text-sm"
                />
                <button
                  onClick={send}
                  disabled={loading || !input.trim()}
                  className="btn-primary"
                  aria-label="Envoyer"
                >
                  <Send className="w-4 h-4" />
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
