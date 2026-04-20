import type { ReactNode } from 'react';

interface LexaInsightProps {
  title: string;
  body: ReactNode;
  cta?: string;
  onCta?: () => void;
}

/**
 * Card "Lexa remarque" — dark chrome comme dans le prototype.
 * Conserve le look dark (#0A0A0A + orange Lexa accent) même dans le thème cream.
 */
export function LexaInsight({ title, body, cta, onCta }: LexaInsightProps) {
  return (
    <div
      style={{
        background: 'var(--chrome-bg)',
        color: 'var(--chrome-ink-1)',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 20,
        alignItems: 'center',
      }}
    >
      {/* Icône ✦ */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'var(--chrome-bg-2)',
          color: 'var(--lexa)',
          display: 'grid',
          placeItems: 'center',
          fontSize: 14,
          flexShrink: 0,
        }}
      >
        ✦
      </div>

      {/* Contenu */}
      <div>
        <div
          style={{
            fontSize: 10,
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--chrome-ink-3)',
            fontWeight: 600,
            marginBottom: 2,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'var(--chrome-ink-1)',
          }}
        >
          {body}
        </div>
      </div>

      {/* CTA optionnel */}
      {cta && (
        <button
          onClick={onCta}
          style={{
            background: 'var(--lexa)',
            color: 'var(--chrome-bg)',
            border: 0,
            padding: '8px 14px',
            borderRadius: 999,
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
        >
          {cta} ↗
        </button>
      )}
    </div>
  );
}
