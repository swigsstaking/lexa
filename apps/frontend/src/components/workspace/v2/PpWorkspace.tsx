import { useState } from 'react';
import { LexaInsight } from './LexaInsight';
import { fmtMoney } from './fmtMoney';

// ——— Mock data PP (personne physique salariée) ———
// Utilisé tant que la structure PP n'existe pas côté Lexa DB.

type Tone = 'pos' | 'neg' | 'tax' | 'asset';

interface PpItem {
  code: string;
  name: string;
  amount: number;
  count: number;
  tone: Tone;
}

interface PpBucket {
  k: string;
  items: PpItem[];
}

const PP_DATA = {
  name: 'Personne physique',
  sub: 'Salariée · Profil type',
  iconLetter: 'P',
  buckets: [
    {
      k: 'Salaire & revenus',
      items: [
        { code: 'S01', name: 'Salaire net annuel',   amount: 102000, count: 12, tone: 'pos' as Tone },
        { code: 'S02', name: '13ème salaire',         amount:   8500, count:  1, tone: 'pos' as Tone },
        { code: 'S03', name: 'Bonus de performance', amount:   6000, count:  1, tone: 'pos' as Tone },
      ],
    },
    {
      k: 'Vie privée',
      items: [
        { code: 'V01', name: 'Logement',              amount:  21600, count: 12, tone: 'neg' as Tone },
        { code: 'V02', name: 'Assurance maladie',     amount:   5280, count: 12, tone: 'neg' as Tone },
        { code: 'V03', name: 'Alimentation',          amount:  12400, count: 52, tone: 'neg' as Tone },
        { code: 'V04', name: 'Transports',            amount:   4320, count: 36, tone: 'neg' as Tone },
        { code: 'V05', name: 'Loisirs & voyages',     amount:   5000, count: 14, tone: 'neg' as Tone },
      ],
    },
    {
      k: 'Épargne & prévoyance',
      items: [
        { code: 'E01', name: '3e pilier A',           amount:   7056, count:  1, tone: 'asset' as Tone },
        { code: 'E02', name: 'Épargne libre',         amount:   8400, count: 12, tone: 'asset' as Tone },
        { code: 'E03', name: 'LPP — rachat',          amount:   3000, count:  1, tone: 'asset' as Tone },
      ],
    },
    {
      k: 'Obligations fiscales',
      items: [
        { code: 'O01', name: 'Impôts fédéraux',      amount:   5400, count:  1, tone: 'tax' as Tone },
        { code: 'O02', name: 'Impôts cantonaux',      amount:  11200, count:  2, tone: 'tax' as Tone },
        { code: 'O03', name: 'Impôts communaux',      amount:   2600, count:  2, tone: 'tax' as Tone },
      ],
    },
  ] as PpBucket[],
  obligations: [
    { date: '15 mai',  title: 'Déclaration fiscale',       status: 'urgent',  days: 25 },
    { date: '30 juin', title: '3e pilier — versement',     status: 'planned', days: 71 },
    { date: '30 nov',  title: 'Rachat LPP avant clôture',  status: 'planned', days: 224 },
  ],
};

const TONE_COLOR: Record<Tone, string> = {
  pos:   'oklch(0.42 0.14 155)',
  neg:   'var(--neg)',
  tax:   'var(--tax)',
  asset: 'var(--ast)',
};

export function PpWorkspace() {
  const [selected, setSelected] = useState<{ b: number; i: number } | null>(null);
  const d = PP_DATA;

  const totalSal = d.buckets[0].items.reduce((s, x) => s + x.amount, 0);
  const totalVP  = d.buckets[1].items.reduce((s, x) => s + x.amount, 0);
  const totalEp  = d.buckets[2].items.reduce((s, x) => s + x.amount, 0);
  const totalObl = d.buckets[3].items.reduce((s, x) => s + x.amount, 0);
  const dispo    = totalSal - totalVP - totalEp - totalObl;

  return (
    <div className="v2-canvas" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: '24px', minHeight: '100%' }}>

          {/* Profile hero */}
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto 16px',
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 14,
              padding: 20,
              display: 'grid',
              gridTemplateColumns: 'auto 1fr auto auto auto auto',
              gap: 24,
              alignItems: 'center',
            }}
          >
            {/* Avatar */}
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, var(--lexa) 0%, var(--lexa-deep) 100%)',
                color: 'var(--v2-bg)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: 22,
                letterSpacing: '-0.02em',
              }}
            >
              {d.iconLetter}
            </div>

            {/* Identité */}
            <div>
              <div style={{ fontWeight: 600, fontSize: 18, letterSpacing: '-0.02em', color: 'rgb(var(--ink))' }}>
                {d.name}
              </div>
              <div style={{ color: 'rgb(var(--muted))', fontSize: 12 }}>{d.sub}</div>
            </div>

            {/* KPIs inline */}
            {[
              { k: 'Salaire',    v: totalSal, color: TONE_COLOR.pos },
              { k: 'Vie privée', v: totalVP,  color: TONE_COLOR.neg },
              { k: 'Épargne',    v: totalEp,  color: TONE_COLOR.asset },
              { k: 'Impôts',     v: totalObl, color: TONE_COLOR.tax },
              { k: 'Disponible', v: dispo,    color: 'rgb(var(--ink))', strong: true },
            ].map((k, i) => (
              <div key={i} style={{ borderLeft: '1px solid rgb(var(--border))', paddingLeft: 16 }}>
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--subtle))', fontWeight: 600 }}>
                  {k.k}
                </div>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: (k as { strong?: boolean }).strong ? 20 : 16,
                    fontWeight: 500,
                    color: k.color,
                    fontVariantNumeric: 'tabular-nums',
                    marginTop: 2,
                  }}
                >
                  {fmtMoney(k.v)}{' '}
                  <span style={{ fontSize: 10, color: 'rgb(var(--subtle))', fontWeight: 400 }}>CHF</span>
                </div>
              </div>
            ))}
          </div>

          {/* Grille principale */}
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              display: 'grid',
              gridTemplateColumns: '1fr 360px',
              gap: 16,
            }}
          >
            {/* Swimlanes (buckets) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {d.buckets.map((b, bi) => {
                const sub = b.items.reduce((s, x) => s + x.amount, 0);
                const max = Math.max(...b.items.map((x) => x.amount));
                return (
                  <div
                    key={bi}
                    style={{
                      background: 'rgb(var(--surface))',
                      border: '1px solid rgb(var(--border))',
                      borderRadius: 12,
                      overflow: 'hidden',
                    }}
                  >
                    {/* Header swimlane */}
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'baseline',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        borderBottom: '1px solid rgb(var(--border))',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontWeight: 600, letterSpacing: '-0.01em', color: 'rgb(var(--ink))' }}>
                          {b.k}
                        </span>
                        <span style={{ fontSize: 11, color: 'rgb(var(--subtle))', fontFamily: '"JetBrains Mono", monospace' }}>
                          {b.items.length} postes
                        </span>
                      </div>
                      <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontVariantNumeric: 'tabular-nums', fontWeight: 500, color: 'rgb(var(--ink))' }}>
                        {fmtMoney(sub)}{' '}
                        <span style={{ fontSize: 10, color: 'rgb(var(--subtle))', fontWeight: 400 }}>CHF</span>
                      </span>
                    </div>

                    {/* Items */}
                    <div>
                      {b.items.map((it, ii) => {
                        const pct = (it.amount / max) * 100;
                        const isSel = selected?.b === bi && selected?.i === ii;
                        return (
                          <div
                            key={ii}
                            onClick={() => setSelected(isSel ? null : { b: bi, i: ii })}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: '80px 180px 1fr 120px 60px',
                              gap: 14,
                              alignItems: 'center',
                              padding: '10px 16px',
                              borderBottom: ii === b.items.length - 1 ? 'none' : '1px solid rgb(var(--border))',
                              background: isSel ? 'rgb(var(--elevated))' : 'transparent',
                              cursor: 'pointer',
                              position: 'relative',
                            }}
                          >
                            {isSel && (
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
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgb(var(--subtle))' }}>
                              {it.code}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(var(--ink))' }}>
                              {it.name}
                            </span>
                            {/* Barre de proportion */}
                            <div
                              style={{
                                height: 6,
                                background: 'rgb(var(--elevated))',
                                borderRadius: 3,
                                position: 'relative',
                                overflow: 'hidden',
                              }}
                            >
                              <div
                                style={{
                                  position: 'absolute',
                                  inset: 0,
                                  width: `${pct}%`,
                                  background: TONE_COLOR[it.tone],
                                  opacity: 0.7,
                                  borderRadius: 3,
                                }}
                              />
                            </div>
                            <span
                              style={{
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: 13,
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 500,
                                textAlign: 'right',
                                color: TONE_COLOR[it.tone],
                              }}
                            >
                              {fmtMoney(it.amount)}
                            </span>
                            <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgb(var(--subtle))', textAlign: 'right' }}>
                              {it.count}×
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Colonne droite : échéances + insight */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, position: 'sticky', top: 24 }}>
              {/* Échéances — dark card (style prototype chrome-bg) */}
              <div
                style={{
                  background: 'var(--chrome-bg)',
                  color: 'var(--chrome-ink-1)',
                  borderRadius: 12,
                  padding: '14px 16px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 3, background: 'var(--lexa)' }} />
                  <span style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', fontWeight: 600, color: 'var(--chrome-ink-2)' }}>
                    Échéances
                  </span>
                </div>
                {d.obligations.map((o, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i === d.obligations.length - 1 ? 'none' : '1px solid var(--chrome-line)',
                    }}
                  >
                    <div
                      style={{
                        padding: '4px 6px',
                        background: 'var(--chrome-bg-2)',
                        borderRadius: 6,
                        textAlign: 'center',
                      }}
                    >
                      <div style={{ fontSize: 9, color: 'var(--chrome-ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                        {o.date.split(' ')[1]}
                      </div>
                      <div style={{ fontFamily: 'var(--mono-font)', fontSize: 13, fontWeight: 600, color: 'var(--chrome-ink-1)' }}>
                        {o.date.split(' ')[0]}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--chrome-ink-1)' }}>{o.title}</div>
                      <div style={{ fontSize: 10, color: 'var(--chrome-ink-3)', marginTop: 2 }}>dans {o.days} jours</div>
                    </div>
                    {o.status === 'urgent' && (
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          background: 'var(--lexa)',
                          boxShadow: '0 0 0 4px oklch(0.74 0.17 55 / 0.25)',
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>

              {/* LexaInsight PP */}
              <LexaInsight
                title="Lexa vous conseille"
                body={
                  <>
                    Vous pouvez encore verser{' '}
                    <strong>3'000 CHF</strong> sur votre 3e pilier — économie fiscale estimée :{' '}
                    <strong style={{ color: 'rgb(var(--success))' }}>~790 CHF</strong>.
                  </>
                }
                cta="Simuler"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
