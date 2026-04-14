import { api } from './client';
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

export const lexa = {
  health: () => api.get<HealthStatus>('/health').then((r) => r.data),

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
  }) =>
    api
      .post<{
        streamId: string;
        eventId: number;
        form: {
          formId: string;
          version: string;
          method: 'effective' | 'tdfn';
          period: { quarter: 1 | 2 | 3 | 4; year: number; start: string; end: string };
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
            tvaDue: { standard: number; reduced: number; lodging: number; total: number };
            impotPrealable: { operating: number; capex: number; total: number };
            solde: number;
            caExonere: number;
            eventCount: number;
          };
          generatedAt: string;
        };
        pdf: string;
        xml: string;
      }>('/forms/tva-decompte', input)
      .then((r) => r.data),
};
