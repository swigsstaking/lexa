import type { CompanyDraftState } from '@/api/lexa';

interface Props {
  state: CompanyDraftState;
  onPatch: (path: string, value: unknown) => void;
}

function NumField({
  id,
  label,
  hint,
  value,
  onChange,
}: {
  id: string;
  label: string;
  hint?: string;
  value: number | undefined;
  onChange: (v: number | undefined) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
        {hint && <span className="ml-1 text-subtle font-normal text-2xs">{hint}</span>}
      </label>
      <input
        id={id}
        type="number"
        min="0"
        step="1"
        className="input"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder="0"
      />
    </div>
  );
}

export function Step2FinancialsVs({ state, onPatch }: Props) {
  const s = state.step2 ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          États financiers résumés
        </h2>
        <p className="text-sm text-muted">
          Compte de résultat de l'exercice — art. 958 CO (image fidèle).
        </p>
      </div>

      <div className="space-y-2">
        <div className="text-2xs uppercase tracking-wider text-muted font-medium mb-3">
          Produits
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumField
            id="pm-ca"
            label="Chiffre d'affaires net (CA)"
            hint="CHF"
            value={s.chiffreAffaires}
            onChange={(v) => onPatch('step2.chiffreAffaires', v)}
          />
          <NumField
            id="pm-produits"
            label="Autres produits"
            hint="CHF"
            value={s.produits}
            onChange={(v) => onPatch('step2.produits', v)}
          />
        </div>
      </div>

      <div className="border-t border-border pt-4">
        <div className="text-2xs uppercase tracking-wider text-muted font-medium mb-3">
          Charges
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <NumField
            id="pm-charges-personnel"
            label="Charges de personnel"
            hint="CHF"
            value={s.chargesPersonnel}
            onChange={(v) => onPatch('step2.chargesPersonnel', v)}
          />
          <NumField
            id="pm-charges-mat"
            label="Charges matérielles & marchandises"
            hint="CHF"
            value={s.chargesMaterielles}
            onChange={(v) => onPatch('step2.chargesMaterielles', v)}
          />
          <NumField
            id="pm-amortissements"
            label="Amortissements comptables"
            hint="CHF"
            value={s.amortissementsComptables}
            onChange={(v) => onPatch('step2.amortissementsComptables', v)}
          />
          <NumField
            id="pm-autres-charges"
            label="Autres charges d'exploitation"
            hint="CHF"
            value={s.autresCharges}
            onChange={(v) => onPatch('step2.autresCharges', v)}
          />
        </div>
      </div>

      <div className="border-t border-accent/30 pt-4 bg-accent/5 -mx-0 px-0 py-2 rounded-lg">
        <NumField
          id="pm-benefit"
          label="Bénéfice net comptable (résultat de l'exercice)"
          hint="CHF — art. 958 CO"
          value={s.benefitAccounting}
          onChange={(v) => onPatch('step2.benefitAccounting', v)}
        />
        <p className="text-2xs text-muted mt-1">
          Solde du compte de résultat. Positif = bénéfice, négatif = perte.
        </p>
      </div>
    </div>
  );
}
