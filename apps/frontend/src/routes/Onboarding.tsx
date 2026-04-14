import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, Sparkles, Building2, Receipt, Landmark, Check } from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useCompanyStore } from '@/stores/companyStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { StepIndicator } from '@/components/StepIndicator';
import { CompanySearchField } from '@/components/CompanySearchField';
import type { CreateCompanyInput, LegalForm } from '@/api/types';

const steps = ['Bienvenue', 'Entreprise', 'TVA', 'Banque'];

const legalForms: Array<{ value: LegalForm; label: string }> = [
  { value: 'raison_individuelle', label: 'Raison individuelle' },
  { value: 'sarl', label: 'Société à responsabilité limitée (Sàrl)' },
  { value: 'sa', label: 'Société anonyme (SA)' },
  { value: 'snc', label: 'Société en nom collectif' },
  { value: 'association', label: 'Association' },
  { value: 'cooperative', label: 'Coopérative' },
  { value: 'fondation', label: 'Fondation' },
];

export function Onboarding() {
  const navigate = useNavigate();
  const { step, draft, setStep, update, reset } = useOnboardingStore();
  const setCompany = useCompanyStore((s) => s.setCompany);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canNext = useMemo(() => {
    if (step === 0) return true;
    if (step === 1) return !!draft.name && !!draft.legalForm;
    if (step === 2) return true;
    if (step === 3) return true;
    return false;
  }, [step, draft]);

  const next = () => step < steps.length - 1 && setStep(step + 1);
  const prev = () => step > 0 && setStep(step - 1);

  const finish = async () => {
    if (!draft.name || !draft.legalForm) {
      setError('Nom et forme juridique requis');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const payload: CreateCompanyInput = {
        source: draft.source ?? 'manual',
        uid: draft.uid,
        name: draft.name,
        legalForm: draft.legalForm,
        legalFormLabel: draft.legalFormLabel,
        street: draft.street,
        zip: draft.zip,
        city: draft.city,
        canton: draft.canton,
        country: draft.country ?? 'CH',
        iban: draft.iban,
        qrIban: draft.qrIban,
        isVatSubject: draft.isVatSubject ?? false,
        vatNumber: draft.vatNumber,
        vatDeclarationFrequency: draft.vatDeclarationFrequency,
        vatMethod: draft.vatMethod,
        fiscalYearStartMonth: draft.fiscalYearStartMonth ?? 1,
      };
      const company = await lexa.createCompany(payload);
      setCompany(company);
      reset();
      navigate('/dashboard');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : 'Erreur inconnue');
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-6 py-10">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-8">
          <button onClick={() => navigate('/')} className="btn-ghost">
            <ArrowLeft className="w-4 h-4" />
            Retour
          </button>
          <StepIndicator steps={steps} current={step} />
        </div>

        <div className="card p-8 min-h-[420px]">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.25 }}
            >
              {step === 0 && <StepWelcome />}
              {step === 1 && <StepCompany />}
              {step === 2 && <StepVat />}
              {step === 3 && <StepBank />}
            </motion.div>
          </AnimatePresence>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-lexa-danger/10 border border-lexa-danger/30 text-sm text-lexa-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <button onClick={prev} disabled={step === 0} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            Précédent
          </button>
          {step < steps.length - 1 ? (
            <button onClick={next} disabled={!canNext} className="btn-primary">
              Suivant
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={submitting || !canNext} className="btn-primary">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Création...
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  Terminer
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );

  function StepWelcome() {
    return (
      <div className="text-center py-6">
        <div className="w-14 h-14 rounded-2xl bg-lexa-primary/10 text-lexa-primary grid place-items-center mx-auto mb-5">
          <Sparkles className="w-7 h-7" />
        </div>
        <h2 className="text-3xl mb-3">Bienvenue sur Lexa</h2>
        <p className="text-lexa-muted max-w-md mx-auto">
          Configurons votre entreprise en 3 étapes : identité, régime TVA, banque.
          Vous pourrez tout modifier ensuite.
        </p>
        <div className="mt-8 grid grid-cols-3 gap-3 text-left">
          <Mini icon={Building2} label="Entreprise" />
          <Mini icon={Receipt} label="TVA" />
          <Mini icon={Landmark} label="Banque" />
        </div>
      </div>
    );
  }

  function StepCompany() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl mb-1">Votre entreprise</h2>
          <p className="text-sm text-lexa-muted">
            Recherchez dans le registre fédéral suisse (UID) ou saisissez manuellement.
          </p>
        </div>

        <div>
          <label className="label">Recherche registre fédéral</label>
          <CompanySearchField
            onSelect={(c) => {
              update({
                source: 'uid-register',
                uid: c.uid,
                name: c.name,
                legalForm: c.legalForm,
                legalFormLabel: c.legalFormLabel,
                street: c.street,
                zip: c.zip,
                city: c.city,
                canton: c.canton,
                country: c.country ?? 'CH',
                isVatSubject: c.isVatSubject ?? false,
              });
            }}
          />
        </div>

        <div className="flex items-center gap-3 my-2">
          <div className="flex-1 h-px bg-lexa-border" />
          <span className="text-xs text-lexa-muted uppercase">ou manuellement</span>
          <div className="flex-1 h-px bg-lexa-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Raison sociale</label>
            <input
              className="input"
              value={draft.name ?? ''}
              onChange={(e) => update({ name: e.target.value, source: draft.source ?? 'manual' })}
              placeholder="Mon Entreprise SA"
            />
          </div>
          <div>
            <label className="label">Forme juridique</label>
            <select
              className="input"
              value={draft.legalForm ?? ''}
              onChange={(e) => {
                const lf = e.target.value as LegalForm;
                const found = legalForms.find((x) => x.value === lf);
                update({ legalForm: lf, legalFormLabel: found?.label });
              }}
            >
              <option value="">—</option>
              {legalForms.map((lf) => (
                <option key={lf.value} value={lf.value}>
                  {lf.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label">UID (optionnel)</label>
            <input
              className="input font-mono"
              value={draft.uid ?? ''}
              onChange={(e) => update({ uid: e.target.value })}
              placeholder="CHE-XXX.XXX.XXX"
            />
          </div>
          <div>
            <label className="label">NPA</label>
            <input
              className="input"
              value={draft.zip ?? ''}
              onChange={(e) => update({ zip: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Ville</label>
            <input
              className="input"
              value={draft.city ?? ''}
              onChange={(e) => update({ city: e.target.value })}
            />
          </div>
          <div>
            <label className="label">Canton</label>
            <input
              className="input uppercase"
              maxLength={2}
              value={draft.canton ?? ''}
              onChange={(e) => update({ canton: e.target.value.toUpperCase() })}
              placeholder="VS"
            />
          </div>
          <div>
            <label className="label">Pays</label>
            <input className="input" value={draft.country ?? 'CH'} disabled />
          </div>
        </div>
      </div>
    );
  }

  function StepVat() {
    const subject = draft.isVatSubject ?? false;
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl mb-1">Régime TVA</h2>
          <p className="text-sm text-lexa-muted">
            Seuil d'assujettissement obligatoire : CHF 100'000 de chiffre d'affaires annuel.
          </p>
        </div>

        <div className="flex gap-3">
          <Toggle
            active={!subject}
            onClick={() => update({ isVatSubject: false })}
            label="Non assujetti"
            sub="CA < CHF 100'000"
          />
          <Toggle
            active={subject}
            onClick={() => update({ isVatSubject: true })}
            label="Assujetti"
            sub="N° TVA requis"
          />
        </div>

        {subject && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="label">Numéro TVA</label>
              <input
                className="input font-mono"
                value={draft.vatNumber ?? ''}
                onChange={(e) => update({ vatNumber: e.target.value })}
                placeholder="CHE-XXX.XXX.XXX TVA"
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Méthode</label>
                <select
                  className="input"
                  value={draft.vatMethod ?? 'effective'}
                  onChange={(e) =>
                    update({ vatMethod: e.target.value as 'effective' | 'tdfn' | 'forfaitaire' })
                  }
                >
                  <option value="effective">Effective (standard)</option>
                  <option value="tdfn">TDFN (taux de la dette fiscale nette)</option>
                  <option value="forfaitaire">Forfaitaire</option>
                </select>
              </div>
              <div>
                <label className="label">Fréquence</label>
                <select
                  className="input"
                  value={draft.vatDeclarationFrequency ?? 'quarterly'}
                  onChange={(e) =>
                    update({
                      vatDeclarationFrequency: e.target
                        .value as 'monthly' | 'quarterly' | 'semesterly' | 'yearly',
                    })
                  }
                >
                  <option value="monthly">Mensuelle</option>
                  <option value="quarterly">Trimestrielle</option>
                  <option value="semesterly">Semestrielle</option>
                  <option value="yearly">Annuelle</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function StepBank() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl mb-1">Coordonnées bancaires</h2>
          <p className="text-sm text-lexa-muted">
            Optionnel : permet l'import automatique des relevés bancaires plus tard.
          </p>
        </div>

        <div>
          <label className="label">IBAN</label>
          <input
            className="input font-mono"
            value={draft.iban ?? ''}
            onChange={(e) => update({ iban: e.target.value.replace(/\s/g, '').toUpperCase() })}
            placeholder="CH93 0076 2011 6238 5295 7"
          />
        </div>

        <div>
          <label className="label">QR-IBAN (optionnel)</label>
          <input
            className="input font-mono"
            value={draft.qrIban ?? ''}
            onChange={(e) => update({ qrIban: e.target.value.replace(/\s/g, '').toUpperCase() })}
            placeholder="CH44 3199 9123 0008 8901 2"
          />
        </div>

        <div className="p-4 rounded-lg bg-lexa-bg border border-lexa-border text-sm text-lexa-muted">
          Vous pourrez ajouter plus de comptes bancaires et connecter l'import IMAP
          depuis les paramètres ensuite.
        </div>
      </div>
    );
  }
}

function Mini({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="card p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2 text-lexa-primary" />
      <div className="text-xs font-medium">{label}</div>
    </div>
  );
}

function Toggle({
  active,
  onClick,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  sub: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-xl border-2 p-4 text-left transition-colors ${
        active
          ? 'border-lexa-primary bg-lexa-primary/5'
          : 'border-lexa-border bg-lexa-surface hover:bg-lexa-bg'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs text-lexa-muted mt-0.5">{sub}</div>
    </button>
  );
}
