import type { CompanyDraftState } from '@/api/lexa';

const LEGAL_FORMS = [
  { value: 'sarl', label: 'Sàrl — Société à responsabilité limitée' },
  { value: 'sa', label: 'SA — Société Anonyme' },
  { value: 'association', label: 'Association' },
  { value: 'fondation', label: 'Fondation' },
] as const;

const VS_COMMUNES = [
  'Brig-Glis', 'Leuk', 'Leukerbad', 'Martigny', 'Monthey', 'Naters', 'Saas-Fee',
  'Sierre', 'Sion', 'Stalden', 'Visp', 'Zermatt', 'Ardon', 'Ayent', 'Bagnes',
  'Chalais', 'Chamoson', 'Chippis', 'Conthey', 'Derborence', 'Evolène', 'Fully',
  'Grône', 'Hérémence', 'Icogne', 'Isérables', 'Lens', 'Leytron', 'Liddes',
  'Loèche', 'Montana', 'Nendaz', 'Noës', 'Orsières', 'Randogne', 'Riddes',
  'Saillon', 'Saint-Maurice', 'Salgesch', 'Savièse', 'Saxon', 'Sembrancher',
  'Troistorrents', 'Vétroz', 'Vex', 'Vissoie',
].sort();

interface Props {
  state: CompanyDraftState;
  onPatch: (path: string, value: unknown) => void;
}

export function Step1IdentityVs({ state, onPatch }: Props) {
  const s = state.step1 ?? {};

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Identité de la société
        </h2>
        <p className="text-sm text-muted">
          Informations légales de votre Sàrl/SA pour le canton du Valais.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="md:col-span-2">
          <label className="label" htmlFor="pm-legal-name">Raison sociale complète</label>
          <input
            id="pm-legal-name"
            className="input"
            value={s.legalName ?? ''}
            onChange={(e) => onPatch('step1.legalName', e.target.value)}
            placeholder="Ma Société Sàrl"
          />
        </div>

        <div>
          <label className="label" htmlFor="pm-legal-form">Forme juridique</label>
          <select
            id="pm-legal-form"
            className="input"
            value={s.legalForm ?? ''}
            onChange={(e) => onPatch('step1.legalForm', e.target.value || undefined)}
          >
            <option value="">—</option>
            {LEGAL_FORMS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="pm-ide">
            Numéro IDE{' '}
            <span className="text-subtle font-normal">(CHE-xxx.xxx.xxx)</span>
          </label>
          <input
            id="pm-ide"
            className="input"
            value={s.ideNumber ?? ''}
            onChange={(e) => onPatch('step1.ideNumber', e.target.value || undefined)}
            placeholder="CHE-123.456.789"
          />
        </div>

        <div className="md:col-span-2">
          <label className="label" htmlFor="pm-siege-street">Adresse du siège</label>
          <input
            id="pm-siege-street"
            className="input"
            value={s.siegeStreet ?? ''}
            onChange={(e) => onPatch('step1.siegeStreet', e.target.value || undefined)}
            placeholder="Rue de la Paix 1"
          />
        </div>

        <div>
          <label className="label" htmlFor="pm-siege-zip">NPA</label>
          <input
            id="pm-siege-zip"
            className="input"
            value={s.siegeZip ?? ''}
            onChange={(e) => onPatch('step1.siegeZip', e.target.value || undefined)}
            placeholder="1950"
          />
        </div>

        <div>
          <label className="label" htmlFor="pm-siege-commune">Commune fiscale (VS)</label>
          <select
            id="pm-siege-commune"
            className="input"
            value={s.siegeCommune ?? ''}
            onChange={(e) => onPatch('step1.siegeCommune', e.target.value || undefined)}
          >
            <option value="">—</option>
            {VS_COMMUNES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="label" htmlFor="pm-fy-start">Début exercice fiscal</label>
          <input
            id="pm-fy-start"
            type="date"
            className="input"
            value={s.fiscalYearStart ?? ''}
            onChange={(e) => onPatch('step1.fiscalYearStart', e.target.value || undefined)}
          />
        </div>

        <div>
          <label className="label" htmlFor="pm-fy-end">Fin exercice fiscal</label>
          <input
            id="pm-fy-end"
            type="date"
            className="input"
            value={s.fiscalYearEnd ?? ''}
            onChange={(e) => onPatch('step1.fiscalYearEnd', e.target.value || undefined)}
          />
        </div>
      </div>
    </div>
  );
}
