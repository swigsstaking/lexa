import type { TaxpayerDraft } from '@/api/lexa';
import { useFieldUpdater } from '../TaxpayerWizard';
import { CurrencyField } from './CurrencyField';

interface Props {
  draft: TaxpayerDraft;
  year: number;
}

export function Step3Wealth({ draft, year }: Props) {
  const update = useFieldUpdater(year);
  const s = draft.state.step3;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Fortune</h2>
        <p className="text-sm text-muted">
          Valeurs au 31 décembre {year - 1}. Le minimum exonéré en Valais est de CHF 60'000.
        </p>
      </div>

      <div className="space-y-4">
        <CurrencyField
          id="tp-comptes"
          label="Comptes bancaires et épargne"
          value={s.comptesBancaires}
          onChange={(v) => update('step3.comptesBancaires', v, 3)}
        />
        <CurrencyField
          id="tp-titres-cotes"
          label="Titres cotés (actions, fonds)"
          value={s.titresCotes}
          onChange={(v) => update('step3.titresCotes', v, 3)}
        />
        <CurrencyField
          id="tp-titres-nc"
          label="Titres non cotés (participations privées)"
          value={s.titresNonCotes}
          onChange={(v) => update('step3.titresNonCotes', v, 3)}
        />
        <CurrencyField
          id="tp-immo-val"
          label="Immeubles — valeur fiscale"
          value={s.immeublesValeurFiscale}
          onChange={(v) => update('step3.immeublesValeurFiscale', v, 3)}
        />
        <CurrencyField
          id="tp-immo-dette"
          label="Immeubles — emprunts hypothécaires"
          value={s.immeublesEmprunt}
          onChange={(v) => update('step3.immeublesEmprunt', v, 3)}
        />
        <CurrencyField
          id="tp-vehicules"
          label="Véhicules (valeur vénale)"
          value={s.vehicules}
          onChange={(v) => update('step3.vehicules', v, 3)}
        />
        <CurrencyField
          id="tp-autres"
          label="Autres biens mobiliers"
          value={s.autresBiens}
          onChange={(v) => update('step3.autresBiens', v, 3)}
        />
        <CurrencyField
          id="tp-dettes"
          label="Autres dettes privées"
          value={s.dettes}
          onChange={(v) => update('step3.dettes', v, 3)}
        />
      </div>
    </div>
  );
}
