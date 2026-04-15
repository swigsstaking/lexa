import type { TaxpayerDraft } from '@/api/lexa';
import { FileText, Info } from 'lucide-react';

function chf(n: number | undefined): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('fr-CH', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

interface Props {
  draft: TaxpayerDraft;
}

/**
 * Panneau latéral qui affiche un résumé live des champs saisis.
 * Pas un preview PDF (évite un round-trip réseau à chaque frappe) mais
 * un équivalent textuel avec les mêmes sections que le PDF final.
 */
export function WizardSummary({ draft }: Props) {
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
    Math.max(revenuSalaire * 0.03, 2000),
    4000,
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

  return (
    <div className="sticky top-6 space-y-4">
      <div className="card-elevated p-4">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-accent" />
          <span className="text-2xs uppercase tracking-wider text-muted">
            Aperçu en direct
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
            label="Commune VS"
            value={step1.commune ?? '—'}
          />

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
              label="Frais pro"
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

          <div className="pt-3 border-t border-accent/30 bg-accent/5 -mx-4 -mb-4 px-4 py-3 rounded-b-xl">
            <SummaryRow
              label="Revenu imposable"
              value={chf(revenuImposable || undefined)}
              mono
              bold
            />
          </div>
        </div>
      </div>

      <div className="card p-4 text-2xs text-muted flex gap-2">
        <Info className="w-4 h-4 text-accent flex-shrink-0 mt-0.5" />
        <p>
          Les totaux sont calculés en direct. Le PDF final est généré à
          l'étape 6 avec la projection officielle Lexa et le disclaimer
          réglementaire (LIFD art. 33, LF VS).
        </p>
      </div>
    </div>
  );
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
