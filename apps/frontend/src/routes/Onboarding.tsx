import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Sparkles,
  Building2,
  Receipt,
  Landmark,
  Check,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { lexa } from '@/api/lexa';
import { useCompaniesStore } from '@/stores/companiesStore';
import { useOnboardingStore } from '@/stores/onboardingStore';
import { StepIndicator } from '@/components/StepIndicator';
import { CompanySearchField } from '@/components/CompanySearchField';
import type { CreateCompanyInput, LegalForm } from '@/api/types';

const LEGAL_FORM_ORDER: LegalForm[] = [
  'raison_individuelle',
  'sarl',
  'sa',
  'association',
  'cooperative',
  'fondation',
  'autre',
];

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { step, draft, setStep, update, reset } = useOnboardingStore();
  const addCompany = useCompaniesStore((s) => s.addCompany);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const steps = useMemo(
    () => [
      t('onboarding.steps.welcome'),
      t('onboarding.steps.company'),
      t('onboarding.steps.vat'),
      t('onboarding.steps.bank'),
    ],
    [t],
  );

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
      setError(t('onboarding.errors.name_required'));
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
      addCompany(company);
      reset();
      navigate('/workspace');
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        (e instanceof Error ? e.message : t('common.error'));
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
            {t('common.back')}
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
          <div className="mt-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
            {error}
          </div>
        )}

        <div className="flex items-center justify-between mt-6">
          <button onClick={prev} disabled={step === 0} className="btn-secondary">
            <ArrowLeft className="w-4 h-4" />
            {t('common.previous')}
          </button>
          {step < steps.length - 1 ? (
            <button onClick={next} disabled={!canNext} className="btn-primary">
              {t('common.next')}
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={finish} disabled={submitting || !canNext} className="btn-primary">
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('onboarding.submitting')}
                </>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  {t('common.finish')}
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
        <div className="w-14 h-14 rounded-2xl bg-accent/10 text-accent grid place-items-center mx-auto mb-5">
          <Sparkles className="w-7 h-7" />
        </div>
        <h2 className="text-3xl mb-3 font-semibold tracking-tight">
          {t('onboarding.welcome.title')}
        </h2>
        <p className="text-muted max-w-md mx-auto">{t('onboarding.welcome.text')}</p>
        <div className="mt-8 grid grid-cols-3 gap-3 text-left">
          <Mini icon={Building2} label={t('onboarding.steps.company')} />
          <Mini icon={Receipt} label={t('onboarding.steps.vat')} />
          <Mini icon={Landmark} label={t('onboarding.steps.bank')} />
        </div>
      </div>
    );
  }

  function StepCompany() {
    return (
      <div className="space-y-5">
        <div>
          <h2 className="text-2xl mb-1 font-semibold tracking-tight">
            {t('onboarding.company.title')}
          </h2>
          <p className="text-sm text-muted">{t('onboarding.company.sub')}</p>
        </div>

        <div>
          <label className="label">{t('onboarding.company.search_label')}</label>
          <CompanySearchField
            placeholder={t('onboarding.company.search_placeholder')}
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
          <div className="flex-1 h-px bg-border" />
          <span className="text-2xs text-muted uppercase tracking-wider">
            {t('onboarding.company.or_manual')}
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label" htmlFor="lexa-onb-name">
              {t('onboarding.company.name')}
            </label>
            <input
              id="lexa-onb-name"
              name="name"
              className="input"
              value={draft.name ?? ''}
              onChange={(e) => update({ name: e.target.value, source: draft.source ?? 'manual' })}
              placeholder={t('onboarding.company.name_placeholder')}
            />
          </div>
          <div>
            <label className="label" htmlFor="lexa-onb-legal">
              {t('onboarding.company.legal_form')}
            </label>
            <select
              id="lexa-onb-legal"
              name="legalForm"
              className="input"
              value={draft.legalForm ?? ''}
              onChange={(e) => {
                const lf = e.target.value as LegalForm;
                update({ legalForm: lf, legalFormLabel: t(`legal_forms.${lf}`) });
              }}
            >
              <option value="">{t('common.empty')}</option>
              {LEGAL_FORM_ORDER.map((lf) => (
                <option key={lf} value={lf}>
                  {t(`legal_forms.${lf}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="lexa-onb-uid">
              {t('onboarding.company.uid')}
            </label>
            <input
              id="lexa-onb-uid"
              name="uid"
              className="input font-mono"
              value={draft.uid ?? ''}
              onChange={(e) => update({ uid: e.target.value })}
              placeholder="CHE-XXX.XXX.XXX"
            />
          </div>
          <div>
            <label className="label" htmlFor="lexa-onb-zip">
              {t('onboarding.company.zip')}
            </label>
            <input
              id="lexa-onb-zip"
              name="zip"
              className="input"
              value={draft.zip ?? ''}
              onChange={(e) => update({ zip: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="lexa-onb-city">
              {t('onboarding.company.city')}
            </label>
            <input
              id="lexa-onb-city"
              name="city"
              className="input"
              value={draft.city ?? ''}
              onChange={(e) => update({ city: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="lexa-onb-canton">
              {t('onboarding.company.canton')}
            </label>
            <input
              id="lexa-onb-canton"
              name="canton"
              className="input uppercase"
              maxLength={2}
              value={draft.canton ?? ''}
              onChange={(e) => update({ canton: e.target.value.toUpperCase() })}
              placeholder="VS"
            />
          </div>
          <div>
            <label className="label" htmlFor="lexa-onb-country">
              {t('onboarding.company.country')}
            </label>
            <input
              id="lexa-onb-country"
              name="country"
              className="input"
              value={draft.country ?? 'CH'}
              disabled
            />
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
          <h2 className="text-2xl mb-1 font-semibold tracking-tight">
            {t('onboarding.vat.title')}
          </h2>
          <p className="text-sm text-muted">{t('onboarding.vat.sub')}</p>
        </div>

        <div className="flex gap-3">
          <Toggle
            active={!subject}
            onClick={() => update({ isVatSubject: false })}
            label={t('onboarding.vat.not_subject')}
            sub={t('onboarding.vat.not_subject_sub')}
          />
          <Toggle
            active={subject}
            onClick={() => update({ isVatSubject: true })}
            label={t('onboarding.vat.subject')}
            sub={t('onboarding.vat.subject_sub')}
          />
        </div>

        {subject && (
          <div className="space-y-4 pt-2">
            <div>
              <label className="label" htmlFor="lexa-onb-vatnum">
                {t('onboarding.vat.number')}
              </label>
              <input
                id="lexa-onb-vatnum"
                name="vatNumber"
                className="input font-mono"
                value={draft.vatNumber ?? ''}
                onChange={(e) => update({ vatNumber: e.target.value })}
                placeholder={t('onboarding.vat.number_placeholder')}
              />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="lexa-onb-vatmethod">
                  {t('onboarding.vat.method')}
                </label>
                <select
                  id="lexa-onb-vatmethod"
                  name="vatMethod"
                  className="input"
                  value={draft.vatMethod ?? 'effective'}
                  onChange={(e) =>
                    update({ vatMethod: e.target.value as 'effective' | 'tdfn' | 'forfaitaire' })
                  }
                >
                  <option value="effective">{t('onboarding.vat.method_effective')}</option>
                  <option value="tdfn">{t('onboarding.vat.method_tdfn')}</option>
                  <option value="forfaitaire">{t('onboarding.vat.method_forfaitaire')}</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="lexa-onb-vatfreq">
                  {t('onboarding.vat.frequency')}
                </label>
                <select
                  id="lexa-onb-vatfreq"
                  name="vatFrequency"
                  className="input"
                  value={draft.vatDeclarationFrequency ?? 'quarterly'}
                  onChange={(e) =>
                    update({
                      vatDeclarationFrequency: e.target
                        .value as 'monthly' | 'quarterly' | 'semesterly' | 'yearly',
                    })
                  }
                >
                  <option value="monthly">{t('onboarding.vat.frequency_monthly')}</option>
                  <option value="quarterly">{t('onboarding.vat.frequency_quarterly')}</option>
                  <option value="semesterly">{t('onboarding.vat.frequency_semesterly')}</option>
                  <option value="yearly">{t('onboarding.vat.frequency_yearly')}</option>
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
          <h2 className="text-2xl mb-1 font-semibold tracking-tight">
            {t('onboarding.bank.title')}
          </h2>
          <p className="text-sm text-muted">{t('onboarding.bank.sub')}</p>
        </div>

        <div>
          <label className="label" htmlFor="lexa-onb-iban">
            {t('onboarding.bank.iban')}
          </label>
          <input
            id="lexa-onb-iban"
            name="iban"
            className="input font-mono"
            value={draft.iban ?? ''}
            onChange={(e) => update({ iban: e.target.value.replace(/\s/g, '').toUpperCase() })}
            placeholder={t('onboarding.bank.iban_placeholder')}
          />
        </div>

        <div>
          <label className="label" htmlFor="lexa-onb-qriban">
            {t('onboarding.bank.qr_iban', { optional: t('common.optional') })}
          </label>
          <input
            id="lexa-onb-qriban"
            name="qrIban"
            className="input font-mono"
            value={draft.qrIban ?? ''}
            onChange={(e) => update({ qrIban: e.target.value.replace(/\s/g, '').toUpperCase() })}
            placeholder={t('onboarding.bank.qr_iban_placeholder')}
          />
        </div>

        <div className="p-4 rounded-lg bg-elevated border border-border text-sm text-muted">
          {t('onboarding.bank.note')}
        </div>
      </div>
    );
  }
}

function Mini({ icon: Icon, label }: { icon: typeof Sparkles; label: string }) {
  return (
    <div className="card p-4 text-center">
      <Icon className="w-5 h-5 mx-auto mb-2 text-accent" />
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
          ? 'border-accent bg-accent/5'
          : 'border-border bg-surface hover:bg-elevated'
      }`}
    >
      <div className="font-medium">{label}</div>
      <div className="text-xs text-muted mt-0.5">{sub}</div>
    </button>
  );
}
