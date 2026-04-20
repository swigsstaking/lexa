import type { AccountClass } from './soldeDirection';
import { soldeDirection } from './soldeDirection';

interface DebitCreditBadgeProps {
  cls: AccountClass;
  balance: number;
  size?: 'sm' | 'lg';
}

/**
 * Badge ↑ Débit / ↓ Crédit — palette prototype.
 * Débit = vert (pos), Crédit = orange fiscal (tax), anomalie = !
 */
export function DebitCreditBadge({ cls, balance, size = 'sm' }: DebitCreditBadgeProps) {
  const { side, anormal } = soldeDirection(cls, balance);
  const isDebit = side === 'D';
  const scale = size === 'sm' ? 1 : 1.15;

  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
    fontSize: 10 * scale,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: `${2 * scale}px ${6 * scale}px`,
    borderRadius: 4,
    fontFamily: 'var(--mono-font)',
    background: isDebit ? 'var(--pos-bg)' : 'var(--tax-bg)',
    color: isDebit ? 'var(--pos)' : 'var(--tax)',
    opacity: anormal ? 0.7 : 1,
  };

  return (
    <span
      style={style}
      title={anormal ? 'Sens anormal pour cette classe de compte' : undefined}
    >
      <span style={{ fontSize: 11 * scale, lineHeight: 1 }}>
        {isDebit ? '↑' : '↓'}
      </span>
      {isDebit ? 'Débit' : 'Crédit'}
      {anormal && (
        <span style={{ color: 'var(--neg)', marginLeft: 2 }}>!</span>
      )}
    </span>
  );
}
