/**
 * Step1IdentityCanton — Identité PM avec communes canton-aware
 * BUG-N01 fix : remplace Step1IdentityVs hardcodé pour cantons GE/VD/FR
 *
 * Affiche la commune fiscale et la description du bon canton selon la prop.
 */
import type { CompanyDraftState } from '@/api/lexa';
import type { PmCanton } from '@/routes/company/PmWizardCanton';
import { COMMUNES_NE } from '@/data/communes-ne';
import { COMMUNES_JU } from '@/data/communes-ju';
import { COMMUNES_BJ } from '@/data/communes-bj';

const LEGAL_FORMS = [
  { value: 'sarl', label: 'Sàrl — Société à responsabilité limitée' },
  { value: 'sa', label: 'SA — Société Anonyme' },
  { value: 'association', label: 'Association' },
  { value: 'fondation', label: 'Fondation' },
] as const;

const COMMUNES_VS = [
  'Brig-Glis', 'Leuk', 'Leukerbad', 'Martigny', 'Monthey', 'Naters', 'Saas-Fee',
  'Sierre', 'Sion', 'Stalden', 'Visp', 'Zermatt', 'Ardon', 'Ayent', 'Bagnes',
  'Chalais', 'Chamoson', 'Chippis', 'Conthey', 'Evolène', 'Fully',
  'Grône', 'Hérémence', 'Icogne', 'Isérables', 'Lens', 'Leytron', 'Liddes',
  'Loèche', 'Montana', 'Nendaz', 'Orsières', 'Randogne', 'Riddes',
  'Saillon', 'Saint-Maurice', 'Salgesch', 'Savièse', 'Saxon', 'Sembrancher',
  'Troistorrents', 'Vétroz', 'Vex', 'Vissoie',
].sort();

const COMMUNES_GE = [
  'Genève', 'Carouge', 'Vernier', 'Lancy', 'Meyrin', 'Onex', 'Thônex',
  'Bernex', 'Plan-les-Ouates', 'Chêne-Bougeries', 'Grand-Saconnex',
  'Pregny-Chambésy', 'Collonge-Bellerive', 'Cologny', 'Vandœuvres',
  'Jussy', 'Troinex', 'Perly-Certoux', 'Soral', 'Cartigny',
  'Avully', 'Laconnex', 'Avusy', 'Chancy', 'Dardagny', 'Russin',
  'Satigny', 'Versoix', 'Bellevue', 'Meinier', 'Gy', 'Presinge',
  'Puplinge', 'Chêne-Bourg', 'Valleix', 'Anières', 'Hermance',
].sort();

const COMMUNES_VD = [
  'Lausanne', 'Yverdon-les-Bains', 'Montreux', 'Renens', 'Nyon', 'Vevey',
  'Morges', 'Prilly', 'Crissier', 'Ecublens', 'Pully', 'Gland',
  'Rolle', 'Aubonne', 'Payerne', 'Moudon', 'Oron', 'Lutry',
  'Paudex', 'Villeneuve', 'Aigle', 'Bex', 'Ollon', 'Gryon',
  'Leysin', 'Ormont-Dessus', 'Les Diablerets', 'Sainte-Croix',
  'Grandson', 'Concise', 'Bonvillars', 'La Sarraz', 'Cossonay',
  'Echallens', 'Cheseaux-sur-Lausanne', 'Cugy',
].sort();

const COMMUNES_FR = [
  'Fribourg', 'Bulle', 'Villars-sur-Glâne', 'Givisiez', 'Granges-Paccot',
  'Marly', 'Avry', 'Matran', 'Corminboeuf', 'Grolley',
  'Estavayer-le-Lac', 'Romont', 'Châtel-Saint-Denis', 'Jaun',
  'Broc', 'Charmey', 'Riaz', 'Vuadens', 'Marsens', 'Botterens',
  'Murten', 'Kerzers', 'Courtepin', 'Gurmels', 'Düdingen',
].sort();

const COMMUNES_BY_CANTON: Record<PmCanton, string[]> = {
  VS: COMMUNES_VS,
  GE: COMMUNES_GE,
  VD: COMMUNES_VD,
  FR: COMMUNES_FR,
  NE: COMMUNES_NE,
  JU: COMMUNES_JU,
  BJ: COMMUNES_BJ,
};

const CANTON_NAMES: Record<PmCanton, string> = {
  VS: 'Valais',
  GE: 'Genève',
  VD: 'Vaud',
  FR: 'Fribourg',
  NE: 'Neuchâtel',
  JU: 'Jura',
  BJ: 'Jura bernois',
};

// Préposition correcte selon le canton (du/de)
const CANTON_PREPOSITIONS: Record<PmCanton, string> = {
  VS: 'du Valais',
  GE: 'de Genève',
  VD: 'de Vaud',
  FR: 'de Fribourg',
  NE: 'de Neuchâtel',
  JU: 'du Jura',
  BJ: 'du Jura bernois',
};

interface Props {
  state: CompanyDraftState;
  onPatch: (path: string, value: unknown) => void;
  canton: PmCanton;
}

export function Step1IdentityCanton({ state, onPatch, canton }: Props) {
  const s = state.step1 ?? {};
  const communes = COMMUNES_BY_CANTON[canton];
  const cantonPrep = CANTON_PREPOSITIONS[canton];
  const cantonName = CANTON_NAMES[canton];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight mb-1">
          Identité de la société
        </h2>
        <p className="text-sm text-muted">
          Informations légales de votre Sàrl/SA pour le canton {cantonPrep}.
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
          <label className="label" htmlFor="pm-siege-commune">
            Commune fiscale ({cantonName})
          </label>
          <select
            id="pm-siege-commune"
            className="input"
            value={s.siegeCommune ?? ''}
            onChange={(e) => onPatch('step1.siegeCommune', e.target.value || undefined)}
          >
            <option value="">—</option>
            {communes.map((c) => (
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
