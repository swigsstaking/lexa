import type { TaxpayerDraft } from '@/api/lexa';
import { useFieldUpdaterVd } from '@/routes/taxpayer/TaxpayerWizardVd';
import { CurrencyField } from '@/routes/taxpayer/steps/CurrencyField';

// VD 2026 : plafond salarié 7'260 CHF (avec LPP), indépendant 36'288 CHF (sans LPP)
const VD_PILIER_3A_WITH_LPP = 7260;
const VD_PILIER_3A_WITHOUT_LPP = 36288;

interface Props {
  draft: TaxpayerDraft;
  year: number;
}

export function Step4DeductionsVd({ draft, year }: Props) {
  const update = useFieldUpdaterVd(year);
  const s = draft.state.step4;
  const isSalarie = draft.state.step2.isSalarie ?? false;
  const pilier3aMax = isSalarie ? VD_PILIER_3A_WITH_LPP : VD_PILIER_3A_WITHOUT_LPP;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Déductions</h2>
        <p className="text-sm text-muted">
          Déductions admises LIFD art. 33 et LI (BLV 642.11). Le plafond pilier 3a dépend
          de votre statut : {isSalarie ? 'salarié (avec LPP)' : 'indépendant (sans LPP)'} = CHF{' '}
          {pilier3aMax.toLocaleString('fr-CH')}.
        </p>
      </div>

      <div className="space-y-4">
        <CurrencyField
          id="tp-3a"
          label={`Cotisation pilier 3a (max ${pilier3aMax.toLocaleString('fr-CH')} CHF)`}
          value={s.pilier3a}
          max={pilier3aMax}
          onChange={(v) => update('step4.pilier3a', v, 4)}
        />
        <CurrencyField
          id="tp-lpp-rachat"
          label="Rachats LPP (2e pilier)"
          value={s.rachatsLpp}
          onChange={(v) => update('step4.rachatsLpp', v, 4)}
        />
        <CurrencyField
          id="tp-primes"
          label="Primes d'assurance maladie et accidents"
          value={s.primesAssurance}
          onChange={(v) => update('step4.primesAssurance', v, 4)}
        />

        <div className="card p-4">
          <div className="label mb-3">Frais professionnels</div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="tp-fp-format"
                checked={(s.fraisProFormat ?? 'forfait') === 'forfait'}
                onChange={() => update('step4.fraisProFormat', 'forfait', 4)}
              />
              Forfait (3% du salaire, min 2'000 / max 4'000 CHF — ACI VD Art. 26 LI)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="tp-fp-format"
                checked={s.fraisProFormat === 'reel'}
                onChange={() => update('step4.fraisProFormat', 'reel', 4)}
              />
              Réel
            </label>
          </div>
          {s.fraisProFormat === 'reel' && (
            <div className="mt-3">
              <CurrencyField
                id="tp-fp-reel"
                label="Montant des frais réels justifiés"
                value={s.fraisProReels}
                onChange={(v) => update('step4.fraisProReels', v, 4)}
              />
            </div>
          )}
        </div>

        <CurrencyField
          id="tp-interets"
          label="Intérêts passifs d'emprunts privés"
          value={s.interetsPassifs}
          onChange={(v) => update('step4.interetsPassifs', v, 4)}
        />
        <CurrencyField
          id="tp-medical"
          label="Frais médicaux non remboursés"
          value={s.fraisMedicaux}
          onChange={(v) => update('step4.fraisMedicaux', v, 4)}
        />
        <CurrencyField
          id="tp-dons"
          label="Dons aux institutions d'utilité publique"
          value={s.dons}
          onChange={(v) => update('step4.dons', v, 4)}
        />
      </div>
    </div>
  );
}
