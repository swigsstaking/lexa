import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

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
  },
  {
    icon: '↻',
    title: 'Rapprocher les écritures de la Banque',
    sub: 'Agent Reconciliation · écritures en attente',
    k: '↵',
  },
  {
    icon: '!',
    title: 'Vérifier les anomalies détectées',
    sub: 'Agent Anomalies · soldes de sens anormal',
    k: '↵',
  },
  {
    icon: '?',
    title: 'Poser une question sur tes comptes',
    sub: 'Pose une question libre sur le grand livre',
    k: '↵',
  },
];

export function LexaCmdK({
  open,
  setOpen,
  accounts = [],
  onSuggestion,
  onJumpAccount,
  onOpenChat,
}: LexaCmdKProps) {
  const [q, setQ] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input quand ouvert
  useEffect(() => {
    if (open) {
      setQ('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Cmd+K + Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Ne pas intercepter si Shift (laissé à grand livre)
        if (e.shiftKey) return;
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

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

  return createPortal(
    <>
      {/* Overlay */}
      <div
        onClick={() => setOpen(false)}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(10,10,10,0.42)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 500,
          display: open ? 'grid' : 'none',
          placeItems: 'start center',
          paddingTop: '12vh',
          animation: open ? 'cmdk-fade-in 0.12s ease' : 'none',
        }}
      >
        {/* Card */}
        <div
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 'min(640px, 92vw)',
            background: 'var(--surface, #FFFFFF)',
            border: '1px solid var(--line-2, #D9D9D0)',
            borderRadius: 18,
            boxShadow: '0 24px 80px rgba(10,10,10,0.24)',
            overflow: 'hidden',
            animation: open ? 'cmdk-slide-in 0.15s ease' : 'none',
          }}
        >
          {/* Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              padding: '14px 18px',
              borderBottom: '1px solid var(--line-1, #E8E8E1)',
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
              placeholder="Demande à Lexa, ou saute vers un compte…"
              style={{
                flex: 1,
                fontSize: 15,
                border: 0,
                outline: 'none',
                background: 'transparent',
                color: 'var(--ink-1, #0A0A0A)',
                fontFamily: 'Inter, ui-sans-serif, sans-serif',
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (filteredSuggestions[selectedIdx]) {
                    onSuggestion?.(filteredSuggestions[selectedIdx].title);
                    onOpenChat?.();
                    setOpen(false);
                  }
                }
                if (e.key === 'ArrowDown') setSelectedIdx((i) => Math.min(i + 1, filteredSuggestions.length - 1));
                if (e.key === 'ArrowUp') setSelectedIdx((i) => Math.max(i - 1, 0));
              }}
            />
            <span
              style={{
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: 10,
                color: 'var(--ink-4, #9A9A93)',
              }}
            >
              esc
            </span>
          </div>

          {/* Body */}
          <div style={{ maxHeight: 420, overflow: 'auto' }}>
            {/* Suggestions IA */}
            {filteredSuggestions.length > 0 && (
              <>
                <div
                  style={{
                    padding: '10px 20px 6px',
                    fontSize: 10,
                    textTransform: 'uppercase' as const,
                    letterSpacing: '0.08em',
                    color: 'var(--ink-4, #9A9A93)',
                    fontWeight: 600,
                  }}
                >
                  Suggestions IA
                </div>
                {filteredSuggestions.map((s, i) => (
                  <div
                    key={i}
                    onClick={() => {
                      onSuggestion?.(s.title);
                      onOpenChat?.();
                      setOpen(false);
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 20px',
                      cursor: 'pointer',
                      background: i === selectedIdx ? 'var(--bg-2, #F3F3EE)' : 'transparent',
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
                      <div style={{ fontWeight: 500, color: 'var(--ink-1, #0A0A0A)', fontSize: 13 }}>
                        {s.title}
                      </div>
                      <div style={{ color: 'var(--ink-3, #6B6B66)', fontSize: 12 }}>{s.sub}</div>
                    </div>
                    <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 10, color: 'var(--ink-4, #9A9A93)' }}>
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
                    color: 'var(--ink-4, #9A9A93)',
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
                      (e.currentTarget as HTMLElement).style.background = 'var(--bg-2, #F3F3EE)';
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
                        background: 'var(--bg-2, #F3F3EE)',
                        display: 'grid',
                        placeItems: 'center',
                        fontFamily: 'JetBrains Mono, monospace',
                        fontSize: 10,
                        color: 'var(--ink-2, #3B3B38)',
                        flexShrink: 0,
                      }}
                    >
                      {a.code}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 500, color: 'var(--ink-1, #0A0A0A)', fontSize: 13 }}>
                        {a.name}
                      </div>
                      <div style={{ color: 'var(--ink-3, #6B6B66)', fontSize: 12 }}>
                        Solde {fmtMoney(a.balance)} CHF
                      </div>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div
            style={{
              padding: '10px 20px',
              borderTop: '1px solid var(--line-1, #E8E8E1)',
              display: 'flex',
              justifyContent: 'space-between',
              color: 'var(--ink-4, #9A9A93)',
              fontSize: 11,
              background: 'var(--bg-2, #F3F3EE)',
            }}
          >
            <span>Alimenté par les Agents Lexa</span>
            <span>
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>↑↓</span> naviguer ·{' '}
              <span style={{ fontFamily: 'JetBrains Mono, monospace' }}>↵</span> valider
            </span>
          </div>
        </div>
      </div>

      {/* Animations keyframes injectées une fois */}
      <style>{`
        @keyframes cmdk-fade-in {
          from { opacity: 0 }
          to   { opacity: 1 }
        }
        @keyframes cmdk-slide-in {
          from { transform: translateY(-8px) scale(0.98); opacity: 0 }
          to   { transform: none; opacity: 1 }
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
