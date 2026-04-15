import type { TaxpayerDraft } from '@/api/lexa';
import type { CantonConfig } from '@/config/cantons/types';
import { useTaxpayerDraftStore } from '@/stores/taxpayerDraftStore';
import { CurrencyField } from '@/components/taxpayer/shared/CurrencyField';

const PILIER_3A_SALARIE = 7260;
const PILIER_3A_INDEPENDANT = 36288;

interface Props {
  draft: TaxpayerDraft;
  year: number;
  canton: CantonConfig;
}

export function Step4Deductions({ draft, year, canton }: Props) {
  const updateField = useTaxpayerDraftStore((s) => s.updateField);
  const update = (field: string, value: unknown) => updateField(field, value, 4, year);
  const s = draft.state.step4;
  const isSalarie = draft.state.step2.isSalarie ?? false;
  const pilier3aMax = isSalarie ? PILIER_3A_SALARIE : PILIER_3A_INDEPENDANT;
  const statusLabel = canton.code === 'VD'
    ? (isSalarie ? 'salarié (avec LPP)' : 'indépendant (sans LPP)')
    : (isSalarie ? 'salarié' : 'indépendant');

  const fraisProForfaitLabel = canton.code === 'VD'
    ? `Forfait (3% du salaire, min ${canton.fraisProMin.toLocaleString('fr-CH')} / max ${canton.fraisProMax.toLocaleString('fr-CH')} CHF — ${canton.authority} Art. 26 LI)`
    : `Forfait (3% du salaire, min ${canton.fraisProMin.toLocaleString('fr-CH')} / max ${canton.fraisProMax.toLocaleString('fr-CH')} CHF)`;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">Déductions</h2>
        <p className="text-sm text-muted">
          Déductions admises LIFD art. 33 et {canton.legalBasis.split(',')[0]}. Le plafond pilier 3a dépend
          de votre statut : {statusLabel} = CHF{' '}
          {pilier3aMax.toLocaleString('fr-CH')}.
        </p>
      </div>

      <div className="space-y-4">
        <CurrencyField
          id="tp-3a"
          label={`Cotisation pilier 3a (max ${pilier3aMax.toLocaleString('fr-CH')} CHF)`}
          value={s.pilier3a}
          max={pilier3aMax}
          onChange={(v) => update('step4.pilier3a', v)}
        />
        <CurrencyField
          id="tp-lpp-rachat"
          label="Rachats LPP (2e pilier)"
          value={s.rachatsLpp}
          onChange={(v) => update('step4.rachatsLpp', v)}
        />
        <CurrencyField
          id="tp-primes"
          label="Primes d'assurance maladie et accidents"
          value={s.primesAssurance}
          onChange={(v) => update('step4.primesAssurance', v)}
        />

        <div className="card p-4">
          <div className="label mb-3">Frais professionnels</div>
          <div className="flex gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="tp-fp-format"
                checked={(s.fraisProFormat ?? 'forfait') === 'forfait'}
                onChange={() => update('step4.fraisProFormat', 'forfait')}
              />
              {fraisProForfaitLabel}
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="radio"
                name="tp-fp-format"
                checked={s.fraisProFormat === 'reel'}
                onChange={() => update('step4.fraisProFormat', 'reel')}
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
                onChange={(v) => update('step4.fraisProReels', v)}
              />
            </div>
          )}
        </div>

        <CurrencyField
          id="tp-interets"
          label="Intérêts passifs d'emprunts privés"
          value={s.interetsPassifs}
          onChange={(v) => update('step4.interetsPassifs', v)}
        />
        <CurrencyField
          id="tp-medical"
          label="Frais médicaux non remboursés"
          value={s.fraisMedicaux}
          onChange={(v) => update('step4.fraisMedicaux', v)}
        />
        <CurrencyField
          id="tp-dons"
          label="Dons aux institutions d'utilité publique"
          value={s.dons}
          onChange={(v) => update('step4.dons', v)}
        />
      </div>
    </div>
  );
}
