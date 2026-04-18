import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Loader2, LogIn, Sparkles, Mail } from 'lucide-react';
import { AxiosError } from 'axios';
import { GoogleLogin, type CredentialResponse } from '@react-oauth/google';
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

  // Magic-link state
  const [magicEmail, setMagicEmail] = useState('');
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);
  const [magicError, setMagicError] = useState<string | null>(null);

  // Google Sign-In handler
  const handleGoogleSuccess = async (credentialResponse: CredentialResponse) => {
    const idToken = credentialResponse.credential;
    if (!idToken) {
      setError('Réponse Google invalide — credential manquant');
      return;
    }
    setError(null);
    try {
      const { user, token } = await lexa.googleAuth(idToken);
      setAuth(token, user);
      try {
        const me = await lexa.me();
        if (me.company) addCompany(me.company);
      } catch {
        // silent
      }
      navigate('/workspace', { replace: true });
    } catch (err) {
      if (err instanceof AxiosError) {
        setError(err.response?.data?.error ?? t('common.error'));
      } else {
        setError(t('common.error'));
      }
    }
  };

  // Magic-link handler
  const handleMagicLink = async (e: FormEvent) => {
    e.preventDefault();
    setMagicSubmitting(true);
    setMagicError(null);
    setMagicSent(false);
    try {
      await lexa.magicLink(magicEmail);
      setMagicSent(true);
    } catch (err) {
      if (err instanceof AxiosError) {
        setMagicError(err.response?.data?.error ?? t('common.error'));
      } else {
        setMagicError(t('common.error'));
      }
    } finally {
      setMagicSubmitting(false);
    }
  };

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
          <p className="text-sm text-muted mb-6">
            {t('auth.login_sub')} · Connexion centralisée via Swigs Hub
          </p>

          {/* ── Section connexion rapide ────────────────────────────── */}
          <div className="space-y-3 mb-5">
            <p className="text-xs font-medium text-muted uppercase tracking-wider">
              Connexion rapide
            </p>

            {/* Google Sign-In */}
            <div className="flex justify-start">
              <GoogleLogin
                onSuccess={handleGoogleSuccess}
                onError={() => setError('Connexion Google échouée — réessayez')}
                theme="filled_black"
                shape="rectangular"
                size="large"
                text="continue_with"
                locale="fr"
              />
            </div>

            {/* Magic-link */}
            <form onSubmit={handleMagicLink} className="space-y-2">
              <div className="flex gap-2">
                <input
                  type="email"
                  placeholder="Votre email…"
                  className="input flex-1 text-sm"
                  value={magicEmail}
                  onChange={(e) => setMagicEmail(e.target.value)}
                  disabled={magicSubmitting || magicSent}
                  autoComplete="email"
                />
                <button
                  type="submit"
                  disabled={magicSubmitting || magicSent || !magicEmail}
                  className="btn-secondary flex items-center gap-1.5 text-sm px-3 whitespace-nowrap"
                >
                  {magicSubmitting ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Mail className="w-3.5 h-3.5" />
                  )}
                  Lien par email
                </button>
              </div>
              {magicSent && (
                <p className="text-xs text-emerald-400">
                  Si un compte existe, un email vous a été envoyé.
                </p>
              )}
              {magicError && (
                <p className="text-xs text-danger">{magicError}</p>
              )}
            </form>
          </div>

          {/* ── Diviseur ───────────────────────────────────────────── */}
          <div className="relative mb-5">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-border" />
            </div>
            <div className="relative flex justify-center text-xs text-muted">
              <span className="bg-[var(--color-card,#1c1c1e)] px-3">
                ou avec mot de passe
              </span>
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
