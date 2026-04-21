import axios from 'axios';
import { useCompaniesStore } from '@/stores/companiesStore';
import { getAuthToken, useAuthStore } from '@/stores/authStore';

export const baseURL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_LEXA_URL || '/api');

/** Retourne l'URL absolue pour une route (utile pour fetch natif SSE) */
export function getBaseURL(): string {
  return baseURL;
}

export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  config.headers = config.headers ?? {};

  const token = getAuthToken();
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }

  // X-Tenant-Id reste utile pour les routes publiques (ex: search company
  // pendant l'inscription) et pour compat avec les tenants historiques.
  // Quand un JWT est présent, le backend override tenantId avec celui du token.
  const tenantId = useCompaniesStore.getState().activeCompanyId;
  if (tenantId) {
    config.headers['X-Tenant-Id'] = tenantId;
  }

  return config;
});

// Routes d'authentification — ne jamais auto-logout sur 401 (c'est "mauvais mot de passe", pas "session expirée")
const AUTH_ROUTES = ['/auth/login', '/auth/register', '/auth/google', '/auth/magic'];

// Redirect auto vers /login si on reçoit un 401 avec un token actif,
// SAUF sur les routes d'auth où 401 = mauvais credentials (pas session expirée)
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const requestUrl: string = error.config?.url ?? '';
    const isAuthRoute = AUTH_ROUTES.some((r) => requestUrl.includes(r));
    if (error.response?.status === 401 && getAuthToken() && !isAuthRoute) {
      useAuthStore.getState().logout();
      // Hard navigation pour vider le state React
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
