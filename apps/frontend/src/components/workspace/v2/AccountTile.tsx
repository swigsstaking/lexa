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

// Couleurs de classe — palette prototype cream
// A (Actifs): bg dark chrome, texte orange lexa
// P (Produits): bg pos-bg vert clair, texte pos vert
// L (Passifs): bg tax-bg orange-crème, texte tax orange
// C (Charges): bg neg-bg rose, texte neg rouge
function classBadgeStyle(cls: AccountClass): React.CSSProperties {
  switch (cls) {
    case 'A':
      return {
        background: 'var(--bg-2)',
        color: 'var(--ink-2)',
      };
    case 'P':
      return {
        background: 'var(--pos-bg)',
        color: 'var(--pos)',
      };
    case 'L':
      return {
        background: 'var(--tax-bg)',
        color: 'var(--tax)',
      };
    case 'C':
      return {
        background: 'var(--neg-bg)',
        color: 'var(--neg)',
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
        background: 'var(--v2-surface)',
        border: focused
          ? '1.5px solid var(--lexa)'
          : '1px solid var(--line-1)',
        borderRadius: 10,
        padding: dense ? '9px 11px' : '11px 13px',
        cursor: 'pointer',
        opacity: dimmed ? 0.28 : 1,
        transition: 'opacity 160ms, border-color 160ms, transform 160ms',
        boxShadow: focused ? '0 2px 12px rgba(10,10,10,0.06)' : 'none',
        transform: focused ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Header : code + badge classe */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
        <span
          style={{
            fontFamily: 'var(--mono-font)',
            fontSize: 10,
            color: 'var(--ink-4)',
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
          color: 'var(--ink-1)',
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
            fontFamily: 'var(--mono-font)',
            fontSize: 12,
            fontVariantNumeric: 'tabular-nums',
            fontWeight: 500,
            color: 'var(--ink-1)',
          }}
        >
          {fmtMoney(dir.abs)}
        </span>
      </div>
    </div>
  );
}
