import type { TaxpayerDraft } from '@/api/lexa';
import { CheckCircle2, AlertCircle } from 'lucide-react';
import { useTaxpayerDraftStore } from '@/stores/taxpayerDraftStore';

interface Props {
  draft: TaxpayerDraft;
  year: number;
}

export function Step5PreviewVd({ draft }: Props) {
  const setStep = useTaxpayerDraftStore((s) => s.setStep);
  const { step1, step2, step3, step4 } = draft.state;

  const checks: Array<{
    label: string;
    ok: boolean;
    goTo: number;
  }> = [
    {
      label: 'Identité (prénom, nom, commune VD)',
      ok: !!(step1.firstName && step1.lastName && step1.commune),
      goTo: 1,
    },
    {
      label: 'État civil précisé',
      ok: !!step1.civilStatus,
      goTo: 1,
    },
    {
      label: 'Coefficient communal renseigné',
      ok: !!(step1.coefficientCommunal ?? (step1.commune === 'Lausanne' ? 79 : undefined)),
      goTo: 1,
    },
    {
      label: 'Au moins un revenu déclaré',
      ok:
        (step2.salaireBrut ?? 0) > 0 ||
        (step2.revenusAccessoires ?? 0) > 0 ||
        (step2.rentesAvs ?? 0) > 0,
      goTo: 2,
    },
    {
      label: 'Fortune renseignée',
      ok:
        (step3.comptesBancaires ?? 0) > 0 ||
        (step3.titresCotes ?? 0) > 0 ||
        (step3.immeublesValeurFiscale ?? 0) > 0,
      goTo: 3,
    },
    {
      label: 'Format frais professionnels choisi',
      ok: !!step4.fraisProFormat,
      goTo: 4,
    },
  ];

  const allOk = checks.every((c) => c.ok);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Aperçu avant génération
        </h2>
        <p className="text-sm text-muted">
          Vérifiez que les sections obligatoires sont remplies. Vous pouvez cliquer
          sur une ligne pour retourner à l'étape correspondante.
        </p>
      </div>

      <div className="card p-4 space-y-2">
        {checks.map((c, i) => (
          <button
            key={i}
            type="button"
            onClick={() => setStep(c.goTo)}
            className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-elevated transition-colors text-left"
          >
            {c.ok ? (
              <CheckCircle2 className="w-5 h-5 text-success flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
            )}
            <span className="text-sm flex-1">{c.label}</span>
            <span className="text-2xs text-subtle">Étape {c.goTo}</span>
          </button>
        ))}
      </div>

      <div
        className={`p-4 rounded-lg border ${
          allOk
            ? 'bg-success/10 border-success/30 text-success'
            : 'bg-warning/10 border-warning/30 text-warning'
        }`}
      >
        {allOk ? (
          <p className="text-sm">
            ✓ Toutes les vérifications sont passées. Vous pouvez passer à
            l'étape 6 pour générer votre déclaration PDF Vaud.
          </p>
        ) : (
          <p className="text-sm">
            Complétez les champs manquants avant de générer le PDF. Les
            vérifications ci-dessus signalent ce qui manque encore.
          </p>
        )}
      </div>
    </div>
  );
}
