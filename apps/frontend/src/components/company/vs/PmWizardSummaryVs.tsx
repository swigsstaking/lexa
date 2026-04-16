import type { CompanyDraft } from '@/api/lexa';
import { Building2, Info } from 'lucide-react';

interface Props {
  draft: CompanyDraft;
}

function chf(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function Row({ label, value, bold, mono }: { label: string; value: string; bold?: boolean; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-xs ${bold ? 'text-ink font-semibold' : 'text-muted'}`}>{label}</span>
      <span className={`text-xs ${mono ? 'mono-num' : ''} ${bold ? 'text-ink font-semibold' : 'text-ink'}`}>
        {value}
      </span>
    </div>
  );
}

export function PmWizardSummaryVs({ draft }: Props) {
  const { state } = draft;
  const s1 = state.step1 ?? {};
  const s2 = state.step2 ?? {};
  const s3 = state.step3 ?? {};
  const s4 = state.step4 ?? {};

  const corrections =
    (s3.chargesNonAdmises ?? 0) +
    (s3.provisionsExcessives ?? 0) +
    (s3.amortissementsExcessifs ?? 0) +
    (s3.reservesLatentes ?? 0) +
    (s3.autresCorrections ?? 0);

  const benefitImposable = Math.max(0, (s2.benefitAccounting ?? 0) + corrections);

  const capital = s4.capitalTotal ??
    ((s4.capitalSocial ?? 0) + (s4.reservesLegales ?? 0) + (s4.reservesLibres ?? 0) + (s4.reportBenefice ?? 0));

  const ifd = Math.round(benefitImposable * 0.085 * 100) / 100;
  const icc = Math.round(benefitImposable * 0.085 * 100) / 100;
  const capitalTax = Math.round(capital * 0.0015 * 100) / 100;
  const total = ifd + icc + capitalTax;
  const effectiveRate = benefitImposable > 0 ? total / benefitImposable : 0;

  return (
    <div className="sticky top-6 space-y-4">
      <div className="card-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <Building2 className="w-4 h-4 text-accent" />
          <span className="text-2xs uppercase tracking-wider text-muted">
            Aperçu en direct — PM VS
          </span>
        </div>

        <div className="space-y-3 text-sm">
          <Row label="Société" value={s1.legalName ?? '—'} />
          <Row label="Forme" value={s1.legalForm?.toUpperCase() ?? '—'} />
          <Row label="Siège" value={s1.siegeCommune ?? '—'} />
          <Row label="IDE" value={s1.ideNumber ?? '—'} mono />

          <div className="pt-3 border-t border-border">
            <div className="text-2xs uppercase tracking-wider text-muted mb-2">Résultats financiers</div>
            <Row label="Bénéfice comptable" value={s2.benefitAccounting ? `${chf(s2.benefitAccounting)} CHF` : '—'} mono />
            <Row label="+ Corrections" value={corrections > 0 ? `+${chf(corrections)} CHF` : '—'} mono />
            <Row label="Bénéfice imposable" value={benefitImposable > 0 ? `${chf(benefitImposable)} CHF` : '—'} mono bold />
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-2xs uppercase tracking-wider text-muted mb-2">Capital</div>
            <Row label="Capital imposable" value={capital > 0 ? `${chf(capital)} CHF` : '—'} mono />
          </div>

          {total > 0 && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 -mx-4 -mb-4">
              <div className="text-[10px] uppercase tracking-wide text-amber-400 mb-1">
                Estimation impôt PM VS {draft.year}
              </div>
              <div className="text-xl font-bold text-amber-300">
                {chf(total)} CHF
              </div>
              <div className="text-[10px] text-amber-200/70 mt-1">
                ICC {chf(icc)} · IFD {chf(ifd)} · Taux {(effectiveRate * 100).toFixed(1)}%
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="card p-4 text-2xs text-muted flex gap-2">
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <p>
          Les totaux sont calculés en direct. Le PDF officiel est généré à l'étape 6
          avec le disclaimer réglementaire SCC VS. LIFD art. 58, 68, 75.
        </p>
      </div>
    </div>
  );
}
