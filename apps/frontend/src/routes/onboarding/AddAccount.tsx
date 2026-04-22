import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Building2, User, Check, Loader2, Briefcase } from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useAuthStore } from '@/stores/authStore';
import { useCompaniesStore } from '@/stores/companiesStore';
import type { LegalForm } from '@/api/types';
import { CompanySearchField } from '@/components/CompanySearchField';

type AccountType = 'private' | 'business' | 'fiduciary' | null;

const CANTONS = [
  'VS','GE','VD','FR','NE','JU','BE','ZH','LU','AG',
  'BL','BS','TI','ZG','SG','GR','TG','SH','AR','AI','GL','SO','OW','NW','UR','SZ',
];

export function AddAccount() {
  const navigate = useNavigate();
  const setToken = useAuthStore((s) => s.setToken);
  const addCompany = useCompaniesStore((s) => s.addCompany);

  const [step, setStep] = useState(1);
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [name, setName] = useState('');
  const [legalForm, setLegalForm] = useState<string>('raison_individuelle');
  const [canton, setCanton] = useState('VS');
  const [isVatSubject, setIsVatSubject] = useState(false);
  const [vatNumber, setVatNumber] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeSelect = (type: AccountType) => {
    setAccountType(type);
    if (type === 'private') setLegalForm('raison_individuelle');
    else if (type === 'fiduciary') setLegalForm('sarl'); // Cabinet fiduciaire généralement en Sàrl ou SA
    else setLegalForm('sarl');
    setStep(2);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const result = await lexa.addAccount({
        name,
        legalForm: legalForm as LegalForm,
        canton,
        isVatSubject,
        vatNumber: vatNumber || undefined,
        isFiduciary: accountType === 'fiduciary',
      });
      setToken(result.token, result.tenantId);
      addCompany(result.company);
      // Reload pour que toutes les queries se relancent sur le nouveau tenant
      window.location.assign('/welcome');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur lors de la création');
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-bg py-8">
      <div className="w-full max-w-xl">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-fg grid place-items-center font-semibold text-sm">
            L
          </div>
          <span className="text-lg font-semibold text-ink">Lexa</span>
        </div>

        <div className="card-elevated p-8">
          {/* Step 1 — type de compte */}
          {step === 1 && (
            <>
              <h1 className="text-xl font-semibold text-ink mb-2">Ajouter un compte</h1>
              <p className="text-sm text-muted mb-6">Choisissez le type de compte à créer.</p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <button
                  onClick={() => handleTypeSelect('private')}
                  className="card-elevated p-6 text-left hover:border-accent/40 transition-colors"
                >
                  <User className="w-6 h-6 text-accent mb-3" />
                  <h3 className="text-base font-semibold text-ink mb-2">Compte privé</h3>
                  <p className="text-sm text-muted">Personne physique, indépendant (Raison individuelle)</p>
                </button>

                <button
                  onClick={() => handleTypeSelect('business')}
                  className="card-elevated p-6 text-left hover:border-accent/40 transition-colors"
                >
                  <Building2 className="w-6 h-6 text-accent mb-3" />
                  <h3 className="text-base font-semibold text-ink mb-2">Compte entreprise</h3>
                  <p className="text-sm text-muted">Sàrl, SA, Coopérative, Association</p>
                </button>
              </div>

              {/* 3e option — compte fiduciaire (même design, rectangle allongé) */}
              <button
                onClick={() => handleTypeSelect('fiduciary')}
                className="card-elevated w-full mt-4 p-6 text-left hover:border-accent/40 transition-colors flex items-center gap-4"
              >
                <Briefcase className="w-6 h-6 text-accent flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-base font-semibold text-ink">Compte fiduciaire</h3>
                  <p className="text-sm text-muted mt-1">
                    Cabinet gérant plusieurs clients · accès multi-dossiers, rôles fiduciary/viewer
                  </p>
                </div>
              </button>
            </>
          )}

          {/* Step 2 — infos base */}
          {step === 2 && (
            <>
              <button type="button" onClick={() => setStep(1)} className="btn-ghost text-xs mb-4">
                <ArrowLeft className="w-3 h-3" />
                Retour
              </button>

              <h1 className="text-xl font-semibold text-ink mb-2">
                {accountType === 'private'
                  ? 'Votre compte privé'
                  : accountType === 'fiduciary'
                    ? 'Votre cabinet fiduciaire'
                    : 'Votre entreprise'}
              </h1>
              {accountType === 'fiduciary' && (
                <p className="text-sm text-muted mb-2">
                  Le cabinet sera créé en Sàrl par défaut. Vous pourrez ensuite inviter vos clients
                  en tant que tenants avec rôle <span className="font-mono text-ink">fiduciary</span> ou{' '}
                  <span className="font-mono text-ink">viewer</span>.
                </p>
              )}

              <div className="space-y-4 mt-6">
                {(accountType === 'business' || accountType === 'fiduciary') && (
                  <div>
                    <label className="label">Rechercher dans le registre UID</label>
                    <CompanySearchField
                      placeholder={accountType === 'fiduciary' ? 'Nom ou IDE du cabinet…' : "Nom ou UID de l'entreprise…"}
                      onSelect={(c) => {
                        setName(c.name);
                        if (c.legalForm) setLegalForm(c.legalForm);
                        if (c.canton) setCanton(c.canton);
                      }}
                    />
                    <div className="flex items-center gap-3 mt-3">
                      <div className="flex-1 h-px bg-border" />
                      <span className="text-xs text-muted uppercase tracking-wider">ou saisir manuellement</span>
                      <div className="flex-1 h-px bg-border" />
                    </div>
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="name">
                    {accountType === 'private'
                      ? 'Nom complet (ou raison sociale RI)'
                      : accountType === 'fiduciary'
                        ? 'Nom du cabinet'
                        : 'Raison sociale'}
                  </label>
                  <input
                    id="name"
                    className="input"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    autoFocus={accountType === 'private'}
                    placeholder={
                      accountType === 'business'
                        ? 'Auto-rempli ou saisir manuellement'
                        : undefined
                    }
                    onKeyDown={(e) => {
                      // Enter dans ce champ appelle directement le submit si tout est valide
                      // et ne doit pas déclencher de navigation involontaire
                      if (e.key === 'Enter' && name.trim()) {
                        e.preventDefault();
                        void handleSubmit();
                      } else if (e.key === 'Enter') {
                        e.preventDefault();
                      }
                    }}
                  />
                </div>

                {(accountType === 'business' || accountType === 'fiduciary') && (
                  <div>
                    <label className="label" htmlFor="legal">Forme juridique</label>
                    <select
                      id="legal"
                      className="input"
                      value={legalForm}
                      onChange={(e) => setLegalForm(e.target.value)}
                    >
                      <option value="sarl">Société à responsabilité limitée (Sàrl)</option>
                      <option value="sa">Société anonyme (SA)</option>
                      {accountType === 'fiduciary' && (
                        <option value="raison_individuelle">Raison individuelle</option>
                      )}
                      {accountType === 'business' && (
                        <>
                          <option value="association">Association</option>
                          <option value="cooperative">Coopérative</option>
                          <option value="fondation">Fondation</option>
                        </>
                      )}
                      <option value="autre">Autre</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="label" htmlFor="canton">Canton</label>
                  <select
                    id="canton"
                    className="input"
                    value={canton}
                    onChange={(e) => setCanton(e.target.value)}
                  >
                    {CANTONS.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-2 text-sm text-muted cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isVatSubject}
                    onChange={(e) => setIsVatSubject(e.target.checked)}
                  />
                  Assujetti TVA
                </label>

                {isVatSubject && (
                  <div>
                    <label className="label" htmlFor="vat">Numéro TVA (optionnel)</label>
                    <input
                      id="vat"
                      className="input font-mono"
                      value={vatNumber}
                      onChange={(e) => setVatNumber(e.target.value)}
                      placeholder="CHE-XXX.XXX.XXX"
                    />
                  </div>
                )}
              </div>

              {error && (
                <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
                  {error}
                </div>
              )}

              <button
                type="button"
                onClick={handleSubmit}
                disabled={!name || submitting}
                className="btn-primary w-full mt-6"
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Création…
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Créer le compte
                  </>
                )}
              </button>
            </>
          )}
        </div>

        <div className="text-center mt-6">
          <button
            onClick={() => navigate('/workspace')}
            className="text-xs text-muted hover:text-ink"
          >
            ← Retour au workspace
          </button>
        </div>
      </div>
    </div>
  );
}
