import type { AccountClass } from './soldeDirection';
import { soldeDirection } from './soldeDirection';

interface DebitCreditBadgeProps {
  cls: AccountClass;
  balance: number;
  size?: 'sm' | 'lg';
}

export function DebitCreditBadge({ cls, balance, size = 'sm' }: DebitCreditBadgeProps) {
  const { side, anormal } = soldeDirection(cls, balance);
  const isDebit = side === 'D';
  const scale = size === 'sm' ? 1 : 1.15;

  // Couleurs adaptées au thème dark Lexa :
  // Débit (↑) = success (vert)
  // Crédit (↓) = warning (amber)
  const style: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: 10 * scale,
    fontWeight: 600,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: `${2 * scale}px ${6 * scale}px`,
    borderRadius: 4,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace',
    background: isDebit
      ? 'rgb(var(--success) / 0.15)'
      : 'rgb(var(--warning) / 0.15)',
    color: isDebit
      ? 'rgb(var(--success))'
      : 'rgb(var(--warning))',
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
        <span style={{ color: 'rgb(var(--danger))', marginLeft: 2 }}>!</span>
      )}
    </span>
  );
}
