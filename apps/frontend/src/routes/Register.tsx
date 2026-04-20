import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AxiosError } from 'axios';
import { Loader2, Sparkles, UserPlus } from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useAuthStore } from '@/stores/authStore';
import { useCompaniesStore } from '@/stores/companiesStore';
import { CompanySearchField } from '@/components/CompanySearchField';

const CANTONS = [
  'AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU',
  'NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH',
] as const;

const LEGAL_FORMS = [
  'raison_individuelle',
  'societe_simple',
  'snc',
  'senc',
  'sarl',
  'sa',
  'sca',
  'cooperative',
  'association',
  'fondation',
  'sa_etrangere',
  'autre',
] as const;

export function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const addCompany = useCompaniesStore((s) => s.addCompany);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [legalForm, setLegalForm] = useState<(typeof LEGAL_FORMS)[number]>('raison_individuelle');
  const [canton, setCanton] = useState<(typeof CANTONS)[number]>('VS');
  const [isVatSubject, setIsVatSubject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    // Guard : vérifier que tous les champs requis sont remplis avant de soumettre
    // (protège contre le submit déclenché par Enter sur un champ ou Tab+Enter)
    if (!email.trim() || !password || !companyName.trim()) {
      setError('Veuillez remplir tous les champs obligatoires');
      return;
    }
    if (password.length < 8) {
      setError('Mot de passe : minimum 8 caractères');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await lexa.register({
        email,
        password,
        company: { name: companyName, legalForm, canton, isVatSubject },
      });
      // Fix BUG2: race condition entre setAuth (Zustand) et navigate('/welcome').
      // RedirectIfAuthed sur /register voit le token dès que setAuth() est appelé
      // et redirige vers /workspace avant que navigate('/welcome') puisse s'exécuter.
      //
      // Solution : pré-écrire le token dans localStorage (key 'lexa.auth') AVANT
      // d'appeler setAuth(), puis naviguer. Zustand persist hydrate depuis localStorage
      // au montage du composant suivant, donc RequireAuth sur /welcome verra le token.
      // setAuth() est ensuite appelé pour sync le state mémoire sans provoquer de
      // re-render de RedirectIfAuthed (on est déjà sur /welcome à ce moment).
      if (result.company) {
        addCompany(result.company);
      }
      // Pré-persister dans localStorage pour que RequireAuth sur /welcome ait le token
      const authState = {
        state: {
          token: result.token,
          user: result.user,
          activeTenantId: result.user.tenantId,
        },
        version: 0,
      };
      localStorage.setItem('lexa.auth', JSON.stringify(authState));
      // Naviguer vers /welcome AVANT de mettre à jour le store Zustand en mémoire.
      // Ceci évite que RedirectIfAuthed (sur /register) ne voit le nouveau token
      // et redirige vers /workspace.
      navigate('/welcome', { replace: true, state: { firstLogin: true } });
      // Sync le store Zustand en mémoire (après navigation, on n'est plus sur /register)
      setAuth(result.token, result.user);
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 409) {
          setError('Cet email est déjà enregistré');
        } else {
          setError(err.response?.data?.error ?? t('common.error'));
        }
      } else {
        setError(t('common.error'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen grid place-items-center px-6 bg-bg py-8">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className="w-8 h-8 rounded-lg bg-accent text-accent-fg grid place-items-center font-semibold text-sm">
            L
          </div>
          <span className="text-lg font-semibold text-ink">{t('app.name')}</span>
        </div>

        <div className="card-elevated p-8">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-accent" />
            <h1 className="text-xl font-semibold tracking-tight text-ink">
              {t('auth.register_title')}
            </h1>
          </div>
          <p className="text-sm text-muted mb-6">{t('auth.register_sub')}</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="reg-email">
                {t('auth.email')}
              </label>
              <input
                id="reg-email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div>
              <label className="label" htmlFor="reg-password">
                {t('auth.password')}
              </label>
              <input
                id="reg-password"
                name="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            <div className="pt-2 border-t border-border space-y-3">
              <div>
                <label className="label">
                  {t('onboarding.company.search_label')}
                </label>
                <CompanySearchField
                  placeholder={t('onboarding.company.search_placeholder')}
                  onSelect={(c) => {
                    setCompanyName(c.name);
                    if (c.legalForm) setLegalForm(c.legalForm as (typeof LEGAL_FORMS)[number]);
                    if (c.canton) setCanton(c.canton as (typeof CANTONS)[number]);
                  }}
                />
              </div>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-border" />
                <span className="text-xs text-muted uppercase tracking-wider">
                  {t('onboarding.company.or_manual')}
                </span>
                <div className="flex-1 h-px bg-border" />
              </div>

              <div>
                <label className="label" htmlFor="reg-company">
                  {t('onboarding.company.name')}
                </label>
                <input
                  id="reg-company"
                  name="companyName"
                  type="text"
                  required
                  className="input"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  disabled={submitting}
                  placeholder={t('onboarding.company.name_placeholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.preventDefault();
                  }}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="reg-legal">
                  {t('onboarding.company.legal_form')}
                </label>
                <select
                  id="reg-legal"
                  name="legalForm"
                  className="input"
                  value={legalForm}
                  onChange={(e) => setLegalForm(e.target.value as (typeof LEGAL_FORMS)[number])}
                  disabled={submitting}
                >
                  {LEGAL_FORMS.map((lf) => (
                    <option key={lf} value={lf}>
                      {t(`legal_forms.${lf}`)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="reg-canton">
                  {t('onboarding.company.canton')}
                </label>
                <select
                  id="reg-canton"
                  name="canton"
                  className="input"
                  value={canton}
                  onChange={(e) => setCanton(e.target.value as (typeof CANTONS)[number])}
                  disabled={submitting}
                >
                  {CANTONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={isVatSubject}
                onChange={(e) => setIsVatSubject(e.target.checked)}
                disabled={submitting}
              />
              {t('onboarding.vat.subject')}
            </label>

            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password || !companyName}
              className="btn-primary w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('auth.register_submitting')}
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4" />
                  {t('auth.register_submit')}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-sm text-muted text-center">
            {t('auth.have_account')}{' '}
            <button
              type="button"
              onClick={() => navigate('/login')}
              className="text-accent hover:underline"
            >
              {t('auth.to_login')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
