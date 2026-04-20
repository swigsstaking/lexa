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

interface Flow {
  from: string;
  to: string;
  amount: number;
  kind: 'in' | 'out' | 'asset' | 'tax';
}

const KIND_COLOR: Record<string, string> = {
  in:    'var(--pos)',
  out:   'var(--neg)',
  asset: 'var(--ast)',
  tax:   'var(--tax)',
};

function buildFlows(byClass: Record<AccountClass, V2Account[]>): Flow[] {
  const flows: Flow[] = [];
  const produits = byClass['P'];
  const actifs   = byClass['A'];
  const passifs  = byClass['L'];
  const charges  = byClass['C'];

  produits.slice(0, 3).forEach((p) => {
    const a = actifs[0];
    if (a && Math.abs(p.balance) > 0) {
      flows.push({ from: p.code, to: a.code, amount: Math.abs(p.balance), kind: 'in' });
    }
  });

  actifs.slice(0, 2).forEach((a) => {
    charges.slice(0, 2).forEach((c) => {
      if (Math.abs(c.balance) > 0) {
        flows.push({ from: a.code, to: c.code, amount: Math.abs(c.balance) * 0.4, kind: 'out' });
      }
    });
  });

  passifs.slice(0, 2).forEach((l) => {
    const a = actifs[1] ?? actifs[0];
    if (a && Math.abs(l.balance) > 0) {
      flows.push({ from: l.code, to: a.code, amount: Math.abs(l.balance) * 0.3, kind: 'asset' });
    }
  });

  return flows;
}

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
      next[el.dataset.code!] = {
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

interface PmColumnsBProps {
  accounts: V2Account[];
  showFlows: boolean;
  focusCode: string | null;
  setFocusCode: (code: string | null) => void;
  kpiVisibility: { tresorerie: boolean; resultat: boolean; tva: boolean; anomalies: boolean };
  onOpenDrawer?: (code: string) => void;
}

const COLUMN_ORDER: AccountClass[] = ['P', 'A', 'L', 'C'];

const COLUMN_META: Record<AccountClass, { label: string; sub: string; color: string }> = {
  P: { label: 'Produits',   sub: 'Classe 3',    color: 'var(--pos)' },
  A: { label: 'Actifs',     sub: 'Classe 1',    color: 'var(--ast)' },
  L: { label: 'Passifs',    sub: 'Classe 2',    color: 'var(--tax)' },
  C: { label: 'Charges',    sub: 'Classes 4–9', color: 'var(--neg)' },
};

export function PmColumnsB({
  accounts,
  showFlows,
  focusCode,
  setFocusCode,
  kpiVisibility: _kpiVisibility,
  onOpenDrawer,
}: PmColumnsBProps) {
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

  const maxFlow = useMemo(() => Math.max(...flows.map((f) => f.amount), 1), [flows]);

  // Rubans Sankey
  const ribbons = useMemo(() => {
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
        const thickness = Math.max(2, (f.amount / maxFlow) * 14);
        const cp = Math.max(50, Math.abs(bx - ax) * 0.5);
        const t = thickness / 2;
        const topD = `M ${ax} ${ay - t} C ${ax + cp * dir} ${ay - t}, ${bx - cp * dir} ${by - t}, ${bx} ${by - t}`;
        const botD = `L ${bx} ${by + t} C ${bx - cp * dir} ${by + t}, ${ax + cp * dir} ${ay + t}, ${ax} ${ay + t} Z`;
        const isActive = !!active && (f.from === active || f.to === active);
        return { i, f, d: topD + ' ' + botD, mx: (ax + bx) / 2, my: (ay + by) / 2, thickness, isActive };
      })
      .filter(Boolean) as Array<{
        i: number; f: Flow; d: string; mx: number; my: number; thickness: number; isActive: boolean;
      }>;
  }, [flows, rects, active, maxFlow]);

  const biggestFlow = flows.length > 0
    ? flows.reduce((best, f) => f.amount > best.amount ? f : best, flows[0])
    : null;

  const totalCharges = accounts.filter((a) => a.class === 'C').reduce((s, a) => s + Math.abs(a.balance), 0);

  return (
    <div className="v2-canvas" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '24px', minHeight: '100%' }}>
          <div
            ref={gridRef}
            style={{
              maxWidth: 1400,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 36,
              position: 'relative',
            }}
          >
            {/* Rails verticaux entre colonnes */}
            {[1, 2, 3].map((i) => (
              <div
                key={'rail' + i}
                style={{
                  position: 'absolute',
                  left: `calc(${(i / 4) * 100}% - 1px)`,
                  top: 40,
                  bottom: 0,
                  width: 0,
                  borderLeft: '1px dashed var(--line-2)',
                  opacity: 0.5,
                  zIndex: 0,
                }}
              />
            ))}

            {COLUMN_ORDER.map((k) => {
              const meta = COLUMN_META[k];
              const list = byClass[k];
              const total = list.reduce((s, a) => s + a.balance, 0);

              return (
                <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10, position: 'relative', zIndex: 2 }}>
                  {/* Header colonne */}
                  <div
                    style={{
                      padding: '6px 10px',
                      marginBottom: 4,
                      background: 'var(--v2-surface)',
                      border: '1px solid var(--line-1)',
                      borderRadius: 10,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: meta.color, flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '-0.01em', color: 'var(--ink-1)' }}>
                          {meta.label}
                        </span>
                      </div>
                      <span style={{ fontFamily: 'var(--mono-font)', fontSize: 11, fontVariantNumeric: 'tabular-nums', color: 'var(--ink-2)', fontWeight: 500 }}>
                        {fmtMoney(total)}
                      </span>
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>
                      {meta.sub} · {list.length} comptes
                    </div>
                  </div>

                  {list.map((acct) => (
                    <AccountTile
                      key={acct.code}
                      acct={acct}
                      focused={focusCode === acct.code}
                      dimmed={connected ? !connected.has(acct.code) : false}
                      onHover={setHover}
                      onLeave={() => setHover(null)}
                      onClick={(c) => {
                        if (onOpenDrawer) onOpenDrawer(c);
                        else setFocusCode(focusCode === c ? null : c);
                      }}
                      dense
                    />
                  ))}
                </div>
              );
            })}

            {/* Rubans SVG Sankey */}
            <svg
              width={size.w}
              height={size.h}
              style={{ position: 'absolute', left: 0, top: 0, zIndex: 1, pointerEvents: 'none', overflow: 'visible' }}
            >
              <defs>
                {Object.entries(KIND_COLOR).map(([k, c]) => (
                  <linearGradient key={k} id={`grad-b-${k}`} x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%"   stopColor={c} stopOpacity="0.5" />
                    <stop offset="100%" stopColor={c} stopOpacity="0.15" />
                  </linearGradient>
                ))}
              </defs>
              {ribbons.map((r) => {
                const visible = showFlows || r.isActive;
                if (!visible) return null;
                const c = KIND_COLOR[r.f.kind];
                const opacity = active ? (r.isActive ? 0.9 : 0.04) : 0.5;
                return (
                  <path
                    key={r.i}
                    d={r.d}
                    fill={`url(#grad-b-${r.f.kind})`}
                    stroke={c}
                    strokeWidth={0.8}
                    strokeOpacity={0.5}
                    style={{ opacity, transition: 'opacity 200ms' }}
                  />
                );
              })}
            </svg>

            {/* Labels rubans */}
            {ribbons.map((r) => {
              const visible = showFlows || r.isActive;
              if (!visible || r.thickness < 4) return null;
              const strong = r.isActive;
              return (
                <div
                  key={'lblB' + r.i}
                  style={{
                    position: 'absolute',
                    left: r.mx,
                    top: r.my,
                    transform: 'translate(-50%, -50%)',
                    zIndex: 3,
                    background: strong ? 'var(--ink-1)' : 'var(--v2-surface)',
                    color: strong ? '#FAFAF7' : 'var(--ink-2)',
                    padding: '2px 7px',
                    borderRadius: 4,
                    fontFamily: 'var(--mono-font)',
                    fontSize: 10,
                    fontWeight: 600,
                    fontVariantNumeric: 'tabular-nums',
                    whiteSpace: 'nowrap',
                    border: strong ? 'none' : '1px solid var(--line-1)',
                    pointerEvents: 'none',
                    opacity: active && !r.isActive ? 0 : 1,
                    transition: 'opacity 200ms',
                  }}
                >
                  {fmtCompact(r.f.amount)}
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
                  {biggestFlow && (
                    <>
                      Plus grand flux :{' '}
                      <strong>
                        {biggestFlow.from} → {biggestFlow.to}
                      </strong>{' '}
                      ({fmtCompact(biggestFlow.amount)} CHF).{' '}
                    </>
                  )}
                  Les charges totalisent{' '}
                  <strong>{fmtCompact(totalCharges)} CHF</strong> ce mois.
                </>
              }
              cta="Analyser"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
