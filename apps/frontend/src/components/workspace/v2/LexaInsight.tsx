import type { ReactNode } from 'react';

interface LexaInsightProps {
  title: string;
  body: ReactNode;
  cta?: string;
  onCta?: () => void;
}

/**
 * Card dark "Lexa remarque" — thème dark stone Lexa.
 * Adapté depuis le prototype : cream/orange → tokens dark Lexa.
 * bg-bg (dark bg) + border-border + ink / muted.
 */
export function LexaInsight({ title, body, cta, onCta }: LexaInsightProps) {
  return (
    <div
      style={{
        background: 'rgb(var(--surface))',
        border: '1px solid rgb(var(--border-strong))',
        borderRadius: 14,
        padding: '16px 20px',
        display: 'grid',
        gridTemplateColumns: 'auto 1fr auto',
        gap: 16,
        alignItems: 'center',
      }}
    >
      {/* Icône ✦ */}
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: 9,
          background: 'rgb(var(--elevated))',
          color: 'rgb(var(--accent))',
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
            color: 'rgb(var(--subtle))',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          {title}
        </div>
        <div
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            color: 'rgb(var(--ink))',
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
            background: 'rgb(var(--accent))',
            color: 'rgb(var(--accent-fg))',
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
