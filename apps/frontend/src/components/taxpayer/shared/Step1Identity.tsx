import type { TaxpayerDraft } from '@/api/lexa';
import type { CantonConfig } from '@/config/cantons/types';
import { useTaxpayerDraftStore } from '@/stores/taxpayerDraftStore';

const CIVIL_STATUS = [
  { value: 'single', label: 'Célibataire' },
  { value: 'married', label: 'Marié·e' },
  { value: 'registered_partnership', label: 'Partenariat enregistré' },
  { value: 'divorced', label: 'Divorcé·e' },
  { value: 'separated', label: 'Séparé·e' },
  { value: 'widowed', label: 'Veuf / veuve' },
] as const;

interface Props {
  draft: TaxpayerDraft;
  year: number;
  canton: CantonConfig;
}

export function Step1Identity({ draft, year, canton }: Props) {
  const updateField = useTaxpayerDraftStore((s) => s.updateField);
  const update = (field: string, value: unknown) => updateField(field, value, 1, year);
  const s = draft.state.step1;

  const handleCommuneChange = (commune: string) => {
    update('step1.commune', commune);
    if (canton.hasCoefficientCommunal) {
      const communeData = canton.communes.find((c) => c.name === commune);
      const coeff = communeData?.coefficientCommunal;
      if (coeff !== null && coeff !== undefined) {
        update('step1.coefficientCommunal', coeff);
      }
    }
  };

  const selectedCommune = canton.hasCoefficientCommunal
    ? canton.communes.find((c) => c.name === s.commune)
    : null;
  const autoCoeff = selectedCommune?.coefficientCommunal ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Identité & situation familiale
        </h2>
        <p className="text-sm text-muted">
          Les données officielles de votre déclaration. Canton fixé à {canton.label} ({canton.code}).
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="label" htmlFor="tp-first">Prénom</label>
          <input
            id="tp-first"
            name="firstName"
            className="input"
            value={s.firstName ?? ''}
            onChange={(e) => update('step1.firstName', e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-last">Nom</label>
          <input
            id="tp-last"
            name="lastName"
            className="input"
            value={s.lastName ?? ''}
            onChange={(e) => update('step1.lastName', e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-dob">Date de naissance</label>
          <input
            id="tp-dob"
            name="dateOfBirth"
            type="date"
            className="input"
            value={s.dateOfBirth ?? ''}
            onChange={(e) => update('step1.dateOfBirth', e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-civil">État civil</label>
          <select
            id="tp-civil"
            name="civilStatus"
            className="input"
            value={s.civilStatus ?? ''}
            onChange={(e) => update('step1.civilStatus', e.target.value)}
          >
            <option value="">—</option>
            {CIVIL_STATUS.map((cs) => (
              <option key={cs.value} value={cs.value}>
                {cs.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="tp-children">Enfants à charge</label>
          <input
            id="tp-children"
            name="childrenCount"
            type="number"
            min="0"
            max="20"
            className="input"
            value={s.childrenCount ?? 0}
            onChange={(e) =>
              update('step1.childrenCount', Number(e.target.value) || 0)
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-commune">Commune fiscale {canton.code}</label>
          <select
            id="tp-commune"
            name="commune"
            className="input"
            value={s.commune ?? ''}
            onChange={(e) => handleCommuneChange(e.target.value)}
          >
            <option value="">—</option>
            {canton.communes.map((c) => (
              <option key={c.name} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {canton.hasCoefficientCommunal && (
          <div>
            <label className="label" htmlFor="tp-coeff">
              Coefficient communal 2026
              {autoCoeff !== null && (
                <span className="ml-2 text-2xs text-success">
                  (auto-rempli)
                </span>
              )}
            </label>
            <input
              id="tp-coeff"
              name="coefficientCommunal"
              type="number"
              min="1"
              max="200"
              className="input"
              value={s.coefficientCommunal ?? ''}
              onChange={(e) =>
                update('step1.coefficientCommunal', Number(e.target.value) || undefined)
              }
              placeholder={
                s.commune && autoCoeff === null
                  ? 'À saisir manuellement (vd.ch)'
                  : '79'
              }
            />
            {s.commune && autoCoeff === null && (
              <p className="text-2xs text-warning mt-1">
                Coefficient non disponible pour cette commune — à saisir manuellement (source : vd.ch).
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
