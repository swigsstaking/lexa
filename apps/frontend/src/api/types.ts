export type LegalForm =
  | 'raison_individuelle'
  | 'societe_simple'
  | 'snc'
  | 'senc'
  | 'sa'
  | 'sca'
  | 'sarl'
  | 'cooperative'
  | 'association'
  | 'fondation'
  | 'sa_etrangere'
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
  documentId?: string | null; // Pièce justificative OCR — drill-down (migration 012)
  reconciles?: string | null; // stream_id de la facture originale liée — reconciliation (migration 015)
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

// ─── Continuous Closing types (session 29) ────────────────────────────────────

export interface ClosingAccountLine {
  account: string;
  accountName: string | null;
  balance: number;
}

export interface BalanceSheet {
  year: number;
  asOf: string;
  assets: ClosingAccountLine[];
  assetsTotal: number;
  liabilities: ClosingAccountLine[];
  liabilitiesTotal: number;
  equity: ClosingAccountLine[];
  equityTotal: number;
  isBalanced: boolean;
}

export interface IncomeStatement {
  year: number;
  period: { start: string; end: string };
  revenues: ClosingAccountLine[];
  revenuesTotal: number;
  charges: ClosingAccountLine[];
  chargesTotal: number;
  financialResult: number;
  extraordinaryResult: number;
  netResult: number;
}

export type LedgerGapType = 'missing_depreciation' | 'missing_accrual' | 'orphan_entry' | 'unbalanced';
export type LedgerGapSeverity = 'info' | 'warning' | 'error';

export interface LedgerGap {
  type: LedgerGapType;
  severity: LedgerGapSeverity;
  message: string;
}

export interface LedgerHealth {
  year: number;
  entriesCount: number;
  lastEntryDate: string | null;
  isBalanced: boolean;
  gaps: LedgerGap[];
  co_959c_ready: boolean;
}
