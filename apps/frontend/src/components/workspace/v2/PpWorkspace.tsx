import { useState, useCallback } from 'react';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { LexaInsight } from './LexaInsight';
import { fmtMoney } from './fmtMoney';
import { createPortal } from 'react-dom';
import { lexa } from '@/api/lexa';
import type { PpTone } from '@/api/lexa';
import { useActiveCompany } from '@/stores/companiesStore';
import { useAuthStore } from '@/stores/authStore';
import { PpImportModal } from './PpImportModal';
import { PpCryptoSwimlane } from './PpCryptoSwimlane';
import { PpCryptoWalletForm } from './PpCryptoWalletForm';

type Tone = PpTone;

type PpItem = {
  code: string;
  name: string;
  amount: number;
  count: number;
  tone: Tone;
};

type PpBucket = {
  k: string;
  items: PpItem[];
};

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

// ——— Mock transactions par poste ———
const MOCK_TX: Record<string, Array<{ date: string; desc: string; amount: number }>> = {
  S01: [
    { date: '31.01.2026', desc: 'Salaire janvier', amount: 8500 },
    { date: '28.02.2026', desc: 'Salaire février', amount: 8500 },
    { date: '31.03.2026', desc: 'Salaire mars', amount: 8500 },
  ],
  S02: [
    { date: '31.12.2025', desc: '13ème salaire 2025', amount: 8500 },
  ],
  S03: [
    { date: '31.03.2026', desc: 'Bonus performance Q1', amount: 6000 },
  ],
  V01: [
    { date: '01.01.2026', desc: 'Loyer janvier', amount: 1800 },
    { date: '01.02.2026', desc: 'Loyer février', amount: 1800 },
    { date: '01.03.2026', desc: 'Loyer mars', amount: 1800 },
  ],
  V02: [
    { date: '01.01.2026', desc: 'Prime Assurance maladie jan', amount: 440 },
    { date: '01.02.2026', desc: 'Prime Assurance maladie fév', amount: 440 },
  ],
  V03: [
    { date: '15.01.2026', desc: 'Courses alimentaires sem. 1-4', amount: 960 },
    { date: '15.02.2026', desc: 'Courses alimentaires sem. 5-8', amount: 980 },
  ],
  V04: [
    { date: '01.01.2026', desc: 'Abonnement CFF annuel', amount: 3860 },
    { date: '15.02.2026', desc: 'Essence voiture', amount: 120 },
  ],
  V05: [
    { date: '10.02.2026', desc: 'Abonnement Netflix, Spotify', amount: 42 },
    { date: '15.03.2026', desc: 'Sortie restaurant', amount: 180 },
  ],
  E01: [
    { date: '01.01.2026', desc: 'Versement 3e pilier A (max 2026)', amount: 7056 },
  ],
  E02: [
    { date: '31.01.2026', desc: 'Virement épargne jan', amount: 700 },
    { date: '28.02.2026', desc: 'Virement épargne fév', amount: 700 },
  ],
  E03: [
    { date: '01.01.2026', desc: 'Rachat LPP volontaire', amount: 3000 },
  ],
  O01: [
    { date: '15.03.2026', desc: 'Acompte impôts fédéraux', amount: 5400 },
  ],
  O02: [
    { date: '15.03.2026', desc: 'Acompte impôts cantonaux tranche 1', amount: 5600 },
    { date: '15.06.2026', desc: 'Acompte impôts cantonaux tranche 2', amount: 5600 },
  ],
  O03: [
    { date: '15.03.2026', desc: 'Acompte impôts communaux tranche 1', amount: 1300 },
    { date: '15.06.2026', desc: 'Acompte impôts communaux tranche 2', amount: 1300 },
  ],
};

// ——— PpDetailDrawer ———
interface PpDetailDrawerProps {
  item: PpItem | null;
  onClose: () => void;
  hasRealData?: boolean;
}

function PpDetailDrawer({ item, onClose, hasRealData = false }: PpDetailDrawerProps) {
  if (!item) return null;
  const txs = MOCK_TX[item.code] ?? [];
  const fmtChf = (n: number) =>
    new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  return createPortal(
    <>
      {/* Overlay click-outside */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
        }}
      />
      {/* Drawer */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: 'min(400px, 92vw)',
          background: 'rgb(var(--surface, 255 255 255))',
          borderLeft: '1px solid rgb(var(--border, 229 229 222))',
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '-8px 0 40px rgba(0,0,0,0.12)',
          animation: 'ppDrawerIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '16px 20px',
            borderBottom: '1px solid rgb(var(--border, 229 229 222))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexShrink: 0,
          }}
        >
          <div>
            <div style={{ fontSize: 10, fontFamily: '"JetBrains Mono", monospace', color: 'rgb(var(--muted, 107 107 102))', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {item.code}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: 'rgb(var(--ink, 10 10 10))', marginTop: 2 }}>
              {item.name}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid rgb(var(--border, 229 229 222))',
              background: 'transparent',
              cursor: 'pointer',
              display: 'grid',
              placeItems: 'center',
              fontSize: 14,
              color: 'rgb(var(--muted, 107 107 102))',
            }}
            title="Fermer (Échap)"
          >
            ✕
          </button>
        </div>

        {/* Stats */}
        <div
          style={{
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 10,
            borderBottom: '1px solid rgb(var(--border, 229 229 222))',
            flexShrink: 0,
          }}
        >
          <div style={{ background: 'rgb(var(--elevated, 243 243 238))', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted, 107 107 102))', fontWeight: 600 }}>
              Montant total
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, fontWeight: 500, color: TONE_COLOR[item.tone], marginTop: 4 }}>
              {fmtMoney(item.amount)}
              <span style={{ fontSize: 10, color: 'rgb(var(--subtle, 154 154 147))', fontWeight: 400, marginLeft: 4 }}>CHF</span>
            </div>
          </div>
          <div style={{ background: 'rgb(var(--elevated, 243 243 238))', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted, 107 107 102))', fontWeight: 600 }}>
              Mouvements
            </div>
            <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 18, fontWeight: 500, color: 'rgb(var(--ink, 10 10 10))', marginTop: 4 }}>
              {item.count}×
            </div>
          </div>
        </div>

        {/* Liste transactions */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
          <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'rgb(var(--muted, 107 107 102))', fontWeight: 600, marginBottom: 10 }}>
            {txs.length > 0 ? `${txs.length} transaction(s)` : 'Aucune transaction'}
          </div>
          {txs.length === 0 && (
            <div style={{ textAlign: 'center', color: 'rgb(var(--muted, 107 107 102))', fontSize: 13, padding: '32px 0' }}>
              Aucune transaction disponible
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {txs.map((tx, i) => (
              <div
                key={i}
                style={{
                  background: 'rgb(var(--elevated, 243 243 238))',
                  border: '1px solid rgb(var(--border, 229 229 222))',
                  borderRadius: 8,
                  padding: '10px 12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontFamily: '"JetBrains Mono", monospace', color: 'rgb(var(--subtle, 154 154 147))' }}>
                    {tx.date}
                  </div>
                  <div style={{ fontSize: 12, fontWeight: 500, color: 'rgb(var(--ink, 10 10 10))', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {tx.desc}
                  </div>
                </div>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 13, fontWeight: 500, color: TONE_COLOR[item.tone], flexShrink: 0 }}>
                  {fmtChf(tx.amount)}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer — masqué si données réelles chargées */}
        {!hasRealData && (
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid rgb(var(--border, 229 229 222))',
              background: 'rgb(var(--elevated, 243 243 238))',
              fontSize: 11,
              color: 'rgb(var(--muted, 107 107 102))',
              flexShrink: 0,
            }}
          >
            Données de démonstration · les transactions réelles PP seront disponibles en V1.2
          </div>
        )}
      </div>
      <style>{`
        @keyframes ppDrawerIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: none; opacity: 1; }
        }
      `}</style>
    </>,
    document.body,
  );
}

export function PpWorkspace() {
  const [selected, setSelected] = useState<{ b: number; i: number } | null>(null);
  const [drawerItem, setDrawerItem] = useState<PpItem | null>(null);
  const [prefilling, setPrefilling] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [cryptoFormOpen, setCryptoFormOpen] = useState(false);
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  // BUG-6 RGPD fix : lier l'affichage au tenant actif pour éviter cache stale inter-tenants
  const activeCompany = useActiveCompany();
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const year = new Date().getFullYear();

  const { data: apiData, isLoading } = useQuery({
    queryKey: ['pp-summary', activeTenantId, year],
    queryFn: () => lexa.getPpSummary(year),
    staleTime: 5 * 60 * 1000,
  });

  // Merge API ↔ mock par clé `k` : préserve les 4 buckets attendus, remplace ceux dispos en API.
  // L'API peut ne renvoyer qu'un sous-ensemble (ex: seul "Obligations fiscales" est calculé en V1.2).
  const apiBuckets = apiData?.buckets ?? [];
  const hasRealData = apiBuckets.length > 0;
  const activeBuckets: PpBucket[] = PP_DATA.buckets.map((mockBucket) => {
    const apiBucket = apiBuckets.find((b) => b.k === mockBucket.k);
    return apiBucket && Array.isArray(apiBucket.items) ? apiBucket : mockBucket;
  });
  const d = { ...PP_DATA, buckets: activeBuckets };

  // Préremplissage du draft taxpayer depuis les données disponibles avant navigation
  const handleNavigateTaxpayer = useCallback(async () => {
    setPrefilling(true);
    try {
      // 1. Fetch le profil utilisateur pour récupérer nom/prénom
      const me = await lexa.me();

      // 2. Préparer les champs à pré-remplir
      type PrefillField = { field: string; value: unknown };
      const fields: PrefillField[] = [];

      // Identity depuis la company (nom légal) — email comme fallback
      const companyName = me.company?.name ?? '';
      const emailPrefix = me.user.email.split('@')[0] ?? '';
      // Si company name contient un espace → prénom + nom, sinon email
      if (companyName.includes(' ')) {
        const parts = companyName.split(' ');
        fields.push({ field: 'step1.firstName', value: parts[0] });
        fields.push({ field: 'step1.lastName', value: parts.slice(1).join(' ') });
      } else if (emailPrefix.includes('.')) {
        const [first, ...rest] = emailPrefix.split('.');
        if (first) fields.push({ field: 'step1.firstName', value: first.charAt(0).toUpperCase() + first.slice(1) });
        if (rest.length) fields.push({ field: 'step1.lastName', value: rest.join(' ').charAt(0).toUpperCase() + rest.join(' ').slice(1) });
      }

      // Canton depuis la company si PP (on essaie VS comme défaut CH-romand)
      const canton = (me.company?.canton as string) || 'VS';
      fields.push({ field: 'step1.canton', value: canton });

      // Revenu salarial (somme des postes Salaire & revenus du workspace PP)
      const totalSalBrut = d.buckets[0].items.reduce((s, x) => s + x.amount, 0);
      fields.push({ field: 'step2.isSalarie', value: true });
      fields.push({ field: 'step2.salaireBrut', value: totalSalBrut });

      // Déductions — 3e pilier, LPP et primes assurance maladie
      const pilier3a = d.buckets[2].items.find((x) => x.code === 'E01')?.amount ?? 0;
      const rachatsLpp = d.buckets[2].items.find((x) => x.code === 'E03')?.amount ?? 0;
      const primesAssurance = d.buckets[1].items.find((x) => x.code === 'V02')?.amount ?? 0;
      if (pilier3a)  fields.push({ field: 'step4.pilier3a', value: pilier3a });
      if (rachatsLpp) fields.push({ field: 'step4.rachatsLpp', value: rachatsLpp });
      if (primesAssurance) fields.push({ field: 'step4.primesAssurance', value: primesAssurance });

      // 3. Patcher le draft pour chaque champ (en séquence pour éviter les conflits)
      for (const f of fields) {
        try {
          await lexa.patchTaxpayerField({ fiscalYear: year, step: Number(f.field.startsWith('step1') ? 1 : f.field.startsWith('step2') ? 2 : 4), field: f.field, value: f.value });
        } catch {
          // Soft fail : on continue même si un champ échoue
        }
      }
    } catch {
      // Soft fail : la navigation se fait quand même
    } finally {
      setPrefilling(false);
      navigate(`/taxpayer/${year}`);
    }
  }, [d.buckets, year, navigate]);

  const totalSal = d.buckets[0].items.reduce((s, x) => s + x.amount, 0);
  const totalVP  = d.buckets[1].items.reduce((s, x) => s + x.amount, 0);
  const totalEp  = d.buckets[2].items.reduce((s, x) => s + x.amount, 0);
  const totalObl = d.buckets[3].items.reduce((s, x) => s + x.amount, 0);
  const dispo    = totalSal - totalVP - totalEp - totalObl;

  if (isLoading) {
    return (
      <div
        className="v2-canvas"
        style={{
          position: 'relative',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 12,
        }}
      >
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            style={{
              width: '80%',
              maxWidth: 800,
              height: 72,
              borderRadius: 12,
              background: 'rgb(var(--elevated, 243 243 238))',
              animation: 'ppSkeletonPulse 1.4s ease-in-out infinite',
              animationDelay: `${i * 0.15}s`,
            }}
          />
        ))}
        <style>{`
          @keyframes ppSkeletonPulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.4; }
          }
        `}</style>
      </div>
    );
  }

  return (
    <div className="v2-canvas" style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ padding: isMobile ? '12px' : '24px', minHeight: '100%' }}>

          {/* Profile hero — grid sur desktop (DISPONIBLE wrap auto), flex column sur mobile */}
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto 16px',
              background: 'rgb(var(--surface))',
              border: '1px solid rgb(var(--border))',
              borderRadius: 14,
              padding: isMobile ? 16 : 20,
              display: isMobile ? 'flex' : 'grid',
              flexDirection: isMobile ? 'column' : undefined,
              gridTemplateColumns: isMobile ? undefined : 'auto 1fr auto auto auto auto',
              gap: isMobile ? 12 : 24,
              alignItems: isMobile ? 'flex-start' : 'center',
            }}
          >
            {/* Avatar — lettre du nom tenant actif (BUG-6 RGPD) */}
            <div
              style={{
                width: isMobile ? 44 : 56,
                height: isMobile ? 44 : 56,
                borderRadius: 14,
                background: 'linear-gradient(135deg, var(--lexa) 0%, var(--lexa-deep) 100%)',
                color: 'var(--v2-bg)',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 600,
                fontSize: isMobile ? 18 : 22,
                letterSpacing: '-0.02em',
                flexShrink: 0,
              }}
            >
              {(activeCompany?.name ?? d.name).charAt(0).toUpperCase()}
            </div>

            {/* Identité — nom du tenant actif pour éviter affichage inter-tenants (BUG-6 RGPD) */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                <div style={{ fontWeight: 600, fontSize: isMobile ? 15 : 18, letterSpacing: '-0.02em', color: 'rgb(var(--ink))' }}>
                  {activeCompany?.name ?? d.name}
                </div>
                <button
                  onClick={() => setImportOpen(true)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    border: '1px solid rgb(var(--border))',
                    background: 'rgb(var(--elevated))',
                    cursor: 'pointer',
                    fontSize: 11,
                    fontWeight: 600,
                    color: 'rgb(var(--ink))',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    whiteSpace: 'nowrap',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ fontSize: 12 }}>↓</span>
                  Importer données
                </button>
              </div>
              <div style={{ color: 'rgb(var(--muted))', fontSize: 12 }}>
                {d.sub}
                {activeTenantId && (
                  <span style={{ marginLeft: 8, opacity: 0.5, fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}>
                    · {activeTenantId.slice(0, 8)}
                  </span>
                )}
              </div>
            </div>

            {/* KPIs — grid 4 cols sur desktop (Disponible wrap dessous), flex-wrap 2×N sur mobile */}
            {[
              { k: 'Salaire',    v: totalSal, color: TONE_COLOR.pos },
              { k: 'Vie privée', v: totalVP,  color: TONE_COLOR.neg },
              { k: 'Épargne',    v: totalEp,  color: TONE_COLOR.asset },
              { k: 'Impôts',     v: totalObl, color: TONE_COLOR.tax },
              { k: 'Disponible', v: dispo,    color: 'rgb(var(--ink))', strong: true },
            ].map((k, i) => (
              <div
                key={i}
                style={{
                  borderLeft: isMobile ? 'none' : '1px solid rgb(var(--border))',
                  borderTop: isMobile ? '1px solid rgb(var(--border))' : 'none',
                  paddingLeft: isMobile ? 0 : 16,
                  paddingTop: isMobile ? 8 : 0,
                  minWidth: isMobile ? 'calc(50% - 5px)' : undefined,
                  // Disponible (5e KPI) : sur desktop occupe toute la ligne suivante
                  gridColumn: !isMobile && (k as { strong?: boolean }).strong ? '1 / -1' : undefined,
                }}
              >
                <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'rgb(var(--subtle))', fontWeight: 600 }}>
                  {k.k}
                </div>
                <div
                  style={{
                    fontFamily: '"JetBrains Mono", monospace',
                    fontSize: (k as { strong?: boolean }).strong ? (isMobile ? 18 : 28) : (isMobile ? 14 : 16),
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

          {/* Grille principale — grid sur desktop pour donner espace explicite au swimlane (1fr) et à la colonne droite (360px), flex column sur mobile */}
          <div
            style={{
              maxWidth: 1240,
              margin: '0 auto',
              display: isMobile ? 'flex' : 'grid',
              flexDirection: isMobile ? 'column' : undefined,
              gridTemplateColumns: isMobile ? undefined : 'minmax(0, 1fr) 360px',
              gap: 16,
            }}
          >
            {/* Swimlanes (buckets) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
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
                            onClick={() => {
                              setSelected(isSel ? null : { b: bi, i: ii });
                              setDrawerItem(it);
                            }}
                            style={{
                              display: 'grid',
                              gridTemplateColumns: isMobile
                                ? '48px 1fr 80px'
                                : '80px 180px 1fr 120px 60px',
                              gap: isMobile ? 10 : 14,
                              alignItems: 'center',
                              padding: isMobile ? '12px 12px' : '10px 16px',
                              minHeight: 44,
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
                            <span style={{ fontSize: 13, fontWeight: 500, color: 'rgb(var(--ink))', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {it.name}
                            </span>
                            {/* Barre de proportion — masquée sur mobile */}
                            {!isMobile && (
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
                            )}
                            <span
                              style={{
                                fontFamily: '"JetBrains Mono", monospace',
                                fontSize: isMobile ? 12 : 13,
                                fontVariantNumeric: 'tabular-nums',
                                fontWeight: 500,
                                textAlign: 'right',
                                color: TONE_COLOR[it.tone],
                              }}
                            >
                              {fmtMoney(it.amount)}
                            </span>
                            {/* Count — masqué sur mobile */}
                            {!isMobile && (
                              <span style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, color: 'rgb(var(--subtle))', textAlign: 'right' }}>
                                {it.count}×
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Swimlane Crypto — après les 4 buckets existants */}
              <PpCryptoSwimlane year={year} />
            </div>

            {/* Colonne droite : échéances + insight */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
                position: isMobile ? 'static' : 'sticky',
                top: isMobile ? undefined : 24,
                flexShrink: 0,
                width: isMobile ? '100%' : 360,
              }}
            >
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
                    onClick={() => { void handleNavigateTaxpayer(); }}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '54px 1fr auto',
                      gap: 12,
                      alignItems: 'center',
                      padding: '10px 0',
                      borderBottom: i === d.obligations.length - 1 ? 'none' : '1px solid var(--chrome-line)',
                      cursor: 'pointer',
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
                          boxShadow: '0 0 0 4px rgba(212,52,44,0.25)',
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
                cta={prefilling ? 'Chargement…' : 'Simuler'}
                onCta={() => { if (!prefilling) void handleNavigateTaxpayer(); }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Drawer détail PP item */}
      <PpDetailDrawer item={drawerItem} onClose={() => setDrawerItem(null)} hasRealData={hasRealData} />

      {/* Modal import universel PP */}
      {importOpen && (
        <PpImportModal
          onClose={() => setImportOpen(false)}
          onOpenCryptoForm={() => {
            setImportOpen(false);
            setCryptoFormOpen(true);
          }}
        />
      )}

      {/* Formulaire ajout wallet crypto (accessible depuis le modal ou directement) */}
      {cryptoFormOpen && (
        <PpCryptoWalletForm
          onClose={() => setCryptoFormOpen(false)}
          onAdded={() => setCryptoFormOpen(false)}
        />
      )}
    </div>
  );
}
