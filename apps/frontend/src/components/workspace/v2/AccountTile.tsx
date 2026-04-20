import type { AccountClass } from './soldeDirection';
import { soldeDirection } from './soldeDirection';
import { DebitCreditBadge } from './DebitCreditBadge';
import { fmtMoney } from './fmtMoney';

export interface V2Account {
  code: string;      // ex. "1020"
  name: string;      // ex. "Banque"
  class: AccountClass;
  balance: number;
  totalDebit: number;
  totalCredit: number;
  movements: number; // debitCount + creditCount
}

interface AccountTileProps {
  acct: V2Account;
  focused?: boolean;
  dimmed?: boolean;
  dense?: boolean;
  onHover?: (code: string) => void;
  onLeave?: () => void;
  onClick?: (code: string) => void;
}

const CLASS_LABELS: Record<AccountClass, string> = {
  P: 'Produits',
  A: 'Actifs',
  L: 'Passifs',
  C: 'Charges',
};

// Couleurs de classe adaptées au thème dark Lexa
// A (Actifs): bg surface-ink, texte accent
// P (Produits): bg success/15, texte success
// L (Passifs): bg warning/15, texte warning
// C (Charges): bg danger/15, texte danger
function classBadgeStyle(cls: AccountClass): React.CSSProperties {
  switch (cls) {
    case 'A':
      return {
        background: 'rgb(var(--ink) / 0.9)',
        color: 'rgb(var(--accent))',
      };
    case 'P':
      return {
        background: 'rgb(var(--success) / 0.15)',
        color: 'rgb(var(--success))',
      };
    case 'L':
      return {
        background: 'rgb(var(--warning) / 0.15)',
        color: 'rgb(var(--warning))',
      };
    case 'C':
      return {
        background: 'rgb(var(--danger) / 0.15)',
        color: 'rgb(var(--danger))',
      };
  }
}

export function AccountTile({
  acct,
  focused = false,
  dimmed = false,
  dense = false,
  onHover,
  onLeave,
  onClick,
}: AccountTileProps) {
  const dir = soldeDirection(acct.class, acct.balance);

  return (
    <div
      data-code={acct.code}
      onMouseEnter={() => onHover?.(acct.code)}
      onMouseLeave={() => onLeave?.()}
      onClick={() => onClick?.(acct.code)}
      style={{
        position: 'relative',
        background: 'rgb(var(--surface))',
        border: focused
          ? '1.5px solid rgb(var(--accent))'
          : '1px solid rgb(var(--border))',
        borderRadius: 10,
        padding: dense ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        opacity: dimmed ? 0.28 : 1,
        transition: 'opacity 160ms, border-color 160ms, transform 160ms',
        boxShadow: focused ? '0 2px 12px rgb(0 0 0 / 0.25)' : 'none',
        transform: focused ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Header : code + badge classe */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 10,
            color: 'rgb(var(--muted))',
            fontWeight: 500,
            letterSpacing: '0.02em',
          }}
        >
          {acct.code}
        </span>
        <span
          style={{
            fontSize: 9,
            fontWeight: 600,
            padding: '1px 5px',
            borderRadius: 3,
            letterSpacing: '0.04em',
            textTransform: 'uppercase' as const,
            ...classBadgeStyle(acct.class),
          }}
        >
          {CLASS_LABELS[acct.class]}
        </span>
      </div>

      {/* Nom du compte */}
      <div
        style={{
          fontSize: 12,
          fontWeight: 500,
          marginTop: 6,
          color: 'rgb(var(--ink))',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap' as const,
        }}
        title={acct.name}
      >
        {acct.name}
      </div>

      {/* Footer : badge D/C + montant */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
        }}
      >
        <DebitCreditBadge cls={acct.class} balance={acct.balance} />
        <span
          style={{
            fontFamily: '"JetBrains Mono", ui-monospace, monospace',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            color: 'rgb(var(--ink))',
          }}
        >
          {fmtMoney(dir.abs)}
        </span>
      </div>
    </div>
  );
}
