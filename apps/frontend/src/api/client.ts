import axios from 'axios';
import { useCompaniesStore } from '@/stores/companiesStore';
import { getAuthToken, useAuthStore } from '@/stores/authStore';

const baseURL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_LEXA_URL || '/api');

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

// Redirect auto vers /login si on reçoit un 401 avec un token actif
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && getAuthToken()) {
      useAuthStore.getState().logout();
      // Hard navigation pour vider le state React
      if (window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);
