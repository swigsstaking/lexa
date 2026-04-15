import type { TaxpayerDraft } from '@/api/lexa';
import { useFieldUpdater } from '../TaxpayerWizard';
import { CurrencyField } from './CurrencyField';

interface Props {
  draft: TaxpayerDraft;
  year: number;
}

export function Step2Revenues({ draft, year }: Props) {
  const update = useFieldUpdater(year);
  const s = draft.state.step2;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Revenus</h2>
        <p className="text-sm text-muted">
          Tous les revenus bruts annuels en CHF. Laissez à 0 les champs non applicables.
        </p>
      </div>

      <div className="card p-4 space-y-4">
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="tp-salarie"
            checked={s.isSalarie ?? false}
            onChange={(e) => update('step2.isSalarie', e.target.checked, 2)}
            className="w-4 h-4"
          />
          <label htmlFor="tp-salarie" className="text-sm">
            Je suis salarié·e (affilié à une caisse LPP)
          </label>
        </div>
        {s.isSalarie && (
          <div className="flex items-center gap-3 pl-7 text-xs text-muted">
            <input
              type="checkbox"
              id="tp-swissdec"
              checked={s.hasSwissdecCertificate ?? false}
              onChange={(e) =>
                update('step2.hasSwissdecCertificate', e.target.checked, 2)
              }
              className="w-4 h-4"
            />
            <label htmlFor="tp-swissdec">
              Certificat de salaire Swissdec disponible
            </label>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <CurrencyField
          id="tp-salaire"
          label="Salaire brut principal"
          value={s.salaireBrut}
          onChange={(v) => update('step2.salaireBrut', v, 2)}
          hint="Montant brut du certificat de salaire"
        />
        <CurrencyField
          id="tp-accessoires"
          label="Revenus accessoires (indépendant, second emploi…)"
          value={s.revenusAccessoires}
          onChange={(v) => update('step2.revenusAccessoires', v, 2)}
        />
        <CurrencyField
          id="tp-avs"
          label="Rentes AVS"
          value={s.rentesAvs}
          onChange={(v) => update('step2.rentesAvs', v, 2)}
        />
        <CurrencyField
          id="tp-lpp"
          label="Rentes LPP (2e pilier)"
          value={s.rentesLpp}
          onChange={(v) => update('step2.rentesLpp', v, 2)}
        />
        <CurrencyField
          id="tp-3p"
          label="Rentes 3e pilier"
          value={s.rentes3ePilier}
          onChange={(v) => update('step2.rentes3ePilier', v, 2)}
        />
        <CurrencyField
          id="tp-titres"
          label="Revenus du capital mobilier (intérêts, dividendes)"
          value={s.revenusTitres}
          onChange={(v) => update('step2.revenusTitres', v, 2)}
        />
        <CurrencyField
          id="tp-immo"
          label="Revenus immobiliers (loyers, valeur locative)"
          value={s.revenusImmobiliers}
          onChange={(v) => update('step2.revenusImmobiliers', v, 2)}
        />
      </div>
    </div>
  );
}
