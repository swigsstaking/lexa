import axios from 'axios';
import { useCompaniesStore } from '@/stores/companiesStore';

const baseURL = import.meta.env.DEV ? '/api' : (import.meta.env.VITE_LEXA_URL || '/api');

export const api = axios.create({
  baseURL,
  timeout: 60_000,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const tenantId = useCompaniesStore.getState().activeCompanyId;
  if (tenantId) {
    config.headers = config.headers ?? {};
    config.headers['X-Tenant-Id'] = tenantId;
  }
  return config;
});
