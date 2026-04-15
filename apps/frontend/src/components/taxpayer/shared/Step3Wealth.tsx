import type { TaxpayerDraft } from '@/api/lexa';
import type { CantonConfig } from '@/config/cantons/types';
import { useTaxpayerDraftStore } from '@/stores/taxpayerDraftStore';
import { CurrencyField } from '@/routes/taxpayer/steps/CurrencyField';

interface Props {
  draft: TaxpayerDraft;
  year: number;
  canton: CantonConfig;
}

export function Step3Wealth({ draft, year, canton }: Props) {
  const updateField = useTaxpayerDraftStore((s) => s.updateField);
  const update = (field: string, value: unknown) => updateField(field, value, 3, year);
  const s = draft.state.step3;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Fortune</h2>
        <p className="text-sm text-muted">
          Valeurs au 31 décembre {year - 1}. Déclaration canton de {canton.label} ({canton.legalBasis}).
        </p>
      </div>

      <div className="space-y-4">
        <CurrencyField
          id="tp-comptes"
          label="Comptes bancaires et épargne"
          value={s.comptesBancaires}
          onChange={(v) => update('step3.comptesBancaires', v)}
        />
        <CurrencyField
          id="tp-titres-cotes"
          label="Titres cotés (actions, fonds)"
          value={s.titresCotes}
          onChange={(v) => update('step3.titresCotes', v)}
        />
        <CurrencyField
          id="tp-titres-nc"
          label="Titres non cotés (participations privées)"
          value={s.titresNonCotes}
          onChange={(v) => update('step3.titresNonCotes', v)}
        />
        <CurrencyField
          id="tp-immo-val"
          label="Immeubles — valeur fiscale"
          value={s.immeublesValeurFiscale}
          onChange={(v) => update('step3.immeublesValeurFiscale', v)}
        />
        <CurrencyField
          id="tp-immo-dette"
          label="Immeubles — emprunts hypothécaires"
          value={s.immeublesEmprunt}
          onChange={(v) => update('step3.immeublesEmprunt', v)}
        />
        <CurrencyField
          id="tp-vehicules"
          label="Véhicules (valeur vénale)"
          value={s.vehicules}
          onChange={(v) => update('step3.vehicules', v)}
        />
        <CurrencyField
          id="tp-autres"
          label="Autres biens mobiliers"
          value={s.autresBiens}
          onChange={(v) => update('step3.autresBiens', v)}
        />
        <CurrencyField
          id="tp-dettes"
          label="Autres dettes privées"
          value={s.dettes}
          onChange={(v) => update('step3.dettes', v)}
        />
      </div>
    </div>
  );
}
