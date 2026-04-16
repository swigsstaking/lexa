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

function total(s: CompanyDraftState['step3'] = {}): number {
  return (
    (s.chargesNonAdmises ?? 0) +
    (s.provisionsExcessives ?? 0) +
    (s.amortissementsExcessifs ?? 0) +
    (s.reservesLatentes ?? 0) +
    (s.autresCorrections ?? 0)
  );
}

export function Step3CorrectionsVs({ state, onPatch }: Props) {
  const s = state.step3 ?? {};
  const totalCorrections = total(s);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Corrections fiscales
        </h2>
        <p className="text-sm text-muted">
          Réintégrations au bénéfice comptable — art. 58 LIFD + art. 63 LIFD (provisions).
          Les corrections augmentent le bénéfice imposable.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <NumField
          id="pm-charges-non-admises"
          label="Charges non admises fiscalement"
          hint="cadeaux > 200 CHF, amendes, etc."
          value={s.chargesNonAdmises}
          onChange={(v) => onPatch('step3.chargesNonAdmises', v)}
        />
        <NumField
          id="pm-provisions"
          label="Provisions excessives"
          hint="art. 63 LIFD — au-delà du risque effectif"
          value={s.provisionsExcessives}
          onChange={(v) => onPatch('step3.provisionsExcessives', v)}
        />
        <NumField
          id="pm-amort-excessifs"
          label="Amortissements excessifs"
          hint="au-delà des taux Notice A AFC"
          value={s.amortissementsExcessifs}
          onChange={(v) => onPatch('step3.amortissementsExcessifs', v)}
        />
        <NumField
          id="pm-reserves-latentes"
          label="Dissolution de réserves latentes"
          hint="dissolution forcée"
          value={s.reservesLatentes}
          onChange={(v) => onPatch('step3.reservesLatentes', v)}
        />
        <NumField
          id="pm-autres-corrections"
          label="Autres corrections fiscales"
          value={s.autresCorrections}
          onChange={(v) => onPatch('step3.autresCorrections', v)}
        />
      </div>

      {totalCorrections > 0 && (
        <div className="card bg-amber-500/10 border-amber-500/30 p-4">
          <div className="text-2xs uppercase tracking-wider text-amber-400 mb-1">
            Total corrections
          </div>
          <div className="text-xl font-bold text-amber-300">
            +{totalCorrections.toLocaleString('fr-CH', { maximumFractionDigits: 0 })} CHF
          </div>
          <p className="text-2xs text-amber-200/70 mt-1">
            Réintégrées au bénéfice comptable pour obtenir le bénéfice net imposable.
          </p>
        </div>
      )}

      {totalCorrections === 0 && (
        <p className="text-sm text-muted italic">
          Aucune correction fiscale ? Passez à l'étape suivante si le bénéfice comptable
          est déjà le bénéfice imposable (cas simple).
        </p>
      )}
    </div>
  );
}
