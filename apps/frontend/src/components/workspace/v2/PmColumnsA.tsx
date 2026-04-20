import {
  useState,
  useMemo,
  useRef,
  useLayoutEffect,
  useCallback,
} from 'react';
import type { V2Account } from './AccountTile';
import { AccountTile } from './AccountTile';
import { LexaInsight } from './LexaInsight';
import { fmtMoney, fmtCompact } from './fmtMoney';
import type { AccountClass } from './soldeDirection';

// ——— Flow entre comptes (calculé naïvement depuis totalDebit/totalCredit) ———
interface Flow {
  from: string;
  to: string;
  amount: number;
  kind: 'in' | 'out' | 'asset' | 'tax';
}

const KIND_COLOR: Record<string, string> = {
  in: 'var(--pos)',
  out: 'var(--neg)',
  asset: 'var(--ast)',
  tax: 'var(--tax)',
};

/** Génère des flux simplifiés entre colonnes adjacentes à partir des données de compte */
function buildFlows(byClass: Record<AccountClass, V2Account[]>): Flow[] {
  const flows: Flow[] = [];
  const produits = byClass['P'];
  const actifs   = byClass['A'];
  const passifs  = byClass['L'];
  const charges  = byClass['C'];

  // Produits → Actifs (entrées de trésorerie)
  produits.slice(0, 3).forEach((p) => {
    const a = actifs[0];
    if (a && Math.abs(p.balance) > 0) {
      flows.push({ from: p.code, to: a.code, amount: Math.abs(p.balance), kind: 'in' });
    }
  });

  // Actifs → Charges (sorties)
  actifs.slice(0, 2).forEach((a) => {
    charges.slice(0, 2).forEach((c) => {
      if (Math.abs(c.balance) > 0) {
        flows.push({ from: a.code, to: c.code, amount: Math.abs(c.balance) * 0.4, kind: 'out' });
      }
    });
  });

  // Passifs → Actifs (dettes/financement)
  passifs.slice(0, 2).forEach((l) => {
    const a = actifs[1] ?? actifs[0];
    if (a && Math.abs(l.balance) > 0) {
      flows.push({ from: l.code, to: a.code, amount: Math.abs(l.balance) * 0.3, kind: 'asset' });
    }
  });

  return flows;
}

// ——— Hook mesure des positions des tiles ———
interface Rect { x: number; y: number; w: number; h: number }

function useAccountRects(
  gridRef: React.RefObject<HTMLDivElement | null>,
  scrollRef: React.RefObject<HTMLDivElement | null>,
  deps: unknown[],
) {
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [size, setSize] = useState({ w: 0, h: 0 });

  const measure = useCallback(() => {
    if (!gridRef.current) return;
    const host = gridRef.current.getBoundingClientRect();
    setSize({ w: host.width, h: host.height });
    const next: Record<string, Rect> = {};
    gridRef.current.querySelectorAll<HTMLElement>('[data-code]').forEach((el) => {
      const r = el.getBoundingClientRect();
      const code = el.dataset.code!;
      next[code] = {
        x: r.left - host.left,
        y: r.top - host.top,
        w: r.width,
        h: r.height,
      };
    });
    setRects(next);
  }, [gridRef]);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (gridRef.current) ro.observe(gridRef.current);
    window.addEventListener('resize', measure);
    const s = scrollRef?.current;
    if (s) s.addEventListener('scroll', measure);
    const t = setTimeout(measure, 80);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
      if (s) s.removeEventListener('scroll', measure);
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { rects, size };
}

// ——— KPI strip ———
interface PmKpisProps {
  accounts: V2Account[];
  visibility: { tresorerie: boolean; resultat: boolean; tva: boolean; anomalies: boolean };
}

function PmKpis({ accounts, visibility }: PmKpisProps) {
  const tresorerie = accounts
    .filter((a) => a.class === 'A' && a.code.startsWith('10'))
    .reduce((s, a) => s + Math.abs(a.balance), 0);

  const resultat =
    accounts.filter((a) => a.class === 'P').reduce((s, a) => s + Math.abs(a.balance), 0) -
    accounts.filter((a) => a.class === 'C').reduce((s, a) => s + Math.abs(a.balance), 0);

  const tva = accounts
    .filter((a) => a.code.startsWith('22'))
    .reduce((s, a) => s + Math.abs(a.balance), 0);

  const anomalies = accounts.filter((a) => {
    const cls = a.class;
    const normalPositive = cls === 'A' || cls === 'C';
    return a.balance !== 0 && (normalPositive ? a.balance < 0 : a.balance > 0);
  }).length;

  const items = [
    { key: 'tresorerie', k: 'Trésorerie',   v: fmtMoney(tresorerie) + ' CHF', d: 'Liquidités disponibles' },
    { key: 'resultat',   k: 'Résultat net',  v: fmtMoney(resultat)   + ' CHF', d: resultat >= 0 ? 'Bénéfice' : 'Déficit' },
    { key: 'tva',        k: 'TVA à payer',   v: fmtMoney(tva)        + ' CHF', d: 'Échéance prochaine' },
    { key: 'anomalies',  k: 'Anomalies',     v: String(anomalies),             d: 'Soldes de sens anormal', alert: anomalies > 0 },
  ].filter((x) => visibility[x.key as keyof typeof visibility] !== false);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        maxWidth: 1400,
        margin: '0 auto 16px',
        display: 'grid',
        gridTemplateColumns: `repeat(${items.length}, 1fr)`,
        gap: 1,
        background: 'var(--line-1)',
        border: '1px solid var(--line-1)',
        borderRadius: 12,
        overflow: 'hidden',
      }}
    >
      {items.map((x, i) => (
        <div
          key={i}
          style={{
            padding: '14px 18px',
            background: 'var(--v2-surface)',
            display: 'flex',
            flexDirection: 'column',
            gap: 4,
            position: 'relative',
          }}
        >
          {x.alert && (
            <span
              style={{
                position: 'absolute',
                top: 12,
                right: 14,
                width: 6,
                height: 6,
                borderRadius: 3,
                background: 'var(--lexa)',
                boxShadow: '0 0 0 3px rgba(212,52,44,0.25)',
              }}
            />
          )}
          <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--ink-4)', fontWeight: 600 }}>
            {x.k}
          </span>
          <span style={{ fontFamily: 'var(--mono-font)', fontSize: 20, fontWeight: 500, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.01em', color: 'var(--ink-1)' }}>
            {x.v}
          </span>
          <span style={{ fontSize: 11, color: 'var(--ink-3)' }}>
            {x.d}
          </span>
        </div>
      ))}
    </div>
  );
}

// ——— Colonnes A ———
interface PmColumnsAProps {
  accounts: V2Account[];
  showFlows: boolean;
  focusCode: string | null;
  setFocusCode: (code: string | null) => void;
  kpiVisibility: { tresorerie: boolean; resultat: boolean; tva: boolean; anomalies: boolean };
  onOpenDrawer?: (code: string) => void;
}

const COLUMN_ORDER: AccountClass[] = ['P', 'A', 'L', 'C'];

const COLUMN_META: Record<AccountClass, { label: string; sub: string }> = {
  P: { label: 'Produits', sub: 'Classe 3 — revenus' },
  A: { label: 'Actifs', sub: 'Classe 1 — immobilisations & liquidités' },
  L: { label: 'Passifs', sub: 'Classe 2 — dettes & capitaux' },
  C: { label: 'Charges', sub: 'Classes 4–9 — coûts' },
};

export function PmColumnsA({
  accounts,
  showFlows,
  focusCode,
  setFocusCode,
  kpiVisibility,
  onOpenDrawer,
}: PmColumnsAProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef   = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<string | null>(null);

  const byClass = useMemo(() => {
    const g: Record<AccountClass, V2Account[]> = { P: [], A: [], L: [], C: [] };
    accounts.forEach((a) => g[a.class]?.push(a));
    Object.values(g).forEach((arr) => arr.sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance)));
    return g;
  }, [accounts]);

  const flows = useMemo(() => buildFlows(byClass), [byClass]);

  const { rects, size } = useAccountRects(gridRef, scrollRef, [accounts, showFlows]);

  const active = focusCode ?? hover;

  const connected = useMemo(() => {
    if (!active) return null;
    const s = new Set([active]);
    flows.forEach((f) => {
      if (f.from === active) s.add(f.to);
      if (f.to === active) s.add(f.from);
    });
    return s;
  }, [active, flows]);

  // Calcul des paths SVG courbes
  const paths = useMemo(() => {
    return flows
      .map((f, i) => {
        const a = rects[f.from];
        const b = rects[f.to];
        if (!a || !b) return null;
        const dir = b.x + b.w / 2 > a.x + a.w / 2 ? 1 : -1;
        const ax = dir === 1 ? a.x + a.w : a.x;
        const ay = a.y + a.h / 2;
        const bx = dir === 1 ? b.x : b.x + b.w;
        const by = b.y + b.h / 2;
        const dx = Math.abs(bx - ax);
        const cp = Math.max(50, dx * 0.55);
        const d = `M ${ax} ${ay} C ${ax + cp * dir} ${ay}, ${bx - cp * dir} ${by}, ${bx} ${by}`;
        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const isActive = !!active && (f.from === active || f.to === active);
        return { i, f, d, ax, ay, bx, by, mx, my, dir, isActive };
      })
      .filter(Boolean) as Array<{
        i: number; f: Flow; d: string; ax: number; ay: number;
        bx: number; by: number; mx: number; my: number; dir: number; isActive: boolean;
      }>;
  }, [flows, rects, active]);

  return (
    <div
      className="v2-canvas"
      style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}
    >
      <div
        ref={scrollRef}
        style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}
      >
        <div style={{ padding: '68px 24px 24px', minHeight: '100%' }}>
          <PmKpis accounts={accounts} visibility={kpiVisibility} />

          <div
            ref={gridRef}
            style={{
              maxWidth: 1400,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 28,
              position: 'relative',
            }}
          >
            {COLUMN_ORDER.map((k) => {
              const meta = COLUMN_META[k];
              const list = byClass[k];
              const total = list.reduce((s, a) => s + a.balance, 0);

              return (
                <div
                  key={k}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 2 }}
                >
                  {/* Header colonne */}
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'baseline',
                      justifyContent: 'space-between',
                      padding: '0 2px 8px',
                      borderBottom: '1px solid var(--line-1)',
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600 }}>
                        {meta.label}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)', marginTop: 2 }}>
                        {meta.sub} · <span style={{ fontFamily: 'var(--mono-font)' }}>{list.length}</span>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontFamily: 'var(--mono-font)', fontWeight: 500, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-1)' }}>
                        {fmtMoney(total)}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--ink-4)' }}>CHF</div>
                    </div>
                  </div>

                  {/* Tiles */}
                  {list.map((acct) => (
                    <AccountTile
                      key={acct.code}
                      acct={acct}
                      focused={focusCode === acct.code}
                      dimmed={connected ? !connected.has(acct.code) : false}
                      onHover={setHover}
                      onLeave={() => setHover(null)}
                      onClick={(c) => {
                        if (onOpenDrawer) {
                          onOpenDrawer(c);
                        } else {
                          setFocusCode(focusCode === c ? null : c);
                        }
                      }}
                    />
                  ))}
                </div>
              );
            })}

            {/* SVG overlay flux */}
            <svg
              width={size.w}
              height={size.h}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                zIndex: 1,
                pointerEvents: 'none',
                overflow: 'visible',
              }}
            >
              <defs>
                {Object.entries(KIND_COLOR).map(([k, c]) => (
                  <marker
                    key={k}
                    id={`arrA-${k}`}
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto-start-reverse"
                  >
                    <path d="M0 1 L9 5 L0 9 Z" fill={c} />
                  </marker>
                ))}
              </defs>
              {paths.map((p) => {
                const visible = showFlows || p.isActive;
                if (!visible) return null;
                const c = KIND_COLOR[p.f.kind];
                const opacity = active ? (p.isActive ? 1 : 0.08) : 0.45;
                const width = p.isActive ? 2.2 : 1.4;
                return (
                  <g key={p.i} style={{ opacity, transition: 'opacity 200ms' }}>
                    <path
                      d={p.d}
                      fill="none"
                      stroke={c}
                      strokeWidth={width}
                      strokeLinecap="round"
                      strokeDasharray={p.f.kind === 'asset' ? '4 3' : 'none'}
                      markerEnd={`url(#arrA-${p.f.kind})`}
                    />
                  </g>
                );
              })}
            </svg>

            {/* Pastilles montant sur les flux */}
            {paths.map((p) => {
              const visible = showFlows || p.isActive;
              if (!visible) return null;
              const strong = p.isActive;
              return (
                <div
                  key={'lbl' + p.i}
                  style={{
                    position: 'absolute',
                    left: p.mx,
                    top: p.my,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    background: strong ? 'var(--ink-1)' : 'var(--v2-surface)',
                    color: strong ? '#FAFAF7' : 'var(--ink-2)',
                    border: strong ? 'none' : '1px solid var(--line-1)',
                    padding: '3px 8px',
                    borderRadius: 999,
                    fontFamily: 'var(--mono-font)',
                    fontSize: 10,
                    fontWeight: 500,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    boxShadow: strong ? '0 2px 8px rgba(10,10,10,0.15)' : '0 1px 2px rgba(10,10,10,0.04)',
                    pointerEvents: 'none',
                    opacity: active && !p.isActive ? 0.1 : 1,
                    transition: 'opacity 200ms',
                  }}
                >
                  {fmtCompact(p.f.amount)} CHF
                </div>
              );
            })}
          </div>

          {/* LexaInsight */}
          <div style={{ maxWidth: 1400, margin: '32px auto 0' }}>
            <LexaInsight
              title="Lexa remarque"
              body={
                <>
                  <strong>{accounts.filter((a) => a.class === 'P').length} comptes de produits</strong> actifs ce mois.
                  Les charges représentent{' '}
                  <span style={{ color: 'var(--lexa)' }}>
                    {accounts.filter((a) => a.class === 'C').length} postes
                  </span>.
                  {accounts.filter((a) => {
                    const cls = a.class;
                    const normalPositive = cls === 'A' || cls === 'C';
                    return a.balance !== 0 && (normalPositive ? a.balance < 0 : a.balance > 0);
                  }).length > 0 && (
                    <>
                      {' '}
                      <span style={{ color: 'var(--lexa)' }}>
                        {accounts.filter((a) => {
                          const cls = a.class;
                          const normalPositive = cls === 'A' || cls === 'C';
                          return a.balance !== 0 && (normalPositive ? a.balance < 0 : a.balance > 0);
                        }).length} anomalie(s)
                      </span>{' '}
                      détectée(s).
                    </>
                  )}
                </>
              }
              cta="Ouvrir le rapport"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
