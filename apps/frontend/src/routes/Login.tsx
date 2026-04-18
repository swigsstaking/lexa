import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, LogIn, Sparkles, Briefcase } from 'lucide-react';
import { AxiosError } from 'axios';
import { lexa } from '@/api/lexa';
import { useAuthStore } from '@/stores/authStore';
import { useCompaniesStore } from '@/stores/companiesStore';

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const addCompany = useCompaniesStore((s) => s.addCompany);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const { user, token } = await lexa.login({ email, password });
      setAuth(token, user);
      // Hydrater le companiesStore avec la company de l'user (sinon le badge affiche "—" au reload)
      try {
        const me = await lexa.me();
        if (me.company) addCompany(me.company);
      } catch {
        // silent — l'hydration peut être ré-essayée dans Workspace au mount
      }
      navigate('/workspace', { replace: true });
    } catch (err) {
      if (err instanceof AxiosError) {
        if (err.response?.status === 429) {
          setError(t('auth.rate_limited'));
        } else if (err.response?.status === 401) {
          setError(t('auth.invalid_credentials'));
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
    <div className="min-h-screen grid place-items-center px-6 bg-bg">
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
              {t('auth.login_title')}
            </h1>
          </div>
          <p className="text-sm text-muted mb-6">{t('auth.login_sub')}</p>

          {/* V1.1 SSO — connexion via Swigs Hub */}
          <button
            type="button"
            onClick={() => {
              const callbackUrl = `${window.location.origin}/sso-callback`;
              window.location.href = `https://apps.swigs.online/login?app=lexa&callback=${encodeURIComponent(callbackUrl)}`;
            }}
            className="btn-secondary w-full flex items-center justify-center gap-2 mb-4"
          >
            <Briefcase className="w-4 h-4" />
            Continuer avec Swigs Hub
          </button>
          <div className="relative mb-4">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted">
              <span className="bg-surface px-2">— ou —</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="label" htmlFor="lexa-auth-email">
                {t('auth.email')}
              </label>
              <input
                id="lexa-auth-email"
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
              <label className="label" htmlFor="lexa-auth-password">
                {t('auth.password')}
              </label>
              <input
                id="lexa-auth-password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                minLength={8}
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={submitting}
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-sm text-danger">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || !email || !password}
              className="btn-primary w-full"
            >
              {submitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('auth.submitting')}
                </>
              ) : (
                <>
                  <LogIn className="w-4 h-4" />
                  {t('auth.submit')}
                </>
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-sm text-muted text-center">
            {t('auth.no_account')}{' '}
            <button
              type="button"
              onClick={() => navigate('/register')}
              className="text-accent hover:underline"
            >
              {t('auth.to_register')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
