import { useState, useMemo } from 'react';
import type { V2Account } from './AccountTile';
import { DebitCreditBadge } from './DebitCreditBadge';
import { LexaInsight } from './LexaInsight';
import { fmtMoney, fmtCompact } from './fmtMoney';
import { soldeDirection } from './soldeDirection';
import type { AccountClass } from './soldeDirection';

const TYPE_LABELS: Record<AccountClass, string> = {
  P: 'Produits',
  A: 'Actifs',
  L: 'Passifs',
  C: 'Charges',
};

const CLASS_BADGE: Record<AccountClass, React.CSSProperties> = {
  P: { background: 'var(--pos-bg)', color: 'var(--pos)' },
  A: { background: 'var(--ink-1)',  color: 'var(--lexa)' },
  L: { background: 'var(--tax-bg)', color: 'var(--tax)' },
  C: { background: 'var(--neg-bg)', color: 'var(--neg)' },
};

// Mini graphe radial contreparties (SVG simple)
interface MiniGraphProps {
  sel: V2Account;
  relatedAccounts: Array<{ code: string; name: string; amount: number; direction: 'in' | 'out' }>;
}

function LedgerMiniGraph({ sel, relatedAccounts }: MiniGraphProps) {
  const W = 300, H = 180;
  const cx = W / 2, cy = H / 2;
  const top = relatedAccounts.slice(0, 5);
  const maxAmt = Math.max(...top.map((f) => f.amount), 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 180, display: 'block' }}>
      {top.map((f, i) => {
        const angle = -Math.PI / 2 + ((i - (top.length - 1) / 2) * (Math.PI / (top.length + 1)));
        const r = 70;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        const t = Math.max(1.2, (f.amount / maxAmt) * 4);
        const c = f.direction === 'in' ? 'var(--pos)' : 'var(--neg)';
        return (
          <g key={i}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={c} strokeWidth={t} strokeOpacity={0.6} strokeLinecap="round" />
            <circle cx={x} cy={y} r={14} fill="var(--v2-surface)" stroke={c} strokeWidth={1.2} />
            <text
              x={x}
              y={y + 1}
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily='var(--mono-font)'
              fontSize={8}
              fontWeight={600}
              fill="var(--ink-2)"
            >
              {f.code.slice(0, 4)}
            </text>
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={22} fill="var(--ink-1)" />
      <text
        x={cx}
        y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fontFamily='var(--mono-font)'
        fontSize={10}
        fontWeight={600}
        fill="var(--lexa)"
      >
        {sel.code}
      </text>
    </svg>
  );
}

interface PmLedgerProps {
  accounts: V2Account[];
  focusCode: string | null;
  setFocusCode: (code: string | null) => void;
}

type FilterKey = 'all' | AccountClass;

export function PmLedger({ accounts, focusCode, setFocusCode }: PmLedgerProps) {
  const [filter, setFilter] = useState<FilterKey>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    return accounts.filter((a) => {
      if (filter !== 'all' && a.class !== filter) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !a.code.includes(q)) return false;
      }
      return true;
    });
  }, [accounts, filter, query]);

  const sel = focusCode ? accounts.find((a) => a.code === focusCode) : accounts[0];

  // Génère des pseudo-contreparties pour le graphe radial
  const relatedAccounts = useMemo(() => {
    if (!sel) return [];
    // Pour demo : on prend les comptes de classe différente avec les plus gros montants
    return accounts
      .filter((a) => a.code !== sel.code && Math.abs(a.balance) > 0)
      .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
      .slice(0, 5)
      .map((a) => ({
        code: a.code,
        name: a.name,
        amount: Math.abs(a.balance),
        direction: (a.class === 'A' ? 'in' : 'out') as 'in' | 'out',
      }));
  }, [sel, accounts]);

  return (
    <div className="v2-canvas" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '68px 24px 24px', minHeight: '100%' }}>
          <div
            style={{
              maxWidth: 1400,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: '1fr 380px',
              gap: 16,
            }}
          >
            {/* Liste gauche */}
            <div
              style={{
                background: 'var(--v2-surface)',
                border: '1px solid rgb(var(--border))',
                borderRadius: 12,
                overflow: 'hidden',
              }}
            >
              {/* Barre de recherche + filtres */}
              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  padding: 10,
                  alignItems: 'center',
                  borderBottom: '1px solid rgb(var(--border))',
                }}
              >
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 10px',
                    background: 'rgb(var(--elevated))',
                    borderRadius: 7,
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                    <circle cx="7" cy="7" r="4.5" stroke="rgb(var(--muted))" strokeWidth="1.2" />
                    <path d="M13 13l-2.5-2.5" stroke="rgb(var(--muted))" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Rechercher un compte…"
                    style={{
                      flex: 1,
                      border: 0,
                      background: 'transparent',
                      outline: 'none',
                      fontFamily: 'inherit',
                      color: 'rgb(var(--ink))',
                      fontSize: 12,
                    }}
                  />
                  <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgb(var(--subtle))' }}>
                    {filtered.length}
                  </span>
                </div>

                {/* Filtres par classe */}
                <div style={{ display: 'inline-flex', background: 'rgb(var(--elevated))', borderRadius: 8, padding: 3, gap: 2 }}>
                  {(['all', 'P', 'A', 'L', 'C'] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setFilter(t)}
                      style={{
                        padding: '5px 10px',
                        borderRadius: 6,
                        border: 0,
                        background: filter === t ? 'var(--v2-surface)' : 'transparent',
                        color: filter === t ? 'rgb(var(--ink))' : 'rgb(var(--muted))',
                        cursor: 'pointer',
                        fontSize: 11,
                        fontWeight: 500,
                        boxShadow: filter === t ? '0 1px 2px rgb(0 0 0 / 0.3)' : 'none',
                      }}
                    >
                      {t === 'all' ? 'Tous' : TYPE_LABELS[t]}
                    </button>
                  ))}
                </div>
              </div>

              {/* En-têtes colonnes */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '60px 1fr 100px 80px 110px 110px 60px',
                  gap: 10,
                  padding: '10px 16px',
                  fontSize: 10,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                  color: 'rgb(var(--muted))',
                  fontWeight: 600,
                  borderBottom: '1px solid rgb(var(--border))',
                  background: 'rgb(var(--elevated))',
                }}
              >
                <span>Code</span>
                <span>Intitulé</span>
                <span>Type</span>
                <span>Sens</span>
                <span style={{ textAlign: 'right' }}>Débit</span>
                <span style={{ textAlign: 'right' }}>Crédit</span>
                <span style={{ textAlign: 'right' }}>Mvts</span>
              </div>

              {/* Lignes */}
              <div style={{ maxHeight: 540, overflowY: 'auto' }}>
                {filtered.map((a) => {
                  const isActive = sel?.code === a.code;
                  const dir = soldeDirection(a.class, a.balance);
                  return (
                    <div
                      key={a.code}
                      onClick={() => setFocusCode(a.code)}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '60px 1fr 100px 80px 110px 110px 60px',
                        gap: 10,
                        padding: '11px 16px',
                        alignItems: 'center',
                        borderBottom: '1px solid rgb(var(--border))',
                        background: isActive ? 'rgb(var(--elevated))' : 'transparent',
                        cursor: 'pointer',
                        position: 'relative',
                      }}
                    >
                      {isActive && (
                        <span
                          style={{
                            position: 'absolute',
                            left: 0,
                            top: 0,
                            bottom: 0,
                            width: 2,
                            background: 'rgb(var(--accent))',
                          }}
                        />
                      )}
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgb(var(--muted))', fontWeight: 500 }}>
                        {a.code}
                      </span>
                      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(var(--ink))' }}>{a.name}</span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 3,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          justifySelf: 'start',
                          ...CLASS_BADGE[a.class],
                        }}
                      >
                        {TYPE_LABELS[a.class]}
                      </span>
                      <DebitCreditBadge cls={a.class} balance={a.balance} />
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 12,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 500,
                          color: dir.side === 'D' ? 'rgb(var(--ink))' : 'rgb(var(--subtle))',
                        }}
                      >
                        {dir.side === 'D' ? fmtMoney(dir.abs) : <span style={{ opacity: 0.3 }}>—</span>}
                      </span>
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", monospace',
                          fontSize: 12,
                          textAlign: 'right',
                          fontVariantNumeric: 'tabular-nums',
                          fontWeight: 500,
                          color: dir.side === 'C' ? 'rgb(var(--ink))' : 'rgb(var(--subtle))',
                        }}
                      >
                        {dir.side === 'C' ? fmtMoney(dir.abs) : <span style={{ opacity: 0.3 }}>—</span>}
                      </span>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgb(var(--subtle))', textAlign: 'right' }}>
                        {a.movements}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Panneau détail droit */}
            <div style={{ position: 'sticky', top: 24, height: 'fit-content', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sel && (
                <div
                  style={{
                    background: 'var(--v2-surface)',
                    border: '1px solid rgb(var(--border))',
                    borderRadius: 12,
                    overflow: 'hidden',
                  }}
                >
                  {/* Header détail */}
                  <div style={{ padding: 18, borderBottom: '1px solid rgb(var(--border))' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: 'rgb(var(--muted))', fontWeight: 500 }}>
                        {sel.code}
                      </span>
                      <span
                        style={{
                          fontSize: 10,
                          fontWeight: 600,
                          padding: '2px 7px',
                          borderRadius: 3,
                          letterSpacing: '0.04em',
                          textTransform: 'uppercase',
                          ...CLASS_BADGE[sel.class],
                        }}
                      >
                        {TYPE_LABELS[sel.class]}
                      </span>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'rgb(var(--ink))' }}>
                      {sel.name}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 10 }}>
                      <DebitCreditBadge cls={sel.class} balance={sel.balance} size="lg" />
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 22, fontWeight: 500, fontVariantNumeric: 'tabular-nums', color: 'rgb(var(--ink))' }}>
                        {fmtMoney(Math.abs(sel.balance))}
                      </span>
                      <span style={{ fontSize: 11, color: 'rgb(var(--subtle))' }}>
                        CHF · {sel.movements} écriture(s)
                      </span>
                    </div>
                  </div>

                  {/* Graphe mini radial */}
                  <div style={{ padding: 16 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted))', fontWeight: 600, marginBottom: 10 }}>
                      Flux liés · {relatedAccounts.length}
                    </div>
                    <LedgerMiniGraph sel={sel} relatedAccounts={relatedAccounts} />
                  </div>

                  {/* Contreparties */}
                  <div style={{ padding: 16, paddingTop: 0 }}>
                    <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted))', fontWeight: 600, marginBottom: 8 }}>
                      Contreparties proches
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {relatedAccounts.slice(0, 6).map((f, i) => (
                        <div
                          key={i}
                          onClick={() => setFocusCode(f.code)}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '10px 1fr auto',
                            gap: 10,
                            padding: '6px 8px',
                            borderRadius: 6,
                            background: 'rgb(var(--elevated))',
                            alignItems: 'center',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ fontSize: 12, color: f.direction === 'out' ? 'rgb(var(--danger))' : 'rgb(var(--success))', fontWeight: 600, textAlign: 'center' }}>
                            {f.direction === 'out' ? '→' : '←'}
                          </span>
                          <span style={{ fontSize: 12, color: 'rgb(var(--ink))' }}>{f.name}</span>
                          <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 11, color: 'rgb(var(--muted))', fontVariantNumeric: 'tabular-nums' }}>
                            {fmtCompact(f.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              <LexaInsight
                title="Lexa vous conseille"
                body={
                  <>
                    Ce compte a <strong>{relatedAccounts.length}</strong> contrepartie(s) active(s). Vérifiez le rapprochement bancaire.
                  </>
                }
                cta="Rapprocher"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
