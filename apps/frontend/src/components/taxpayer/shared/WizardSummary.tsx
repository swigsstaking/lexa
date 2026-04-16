import { useEffect, useRef, useState } from 'react';
import type { TaxpayerDraft } from '@/api/lexa';
import type { CantonConfig } from '@/config/cantons/types';
import { FileText, Info, Loader2 } from 'lucide-react';
import { lexa } from '@/api/lexa';

// BUG-P2-04 fix : remplace calcul local par appel backend preview
// Le frontend n'a plus de barèmes dupliqués — source unique = estimateTaxDue() backend

interface Props {
  draft: TaxpayerDraft;
  canton: CantonConfig;
}

type TaxPreview = {
  icc: number;
  ifd: number;
  total: number;
  effectiveRate: number;
  iccSource: 'official-scale' | 'approximation';
  disclaimer: string;
};

function chf(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function SummaryRow({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className={`text-xs ${bold ? 'text-ink font-semibold' : 'text-muted'}`}>
        {label}
      </span>
      <span
        className={`text-xs ${mono ? 'mono-num' : ''} ${bold ? 'text-ink font-semibold' : 'text-ink'}`}
      >
        {value}
      </span>
    </div>
  );
}

export function WizardSummary({ draft, canton }: Props) {
  const { step1, step2, step3, step4 } = draft.state;

  const totalRevenus =
    (step2.salaireBrut ?? 0) +
    (step2.revenusAccessoires ?? 0) +
    (step2.rentesAvs ?? 0) +
    (step2.rentesLpp ?? 0) +
    (step2.rentes3ePilier ?? 0) +
    (step2.revenusTitres ?? 0) +
    (step2.revenusImmobiliers ?? 0);

  const fortuneBrute =
    (step3.comptesBancaires ?? 0) +
    (step3.titresCotes ?? 0) +
    (step3.titresNonCotes ?? 0) +
    (step3.immeublesValeurFiscale ?? 0) +
    (step3.vehicules ?? 0) +
    (step3.autresBiens ?? 0);
  const fortuneDettes = (step3.immeublesEmprunt ?? 0) + (step3.dettes ?? 0);
  const fortuneNette = fortuneBrute - fortuneDettes;

  const revenuSalaire =
    (step2.salaireBrut ?? 0) + (step2.revenusAccessoires ?? 0);
  const fraisProForfaitCalcule = Math.min(
    Math.max(revenuSalaire * 0.03, canton.fraisProMin),
    canton.fraisProMax,
  );
  const deductionFraisPro =
    step4.fraisProFormat === 'reel'
      ? (step4.fraisProReels ?? 0)
      : fraisProForfaitCalcule;

  const totalDeductions =
    (step4.pilier3a ?? 0) +
    (step4.rachatsLpp ?? 0) +
    (step4.primesAssurance ?? 0) +
    (step4.interetsPassifs ?? 0) +
    deductionFraisPro +
    (step4.fraisMedicaux ?? 0) +
    (step4.dons ?? 0);

  const revenuImposable = totalRevenus - totalDeductions;

  const civilStatus =
    (draft.state.step1.civilStatus === 'married' || draft.state.step1.civilStatus === 'registered_partnership')
      ? 'married'
      : 'single';

  // BUG-P2-04 : appel backend debounced 800ms — source unique (pas de calcul local)
  const [taxPreview, setTaxPreview] = useState<TaxPreview | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (revenuImposable <= 0) {
      setTaxPreview(null);
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setTaxLoading(true);
      lexa
        .previewTaxEstimate({
          canton: canton.code,
          year: draft.fiscalYear ?? 2026,
          revenuImposable,
          civilStatus,
        })
        .then((data) => {
          setTaxPreview(data);
        })
        .catch(() => {
          // Silently fail — estimation is indicative only
          setTaxPreview(null);
        })
        .finally(() => setTaxLoading(false));
    }, 800);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [revenuImposable, civilStatus, canton.code]);

  return (
    <div className="sticky top-6 space-y-4">
      <div className="card-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-2xs uppercase tracking-wider text-muted">
            Aperçu en direct — {canton.code}
          </span>
        </div>

        <div className="space-y-3 text-sm">
          <SummaryRow
            label="Nom"
            value={
              step1.firstName || step1.lastName
                ? `${step1.firstName ?? ''} ${step1.lastName ?? ''}`.trim()
                : '—'
            }
          />
          <SummaryRow
            label={`Commune ${canton.code}`}
            value={step1.commune ?? '—'}
          />
          {canton.hasCoefficientCommunal && (
            <SummaryRow
              label="Coeff. communal"
              value={step1.coefficientCommunal ? String(step1.coefficientCommunal) : '—'}
            />
          )}

          <div className="pt-3 border-t border-border">
            <div className="text-2xs uppercase tracking-wider text-muted mb-2">
              Revenus
            </div>
            <SummaryRow label="Salaire brut" value={chf(step2.salaireBrut)} mono />
            <SummaryRow
              label="Revenus accessoires"
              value={chf(step2.revenusAccessoires)}
              mono
            />
            <SummaryRow
              label="Rentes"
              value={chf(
                (step2.rentesAvs ?? 0) +
                  (step2.rentesLpp ?? 0) +
                  (step2.rentes3ePilier ?? 0) || undefined,
              )}
              mono
            />
            <SummaryRow
              label="Total revenus"
              value={chf(totalRevenus || undefined)}
              mono
              bold
            />
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-2xs uppercase tracking-wider text-muted mb-2">
              Fortune
            </div>
            <SummaryRow
              label="Fortune brute"
              value={chf(fortuneBrute || undefined)}
              mono
            />
            <SummaryRow
              label="Dettes"
              value={chf(fortuneDettes || undefined)}
              mono
            />
            <SummaryRow
              label="Fortune nette"
              value={chf(fortuneNette || undefined)}
              mono
              bold
            />
          </div>

          <div className="pt-3 border-t border-border">
            <div className="text-2xs uppercase tracking-wider text-muted mb-2">
              Déductions
            </div>
            <SummaryRow
              label="Pilier 3a"
              value={chf(step4.pilier3a)}
              mono
            />
            <SummaryRow
              label="Primes assurance"
              value={chf(step4.primesAssurance)}
              mono
            />
            <SummaryRow
              label={`Frais pro (${canton.code})`}
              value={chf(deductionFraisPro || undefined)}
              mono
            />
            <SummaryRow
              label="Total déductions"
              value={chf(totalDeductions || undefined)}
              mono
              bold
            />
          </div>

          <div className="pt-3 border-t border-accent/30 bg-accent/5 -mx-4 px-4 py-3">
            <SummaryRow
              label="Revenu imposable"
              value={chf(revenuImposable || undefined)}
              mono
              bold
            />
          </div>

          <div className="rounded-lg bg-amber-500/10 border border-amber-500/30 p-4 -mx-4 -mb-4">
            <div className="text-[10px] uppercase tracking-wide text-amber-400 mb-1">
              Estimation impôt {canton.code} 2026
            </div>
            {taxLoading ? (
              <div className="flex items-center gap-2 text-amber-300/70">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span className="text-xs">Calcul…</span>
              </div>
            ) : taxPreview ? (
              <>
                <div className="text-xl font-bold text-amber-300">
                  {chf(taxPreview.total)} CHF
                </div>
                <div className="text-[10px] text-amber-200/70 mt-1">
                  ICC {chf(taxPreview.icc)} · IFD {chf(taxPreview.ifd)} · Taux {(taxPreview.effectiveRate * 100).toFixed(1)}%
                </div>
                <div className="text-[9px] text-amber-200/50 mt-2 leading-tight">
                  {taxPreview.disclaimer}
                </div>
              </>
            ) : revenuImposable > 0 ? (
              <div className="text-xs text-amber-200/50">Estimation indisponible</div>
            ) : (
              <div className="text-xs text-amber-200/50">Saisissez vos revenus pour estimer</div>
            )}
          </div>
        </div>
      </div>

      <div className="card p-4 text-2xs text-muted flex gap-2">
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <p>
          Les totaux sont calculés en direct. Le PDF final est généré à
          l'étape 6 avec la projection officielle Lexa et le disclaimer
          réglementaire ({canton.legalBasis}).
          {canton.deadlineLabel && ` Délai de dépôt ${canton.authority} : ${canton.deadlineLabel}.`}
        </p>
      </div>
    </div>
  );
}
