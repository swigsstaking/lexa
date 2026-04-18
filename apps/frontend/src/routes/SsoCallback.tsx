/**
 * /sso-callback — Handler SSO Swigs Hub pour Lexa
 *
 * Reçoit ?sso_token=... après redirect depuis apps.swigs.online,
 * appelle POST /auth/sso-verify, et connecte l'user.
 *
 * V1.1 SSO — mirror du pattern Pro SsoHandler.jsx
 */

import { useEffect, useState, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useAuthStore } from '@/stores/authStore';
import { useCompaniesStore } from '@/stores/companiesStore';

type Status = 'checking' | 'verifying' | 'success' | 'error';

export function SsoCallback() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const logout = useAuthStore((s) => s.logout);
  const addCompany = useCompaniesStore((s) => s.addCompany);

  const [status, setStatus] = useState<Status>('checking');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const initiated = useRef(false);

  useEffect(() => {
    if (initiated.current) return;

    const ssoToken = searchParams.get('sso_token');

    if (!ssoToken) {
      navigate('/login?error=no_sso_token', { replace: true });
      return;
    }

    initiated.current = true;
    // Nettoyer le token de l'URL pour éviter rejeu
    setSearchParams({}, { replace: true });

    handleSsoVerify(ssoToken);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSsoVerify = async (ssoToken: string) => {
    setStatus('verifying');

    // Déconnecter session existante avant SSO (évite corruption état)
    logout();

    try {
      const { token, user, hubUserId } = await lexa.ssoVerify(ssoToken);
      setAuth(token, user);

      // Hydrater le companiesStore depuis /auth/me
      try {
        const me = await lexa.me();
        if (me.company) addCompany(me.company);
        // Persister hubUserId dans le store si disponible
        if (hubUserId || me.hubUserId) {
          useAuthStore.getState().setHubUserId(hubUserId ?? me.hubUserId ?? null);
        }
      } catch {
        // Non-bloquant — le workspace chargera au mount
      }

      setStatus('success');
      setTimeout(() => {
        navigate('/workspace', { replace: true });
      }, 800);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'Impossible de vérifier votre session Swigs Hub';
      setErrorMsg(msg);
      setStatus('error');
    }
  };

  if (status === 'checking') return null;

  return (
    <div className="fixed inset-0 bg-bg/80 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="card-elevated p-8 max-w-sm w-full mx-4 text-center flex flex-col items-center gap-4">
        {status === 'verifying' && (
          <>
            <Loader2 className="w-12 h-12 text-accent animate-spin" />
            <div>
              <p className="text-base font-semibold text-ink">Connexion en cours...</p>
              <p className="text-sm text-muted mt-1">Vérification de votre session Swigs Hub</p>
            </div>
          </>
        )}

        {status === 'success' && (
          <>
            <CheckCircle className="w-12 h-12 text-emerald-400" />
            <div>
              <p className="text-base font-semibold text-ink">Connecté !</p>
              <p className="text-sm text-muted mt-1">Bienvenue dans Lexa</p>
            </div>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle className="w-12 h-12 text-red-400" />
            <div>
              <p className="text-base font-semibold text-ink">Erreur de connexion</p>
              <p className="text-sm text-muted mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={() => navigate('/login', { replace: true })}
              className="btn-secondary mt-2"
            >
              Retour à la connexion
            </button>
          </>
        )}
      </div>
    </div>
  );
}
