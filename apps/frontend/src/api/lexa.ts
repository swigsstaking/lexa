import { api } from './client';
import type { AuthUser } from '@/stores/authStore';
import type {
  AgentAnswer,
  AgentsResponse,
  Company,
  CompanyLookupResult,
  CreateCompanyInput,
  HealthStatus,
  LedgerBalance,
  LedgerListResponse,
  TransactionStats,
} from './types';

export type AuthResponse = {
  user: AuthUser;
  company: Company | null;
  token: string;
};

export const lexa = {
  health: () => api.get<HealthStatus>('/health').then((r) => r.data),

  // Auth (session 14)
  register: (input: {
    email: string;
    password: string;
    company?: { name: string; legalForm?: string; canton?: string; isVatSubject?: boolean };
  }) =>
    api
      .post<AuthResponse>('/auth/register', input)
      .then((r) => r.data),

  login: (input: { email: string; password: string }) =>
    api.post<{ user: AuthUser; token: string }>('/auth/login', input).then((r) => r.data),

  me: () =>
    api
      .get<{ user: AuthUser; company: Company | null }>('/auth/me')
      .then((r) => r.data),

  // Onboarding
  searchCompany: (q: string) =>
    api
      .get<{ count: number; results: CompanyLookupResult[] }>('/onboarding/company/search', {
        params: { q },
      })
      .then((r) => r.data),

  createCompany: (input: CreateCompanyInput) =>
    api.post<{ company: Company }>('/onboarding/company', input).then((r) => r.data.company),

  getCompany: (tenantId: string) =>
    api.get<{ company: Company }>(`/onboarding/company/${tenantId}`).then((r) => r.data.company),

  updateCompany: (tenantId: string, patch: Partial<CreateCompanyInput>) =>
    api
      .patch<{ company: Company }>(`/onboarding/company/${tenantId}`, patch)
      .then((r) => r.data.company),

  // Agents
  listAgents: () => api.get<AgentsResponse>('/agents').then((r) => r.data),

  ragAsk: (question: string) =>
    api.post<AgentAnswer>('/rag/ask', { question }).then((r) => r.data),

  tvaAsk: (question: string, context?: { turnover?: number; method?: string; sector?: string }) =>
    api.post<AgentAnswer>('/agents/tva/ask', { question, context }).then((r) => r.data),

  classify: (description: string, amount: number, currency = 'CHF') =>
    api
      .post<AgentAnswer>('/rag/classify', { description, amount, currency })
      .then((r) => r.data),

  // Ledger / stats
  transactionStats: () =>
    api.get<TransactionStats>('/transactions/stats/summary').then((r) => r.data),

  ledgerBalance: () => api.get<LedgerBalance>('/ledger/balance').then((r) => r.data),

  ledgerList: (limit = 20) =>
    api.get<LedgerListResponse>('/ledger', { params: { limit } }).then((r) => r.data),

  // Execution layer — formulaires officiels
  generateTvaDecompte: (input: {
    quarter: 1 | 2 | 3 | 4;
    year: number;
    method?: 'effective' | 'tdfn';
    sectorCode?: string;
  }) =>
    api
      .post<TvaDecompteResponse>('/forms/tva-decompte', input)
      .then((r) => r.data),

  generateTvaDecompteAnnual: (input: {
    year: number;
    method?: 'effective' | 'tdfn';
    sectorCode?: string;
  }) =>
    api
      .post<TvaDecompteResponse>('/forms/tva-decompte-annuel', input)
      .then((r) => r.data),

  listTdfnRates: () =>
    api
      .get<{
        version: string;
        authority: string;
        source: string;
        rates: Array<{
          code: string;
          label: string;
          rate: number;
          sector: string;
        }>;
      }>('/forms/tdfn-rates')
      .then((r) => r.data),

  generateVsPpDeclaration: (input: { year: number }) =>
    api
      .post<VsPpDeclarationResponse>('/forms/vs-declaration-pp', input)
      .then((r) => r.data),
};

export type VsPpDeclarationResponse = {
  streamId: string;
  eventId: number;
  idempotent: boolean;
  form: {
    formId: string;
    version: string;
    year: number;
    company: {
      tenantId: string;
      uid: string | null;
      name: string;
      vatNumber: string | null;
      canton: string | null;
      legalForm: string;
    };
    projection: {
      revenuIndependant: number;
      revenuTotal: number;
      fortuneNette: number;
      fraisProForfait: number;
      deductionTotal: number;
      revenuImposable: number;
      eventCount: number;
    };
    generatedAt: string;
  };
  pdf: string;
};

export type TvaDecompteResponse = {
  streamId: string;
  eventId: number;
  idempotent: boolean;
  form: {
    formId: string;
    version: string;
    method: 'effective' | 'tdfn';
    period:
      | {
          kind: 'quarterly';
          quarter: 1 | 2 | 3 | 4;
          year: number;
          start: string;
          end: string;
        }
      | {
          kind: 'annual';
          year: number;
          start: string;
          end: string;
        };
    company: {
      tenantId: string;
      uid: string | null;
      name: string;
      vatNumber: string | null;
      canton: string | null;
      legalForm: string;
    };
    projection: {
      caHt: { standard: number; reduced: number; lodging: number };
      caTtc: { standard: number; reduced: number; lodging: number };
      tvaDue: { standard: number; reduced: number; lodging: number; total: number };
      impotPrealable: { operating: number; capex: number; total: number };
      solde: number;
      caExonere: number;
      eventCount: number;
    };
    generatedAt: string;
    tdfnRate?: {
      code: string;
      label: string;
      rate: number;
      sector: string;
    };
  };
  pdf: string;
  xml: string;
};
