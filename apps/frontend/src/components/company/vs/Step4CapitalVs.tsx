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

function computedTotal(s: CompanyDraftState['step4'] = {}): number {
  return (
    (s.capitalSocial ?? 0) +
    (s.reservesLegales ?? 0) +
    (s.reservesLibres ?? 0) +
    (s.reportBenefice ?? 0)
  );
}

export function Step4CapitalVs({ state, onPatch }: Props) {
  const s = state.step4 ?? {};
  const autoTotal = computedTotal(s);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Capital et fonds propres imposables
        </h2>
        <p className="text-sm text-muted">
          Base de calcul de l'impôt sur le capital — art. 75 LIFD + LF VS section PM.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumField
          id="pm-capital-social"
          label="Capital social libéré"
          hint="CHF"
          value={s.capitalSocial}
          onChange={(v) => onPatch('step4.capitalSocial', v)}
        />
        <NumField
          id="pm-reserves-legales"
          label="Réserves légales"
          hint="CHF"
          value={s.reservesLegales}
          onChange={(v) => onPatch('step4.reservesLegales', v)}
        />
        <NumField
          id="pm-reserves-libres"
          label="Réserves libres"
          hint="CHF"
          value={s.reservesLibres}
          onChange={(v) => onPatch('step4.reservesLibres', v)}
        />
        <NumField
          id="pm-report-benefice"
          label="Report à nouveau (bénéfice reporté)"
          hint="CHF"
          value={s.reportBenefice}
          onChange={(v) => onPatch('step4.reportBenefice', v)}
        />
      </div>

      <div className="border-t border-accent/30 pt-4">
        <NumField
          id="pm-capital-total"
          label="Capital imposable total (fonds propres)"
          hint="Si vide, calculé automatiquement : somme des champs ci-dessus"
          value={s.capitalTotal}
          onChange={(v) => onPatch('step4.capitalTotal', v)}
        />
        {!s.capitalTotal && autoTotal > 0 && (
          <p className="text-2xs text-muted mt-1">
            Total calculé automatiquement :{' '}
            <span className="font-semibold text-ink">
              {autoTotal.toLocaleString('fr-CH', { maximumFractionDigits: 0 })} CHF
            </span>
          </p>
        )}
      </div>
    </div>
  );
}
