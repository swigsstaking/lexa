import type { TaxpayerDraft } from '@/api/lexa';
import { COMMUNES_GE } from '@/data/communes-ge';
import { useFieldUpdaterGe } from '@/routes/taxpayer/TaxpayerWizardGe';

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
}

export function Step1IdentityGe({ draft, year }: Props) {
  const update = useFieldUpdaterGe(year);
  const s = draft.state.step1;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Identité & situation familiale
        </h2>
        <p className="text-sm text-muted">
          Les données officielles de votre déclaration. Canton fixé à Genève (GE).
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
            onChange={(e) => update('step1.firstName', e.target.value, 1)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-last">Nom</label>
          <input
            id="tp-last"
            name="lastName"
            className="input"
            value={s.lastName ?? ''}
            onChange={(e) => update('step1.lastName', e.target.value, 1)}
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
            onChange={(e) => update('step1.dateOfBirth', e.target.value, 1)}
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-civil">État civil</label>
          <select
            id="tp-civil"
            name="civilStatus"
            className="input"
            value={s.civilStatus ?? ''}
            onChange={(e) => update('step1.civilStatus', e.target.value, 1)}
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
              update('step1.childrenCount', Number(e.target.value) || 0, 1)
            }
          />
        </div>
        <div>
          <label className="label" htmlFor="tp-commune">Commune fiscale GE</label>
          <select
            id="tp-commune"
            name="commune"
            className="input"
            value={s.commune ?? ''}
            onChange={(e) => update('step1.commune', e.target.value, 1)}
          >
            <option value="">—</option>
            {COMMUNES_GE.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
      </div>
    </div>
  );
}
