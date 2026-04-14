export type LegalForm =
  | 'raison_individuelle'
  | 'sa'
  | 'sarl'
  | 'cooperative'
  | 'association'
  | 'fondation'
  | 'autre';

export interface CompanyLookupResult {
  uid: string;
  name: string;
  legalForm: LegalForm;
  legalFormLabel: string;
  street?: string;
  zip?: string;
  city?: string;
  canton?: string;
  country?: string;
  isVatSubject?: boolean;
}

export interface Company {
  id: string;
  tenantId: string;
  uid?: string | null;
  name: string;
  legalForm: LegalForm;
  legalFormLabel?: string;
  street?: string;
  zip?: string;
  city?: string;
  canton?: string;
  country?: string;
  email?: string;
  phone?: string;
  iban?: string;
  qrIban?: string;
  isVatSubject: boolean;
  vatNumber?: string;
  vatDeclarationFrequency?: 'monthly' | 'quarterly' | 'semesterly' | 'yearly';
  vatMethod?: 'effective' | 'tdfn' | 'forfaitaire';
  fiscalYearStartMonth?: number;
  employeeCount?: number;
  source: 'uid-register' | 'swigs-pro' | 'manual';
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCompanyInput {
  source: 'uid-register' | 'manual';
  uid?: string;
  name: string;
  legalForm: LegalForm;
  legalFormLabel?: string;
  street?: string;
  zip?: string;
  city?: string;
  canton?: string;
  country?: string;
  email?: string;
  phone?: string;
  iban?: string;
  qrIban?: string;
  isVatSubject?: boolean;
  vatNumber?: string;
  vatDeclarationFrequency?: Company['vatDeclarationFrequency'];
  vatMethod?: Company['vatMethod'];
  fiscalYearStartMonth?: number;
}

export interface HealthStatus {
  ok: boolean;
  version: string;
  env: string;
  services: {
    postgres: boolean;
    qdrant: boolean;
    qdrantPoints: number;
    ollama: boolean;
    embedder: boolean;
  };
}

export interface AgentInfo {
  id: string;
  endpoint?: string;
  model?: string;
  description: string;
}

export interface AgentsResponse {
  agents: AgentInfo[];
  planned: AgentInfo[];
}

export interface RagCitation {
  law?: string;
  article?: string;
  heading?: string;
  url?: string;
  score?: number;
  source?: string;
  title?: string;
  text?: string;
  [key: string]: unknown;
}

export interface AgentAnswer {
  answer: string;
  citations?: RagCitation[];
  durationMs?: number;
}

export interface LedgerAccount {
  account: string;
  debitCount: number;
  creditCount: number;
  totalDebit: number;
  totalCredit: number;
  balance: number;
}

export interface LedgerBalance {
  tenantId: string;
  accountsCount: number;
  accounts: LedgerAccount[];
}

export interface LedgerEntry {
  eventId: number;
  streamId: string;
  date: string;
  occurredAt: string;
  description: string;
  source: string;
  currency: string;
  lineType: 'debit' | 'credit';
  account: string;
  amount: number;
  counterpartAccount?: string;
  amountHt?: number;
  amountTtc?: number;
  tvaRate?: number;
  tvaCode?: string;
  confidence?: number;
}

export interface LedgerListResponse {
  tenantId: string;
  count: number;
  entries: LedgerEntry[];
}

export interface TransactionStats {
  tenantId: string;
  total: number;
  byType: Record<string, number>;
}
