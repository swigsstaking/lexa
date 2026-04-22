import type { CompanyDraftState } from '@/api/lexa';

interface Props {
  state: CompanyDraftState;
  year: number;
  canton?: string;
}

function chf(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function computeEstimate(state: CompanyDraftState) {
  const s2 = state.step2 ?? {};
  const s3 = state.step3 ?? {};
  const s4 = state.step4 ?? {};

  const benefitAccounting = s2.benefitAccounting ?? 0;
  const corrections =
    (s3.chargesNonAdmises ?? 0) +
    (s3.provisionsExcessives ?? 0) +
    (s3.amortissementsExcessifs ?? 0) +
    (s3.reservesLatentes ?? 0) +
    (s3.autresCorrections ?? 0);

  const benefitImposable = Math.max(0, benefitAccounting + corrections);

  const capital = s4.capitalTotal ??
    ((s4.capitalSocial ?? 0) + (s4.reservesLegales ?? 0) + (s4.reservesLibres ?? 0) + (s4.reportBenefice ?? 0));

  const ifd = Math.round(benefitImposable * 0.085 * 100) / 100;
  const icc = Math.round(benefitImposable * 0.085 * 100) / 100; // VS ~8.5%
  const capitalTax = Math.round(capital * 0.0015 * 100) / 100;
  const total = ifd + icc + capitalTax;
  const effectiveRate = benefitImposable > 0 ? total / benefitImposable : 0;

  return { benefitAccounting, corrections, benefitImposable, capital, ifd, icc, capitalTax, total, effectiveRate };
}

export function Step5PreviewVs({ state, year, canton = 'VS' }: Props) {
  const est = computeEstimate(state);
  const s1 = state.step1 ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Aperçu — Estimation fiscale {canton} {year}
        </h2>
        <p className="text-sm text-muted">
          Calcul indicatif basé sur vos saisies. Vérifiez avec votre fiduciaire.
        </p>
      </div>

      {/* Récapitulatif société */}
      <div className="card-elevated p-4 space-y-2">
        <div className="text-2xs uppercase tracking-wider text-muted mb-2">Société</div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Raison sociale</span>
          <span className="font-medium">{s1.legalName ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Forme juridique</span>
          <span>{s1.legalForm?.toUpperCase() ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Siège</span>
          <span>{s1.siegeCommune ?? '—'}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">IDE</span>
          <span className="mono-num">{s1.ideNumber ?? '—'}</span>
        </div>
      </div>

      {/* Résultat fiscal */}
      <div className="card-elevated p-4 space-y-2">
        <div className="text-2xs uppercase tracking-wider text-muted mb-2">Résultat fiscal</div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Bénéfice comptable</span>
          <span className="mono-num">{chf(est.benefitAccounting)} CHF</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">+ Corrections fiscales</span>
          <span className="mono-num text-warning">{est.corrections > 0 ? '+' : ''}{chf(est.corrections)} CHF</span>
        </div>
        <div className="border-t border-border pt-2 flex justify-between text-sm font-semibold">
          <span>Bénéfice net imposable</span>
          <span className="mono-num">{chf(est.benefitImposable)} CHF</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted">Capital imposable</span>
          <span className="mono-num">{chf(est.capital)} CHF</span>
        </div>
      </div>

      {/* Estimation impôts */}
      <div className="rounded-lg bg-warning/10 border border-warning/30 p-4">
        <div className="text-[10px] uppercase tracking-wide text-warning mb-1">
          Estimation impôt PM {canton} {year}
        </div>
        <div className="text-xl font-bold text-warning mb-3">
          {chf(est.total)} CHF
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-xs text-warning">
            <span>IFD 8.5% (art. 68 LIFD)</span>
            <span className="mono-num">{chf(est.ifd)} CHF</span>
          </div>
          <div className="flex justify-between text-xs text-warning">
            <span>ICC {canton} ~8.5% (LF {canton} PM)</span>
            <span className="mono-num">{chf(est.icc)} CHF</span>
          </div>
          <div className="flex justify-between text-xs text-warning">
            <span>Impôt capital 0.15%</span>
            <span className="mono-num">{chf(est.capitalTax)} CHF</span>
          </div>
          <div className="border-t border-warning/30 pt-1 flex justify-between text-xs text-warning font-semibold">
            <span>Taux effectif estimé</span>
            <span>{(est.effectiveRate * 100).toFixed(1)}%</span>
          </div>
        </div>
        <p className="text-[9px] text-muted mt-2 leading-tight">
          Estimation indicative basée sur barèmes 2026 simplifiés (V1). Barèmes officiels ICC {canton} à vérifier avec les autorités fiscales cantonales.
        </p>
      </div>
    </div>
  );
}
