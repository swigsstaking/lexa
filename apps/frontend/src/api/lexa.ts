import { api } from './client';
import type { AuthUser } from '@/stores/authStore';
import type {
  AgentAnswer,
  AgentsResponse,
  BalanceSheet,
  Company,
  CompanyLookupResult,
  CreateCompanyInput,
  FiduciairePortfolio,
  HealthStatus,
  IncomeStatement,
  LedgerBalance,
  LedgerHealth,
  LedgerListResponse,
  LegalForm,
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
      .get<{ user: AuthUser; company: Company | null; hubUserId: string | null }>('/auth/me')
      .then((r) => r.data),

  // V1.2 Google Sign-In — envoie l'idToken Google au backend → Hub → JWT Lexa
  googleAuth: (idToken: string) =>
    api
      .post<{ user: AuthUser; token: string; hubUserId: string }>('/auth/google', { idToken })
      .then((r) => r.data),

  // V1.2 Magic-link — demande un lien de connexion par email (silent anti-énumération)
  magicLink: (email: string) =>
    api
      .post<{ message: string }>('/auth/magic-link', { email })
      .then((r) => r.data),

  // V1.1 SSO — vérifie un ssoToken auprès du backend Lexa (qui le valide auprès du Hub)
  ssoVerify: (ssoToken: string) =>
    api
      .post<{ token: string; user: AuthUser; hubUserId: string }>('/auth/sso-verify', { ssoToken })
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

  lexaAsk: (question: string, tenantId: string, year?: number) =>
    api.post<AgentAnswer>('/agents/lexa/ask', { question, tenantId, year }).then((r) => r.data),

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

  ledgerProcessingStatus: () =>
    api
      .get<{ ingested: number; classified: number; pending: number; estimatedSecondsRemaining: number }>(
        '/ledger/processing-status',
      )
      .then((r) => r.data),

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

  // Preview estimation fiscale — BUG-P2-04 : source unique backend (même barèmes que PDF)
  previewTaxEstimate: (input: {
    canton: string;
    year: number;
    revenuImposable: number;
    civilStatus?: 'single' | 'married';
  }) =>
    api
      .post<{
        icc: number;
        ifd: number;
        total: number;
        effectiveRate: number;
        iccSource: 'official-scale' | 'approximation';
        disclaimer: string;
      }>('/forms/preview/tax-estimate', input)
      .then((r) => r.data),

  // Taxpayers (session 15 wizard)
  getTaxpayerDraft: (year: number) =>
    api
      .get<{ draft: TaxpayerDraft }>(`/taxpayers/draft`, { params: { year } })
      .then((r) => r.data),

  patchTaxpayerField: (input: {
    fiscalYear: number;
    step: number;
    field: string;
    value: unknown;
  }) =>
    api
      .patch<{ draft: TaxpayerDraft }>('/taxpayers/draft/field', input)
      .then((r) => r.data),

  submitTaxpayerDraft: (input: { fiscalYear: number }) =>
    api
      .post<VsPpDeclarationResponse>('/taxpayers/draft/submit', input)
      .then((r) => r.data),

  submitTaxpayerDraftGe: (input: { fiscalYear: number }) =>
    api
      .post<VsPpDeclarationResponse>('/taxpayers/draft/submit-ge', input)
      .then((r) => r.data),

  submitTaxpayerDraftVd: (input: { fiscalYear: number }) =>
    api
      .post<VsPpDeclarationResponse>('/taxpayers/draft/submit-vd', input)
      .then((r) => r.data),

  submitTaxpayerDraftFr: (input: { fiscalYear: number }) =>
    api
      .post<VsPpDeclarationResponse>('/taxpayers/draft/submit-fr', input)
      .then((r) => r.data),

  resetTaxpayerDraft: (input: { fiscalYear: number }) =>
    api.post<{ ok: true }>('/taxpayers/draft/reset', input).then((r) => r.data),

  patchTaxpayerProfile: (input: {
    firstName?: string;
    lastName?: string;
    birthDate?: string;
    civilStatus?: string;
    commune?: string;
    canton?: string;
    childrenCount?: number;
  }) =>
    api.patch<{ ok: true }>('/taxpayers/profile', input).then((r) => r.data),

  // Documents OCR (session 23)
  uploadDocument: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post<UploadDocumentResponse>('/documents/upload', formData, {
        // Ne pas setter Content-Type manuellement — axios gère le boundary multipart
        headers: { 'Content-Type': undefined },
      })
      .then((r) => r.data);
  },

  listDocuments: () =>
    api.get<{ documents: DocumentMeta[] }>('/documents').then((r) => r.data.documents),

  getDocument: (documentId: string) =>
    api.get<DocumentMeta>(`/documents/${documentId}`).then((r) => r.data),

  // Drill-down pièce justificative — télécharge le binaire depuis GridFS avec auth JWT
  downloadDocument: (documentId: string): Promise<Blob> =>
    api
      .get(`/documents/${documentId}/binary`, { responseType: 'blob' })
      .then((r) => r.data as Blob),

  // Lane M — créer écriture comptable depuis document OCR
  createEntryFromDocument: (documentId: string) =>
    api
      .post<{ streamId: string; classification?: unknown; message: string }>(
        `/documents/${documentId}/create-entry`,
      )
      .then((r) => r.data),

  // Session 24 — auto-fill wizard depuis documents OCR
  applyDocumentToDraft: (documentId: string, year: number) =>
    api
      .post<{ ok: boolean; fieldsApplied: string[]; message: string }>(
        `/documents/${documentId}/apply-to-draft`,
        { year },
      )
      .then((r) => r.data),

  getDraftFieldSources: (year: number) =>
    api
      .get<Record<string, { documentId: string; filename: string; appliedAt: string }>>(
        `/taxpayers/draft/${year}/field-sources`,
      )
      .then((r) => r.data),

  // ── PM (Personnes Morales) — Session 27 ──────────────────────────────────

  createCompanyDraft: (year: number, canton: string, legalName: string) =>
    api
      .post<{ id: string; state: CompanyDraftState }>('/companies/draft', { year, canton, legalName })
      .then((r) => r.data),

  getCompanyDraft: (year: number, canton = 'VS') =>
    api
      .get<CompanyDraft>(`/companies/draft/${year}`, { params: { canton } })
      .then((r) => r.data),

  patchCompanyDraft: (year: number, canton: string, path: string, value: unknown) =>
    api
      .patch<{ ok: boolean }>(`/companies/draft/${year}`, { canton, path, value })
      .then((r) => r.data),

  submitCompanyDraftVs: (year: number) =>
    api
      .post<PmSubmitResponse>(`/companies/draft/${year}/submit-vs`)
      .then((r) => r.data),

  /** Générique : submit pour n'importe quel canton PM (VS, GE, VD, FR) — Session 28 */
  submitCompanyDraft: (year: number, canton: string) =>
    api
      .post<PmSubmitResponse>(`/companies/draft/${year}/submit-${canton.toLowerCase()}`)
      .then((r) => r.data),

  // ── Continuous Closing (session 29) ─────────────────────────────────────────
  getBalanceSheet: (year: number) =>
    api.get<BalanceSheet>(`/ledger/balance-sheet/${year}`).then((r) => r.data),

  getIncomeStatement: (year: number) =>
    api.get<IncomeStatement>(`/ledger/income-statement/${year}`).then((r) => r.data),

  getLedgerHealth: (year: number) =>
    api.get<LedgerHealth>(`/ledger/health/${year}`).then((r) => r.data),

  askCloture: (body: {
    question: string;
    year?: number;
    balanceSheet?: { assetsTotal: number; liabilitiesTotal: number; equityTotal: number; isBalanced: boolean };
    incomeStatement?: { revenuesTotal: number; chargesTotal: number; netResult: number };
  }) =>
    api.post<AgentAnswer>('/agents/cloture/ask', body).then((r) => r.data),

  // Audit (session 30)
  askAudit: (body: {
    question: string;
    year?: number;
    context?: {
      recentDecisions?: Array<{
        agent: string;
        confidence: number;
        citations: Array<{ law: string; article: string }>;
      }>;
    };
  }) =>
    api.post<AgentAnswer & { disclaimer: string }>('/agents/audit/ask', body).then((r) => r.data),

  verifyCitations: (citations: Array<{ law: string; article: string }>) =>
    api
      .post<{
        results: Array<{
          citation: { law: string; article: string };
          verified: boolean;
          matchedText?: string;
          matchedArticle?: string;
          score?: number;
          searchedQuery: string;
          note?: string;
        }>;
        stats: { total: number; verified: number; unverified: number };
        durationMs: number;
      }>('/audit/verify-citations', { citations })
      .then((r) => r.data),

  getAuditTrail: (year: number) =>
    api
      .get<{
        tenantId: string;
        year: number;
        events: Array<{
          eventId: number;
          streamId: string;
          occurredAt: string;
          type: string;
          description?: string;
          amount?: number;
          currency?: string;
          aiDecision?: {
            id: string;
            agent: string;
            model: string;
            confidence: number;
            reasoning?: string;
            citations: Array<{ law: string; article: string; rs?: string }>;
          };
        }>;
        stats: {
          totalEvents: number;
          totalAiDecisions: number;
          averageConfidence: number | null;
          citationsCount: number;
          lowConfidenceCount: number;
          eventTypes: Record<string, number>;
        };
        legalBasis: { conservation: string; tva: string };
        generatedAt: string;
      }>(`/audit/trail/${year}`)
      .then((r) => r.data),

  // Conseiller agent (session 31)
  askConseiller: (input: {
    question: string;
    year?: number;
    context?: {
      canton?: 'VS' | 'GE' | 'VD' | 'FR';
      entityType?: 'pp' | 'pm';
      civilStatus?: 'single' | 'married';
      currentIncome?: number;
      companyProfit?: number;
    };
  }) =>
    api
      .post<{
        answer: string;
        citations: Array<{ law: string; article: string; heading?: string; score: number; url?: string }>;
        disclaimer: string;
        durationMs: number;
        model: string;
      }>('/agents/conseiller/ask', input)
      .then((r) => r.data),

  // Simulations fiscales (session 31)
  simulateRachatLpp: (input: {
    canton: 'VS' | 'GE' | 'VD' | 'FR';
    year: number;
    currentIncome: number;
    additionalLppPurchase: number;
    civilStatus?: 'single' | 'married';
  }) =>
    api
      .post<{
        additionalLppPurchase: number;
        baseTax: number;
        afterLppTax: number;
        savings: number;
        effectiveSavingsRate: number;
        incomeAfterDeduction: number;
        citation: { law: string; article: string; alinea: string };
        disclaimer: string;
      }>('/simulate/rachat-lpp', input)
      .then((r) => r.data),

  simulatePilier3a: (input: {
    canton: 'VS' | 'GE' | 'VD' | 'FR';
    year: number;
    currentIncome: number;
    current3a: number;
    target3a: number;
    hasLpp?: boolean;
    civilStatus?: 'single' | 'married';
  }) =>
    api
      .post<{
        current3a: number;
        target3a: number;
        additionalContribution: number;
        cappedAdditionalContribution: number;
        baseTax: number;
        afterTax: number;
        savings: number;
        effectiveSavingsRate: number;
        plafond2026: number;
        citation: { law: string; article: string; alinea: string };
        disclaimer: string;
      }>('/simulate/pilier-3a', input)
      .then((r) => r.data),

  simulateDividendVsSalary: (input: {
    amountAvailable: number;
    shareholderMarginalRate: number;
    canton: 'VS' | 'GE' | 'VD' | 'FR';
    legalForm: 'sarl' | 'sa';
  }) =>
    api
      .post<{
        amountAvailable: number;
        salary: {
          grossToEmployee: number;
          avsEmployeeCharge: number;
          avsEmployerCharge: number;
          taxableIncome: number;
          incomeTax: number;
          netInHand: number;
          companyCost: number;
        };
        dividend: {
          corporateTaxIfd: number;
          corporateTaxCantonal: number;
          dividendPayable: number;
          dividendTax: number;
          netInHand: number;
        };
        recommendation: 'dividend' | 'salary' | 'equal';
        savingsByDividend: number;
        citations: Array<{ law: string; article?: string; alinea?: string; note?: string }>;
        disclaimer: string;
      }>('/simulate/dividend-vs-salary', input)
      .then((r) => r.data),

  // ── CAMT.053 — Import relevé bancaire XML (Lane O) ───────────────────────
  uploadCamt053: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<{
        ingested: number;
        skipped: number;
        failed: number;
        transactionsCount: number;
        accountIban?: string;
        accountName?: string;
        currency?: string;
        warnings?: string[];
      }>(
        '/connectors/camt053/upload',
        form,
        { headers: { 'Content-Type': undefined } },
      )
      .then((r) => r.data);
  },

  // ── Onboarding — ajouter un compte additionnel ───────────────────────────

  addAccount: (input: {
    name: string;
    legalForm: LegalForm;
    canton?: string;
    isVatSubject?: boolean;
    vatNumber?: string;
  }) =>
    api
      .post<{ tenantId: string; company: Company; token: string }>('/onboarding/add-account', input)
      .then((r) => r.data),

  // ── Fiduciary — mode multi-clients (S32) ──────────────────────────────────

  listFiduciaryClients: () =>
    api
      .get<{ clients: Array<{ tenantId: string; role: string; tenantName: string | null; addedAt: string }> }>('/fiduciary/clients')
      .then((r) => r.data.clients),

  getPortfolio: () =>
    api
      .get<FiduciairePortfolio>('/fiduciary/portfolio')
      .then((r) => r.data),

  switchTenant: (tenantId: string) =>
    api
      .post<{ token: string; activeTenantId: string }>('/auth/switch-tenant', { tenantId })
      .then((r) => r.data),

  // ── Briefings quotidiens conseiller (session briefing-quotidien) ──────────

  listBriefings: (limit = 7) =>
    api
      .get<{
        briefings: Array<{
          id: string;
          date_for: string;
          markdown: string;
          content: unknown;
          read_at: string | null;
          generated_at: string;
        }>;
      }>(`/conseiller/briefings?limit=${limit}`)
      .then((r) => r.data),

  markBriefingRead: (id: string) =>
    api.patch<{ ok: boolean }>(`/conseiller/briefings/${id}/read`).then((r) => r.data),

  generateBriefingNow: (year?: number) =>
    api
      .post<{ ok: boolean; message: string }>('/conseiller/briefings/generate-now', { year })
      .then((r) => r.data),

  // ── Export XML eCH-0119 (PP) / eCH-0229 (PM) ─────────────────────────────

  /**
   * Télécharge la déclaration PP au format XML eCH-0119 v4.0.0.
   * Standard suisse officiel : https://www.ech.ch/fr/ech/ech-0119/4.0.0
   */
  exportTaxpayerXml: (year: number, canton: string): Promise<Blob> =>
    api
      .get(`/taxpayers/draft/${year}/export-xml`, {
        params: { canton },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  /**
   * Télécharge la déclaration PM au format XML eCH-0229 (best-effort).
   * À valider contre XSD officiel lorsque eCH-0229 sera publié.
   */
  exportCompanyXml: (year: number, canton: string): Promise<Blob> =>
    api
      .get(`/companies/draft/${year}/export-xml`, {
        params: { canton },
        responseType: 'blob',
      })
      .then((r) => r.data as Blob),

  // ── Intégrations Pro (Phase 3 V1.1) ─────────────────────────────────────

  getProSyncSettings: () =>
    api
      .get<{
        enabled: boolean;
        disabledAt: string | null;
        disabledReason: string | null;
      }>('/settings/integrations/pro')
      .then((r) => r.data),

  setProSyncSettings: (enabled: boolean, reason?: string) =>
    api
      .put<{ ok: boolean; enabled: boolean; disabledAt: string | null; disabledReason: string | null }>(
        '/settings/integrations/pro',
        { enabled, reason },
      )
      .then((r) => r.data),

  syncProData: (hubUserId?: string) =>
    api
      .post<{
        ok: boolean;
        hubUserId: string;
        invoicesProcessed: number;
        expensesProcessed: number;
        bankTxProcessed: number;
        ingested: { created: number; sent: number; paid: number; expenses: number; bankTransactions: number };
      }>(
        '/settings/integrations/pro/sync',
        hubUserId ? { hubUserId } : {},
      )
      .then((r) => r.data),

  getProStats: () =>
    api
      .get<{
        invoicesCreated: number;
        invoicesPaid: number;
        invoicesUnpaid: number;
        caTotal: number;
        expensesCount: number;
        expensesTotal: number;
        bankTransactionsCount: number;
        bankTransactionsIn: number;
        bankTransactionsOut: number;
        lastEventAt: string | null;
      }>('/settings/integrations/pro/stats')
      .then((r) => r.data),

  // ── Email forward settings (Phase 1 V1.2) ────────────────────────────────

  getEmailForwardSettings: () =>
    api
      .get<{
        token: string;
        enabled: boolean;
        forwardAddress: string;
        lastEmailAt: string | null;
      }>('/settings/email-forward')
      .then((r) => r.data),

  regenerateEmailForwardToken: () =>
    api
      .post<{ token: string; forwardAddress: string }>('/settings/email-forward/regenerate')
      .then((r) => r.data),

  toggleEmailForward: (enabled: boolean) =>
    api
      .patch<{ ok: boolean; enabled: boolean }>('/settings/email-forward/toggle', { enabled })
      .then((r) => r.data),

  listEmailForwardHistory: (limit = 20) =>
    api
      .get<{
        emails: Array<{
          id: string;
          from_address: string;
          subject: string;
          attachments_count: number;
          received_at: string;
          status: 'processed' | 'ignored' | 'error';
        }>;
      }>(`/settings/email-forward/history?limit=${limit}`)
      .then((r) => r.data),

  // ── V1.1 — Édition écritures grand livre (migration 021) ─────────────────

  createLedgerEntry: (body: {
    date: string;
    description: string;
    debitAccount: string;
    creditAccount: string;
    amountTtc: number;
    amountHt?: number;
    tvaRate?: number;
    tvaCode?: string;
    costCenter?: string;
    reasoning?: string;
  }) =>
    api.post<{ streamId: string; message: string }>('/ledger/entries', body).then((r) => r.data),

  correctLedgerEntry: (
    streamId: string,
    body: {
      debitAccount?: string;
      creditAccount?: string;
      amountTtc?: number;
      description?: string;
      reasoning: string;
    },
  ) =>
    api
      .patch<{ streamId: string; message: string }>(`/ledger/entries/${streamId}/correct`, body)
      .then((r) => r.data),

  lettrerEntries: (streamIds: string[], letterRef?: string) =>
    api
      .post<{ letterRef: string; message: string }>('/ledger/lettrage', { streamIds, letterRef })
      .then((r) => r.data),

  unlettrerEntries: (letterRef: string) =>
    api
      .delete<{ message: string }>(`/ledger/lettrage/${letterRef}`)
      .then((r) => r.data),

  getLedgerEntryHistory: (streamId: string) =>
    api
      .get<{
        streamId: string;
        events: Array<{
          eventId: number;
          type: string;
          occurredAt: string;
          description?: string;
          debitAccount?: string;
          creditAccount?: string;
          amount?: number;
          reasoning?: string;
        }>;
      }>(`/ledger/entries/${streamId}/history`)
      .then((r) => r.data),

  // ── PP (Personne Physique) — workspace données réelles ───────────────────

  getPpSummary: (year: number) =>
    api
      .get<PpSummary>('/pp/summary', { params: { year } })
      .then((r) => r.data),
};

export type TaxpayerDraft = {
  id: string;
  tenantId: string;
  fiscalYear: number;
  state: {
    step1: {
      firstName?: string;
      lastName?: string;
      dateOfBirth?: string;
      civilStatus?:
        | 'single'
        | 'married'
        | 'registered_partnership'
        | 'divorced'
        | 'separated'
        | 'widowed';
      childrenCount?: number;
      commune?: string;
      canton: 'VS' | 'GE' | 'VD' | string;
      // VD-specific: coefficient communal (ex: Lausanne 2026 = 79)
      coefficientCommunal?: number;
    };
    step2: {
      isSalarie?: boolean;
      salaireBrut?: number;
      hasSwissdecCertificate?: boolean;
      revenusAccessoires?: number;
      rentesAvs?: number;
      rentesLpp?: number;
      rentes3ePilier?: number;
      allocations?: number;
      revenusTitres?: number;
      revenusImmobiliers?: number;
    };
    step3: {
      comptesBancaires?: number;
      titresCotes?: number;
      titresNonCotes?: number;
      immeublesValeurFiscale?: number;
      immeublesEmprunt?: number;
      vehicules?: number;
      autresBiens?: number;
      dettes?: number;
    };
    step4: {
      pilier3a?: number;
      primesAssurance?: number;
      fraisProFormat?: 'forfait' | 'reel';
      fraisProReels?: number;
      interetsPassifs?: number;
      rachatsLpp?: number;
      fraisMedicaux?: number;
      dons?: number;
    };
  };
  currentStep: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
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

// ── Types documents OCR (session 23) ────────────────────────────────────────

export type OcrResult = {
  rawText: string;
  extractionMethod: 'pdf-parse' | 'qwen3-vl-ocr';
  ocrConfidence: number;
  type: 'certificat_salaire' | 'attestation_3a' | 'facture' | 'releve_bancaire' | 'autre';
  extractedFields: Record<string, unknown>;
  durationMs: number;
};

export type DocumentMeta = {
  documentId: string;
  tenantId: string;
  filename: string;
  mimetype: string;
  size: number;
  uploadedAt: string;
  ocrResult: OcrResult;
  /** Vrai si une écriture comptable a déjà été créée depuis ce document (cross-check events). */
  hasLinkedEntry?: boolean;
  /** Source du document — "swigs-pro" pour les events Pro virtuels (Phase 3 V1.1) */
  source?: 'swigs-pro' | 'ocr' | 'camt053' | 'imap';
  /** Référence facture Pro (si source === "swigs-pro") */
  proInvoiceNumber?: string;
  /** ID facture Pro */
  proInvoiceId?: string;
  /** ID dépense Pro */
  proExpenseId?: string;
  /** Event Pro source ("invoice.created", "invoice.paid", etc.) */
  sourceEvent?: string;
  /** Stream ID lié dans l'event store */
  linkedStreamId?: string;
};

export type UploadDocumentResponse = {
  documentId: string;
  filename: string;
  ocrResult: OcrResult;
};

// ── Types PM — Personnes Morales (session 27) ───────────────────────────────

export type CompanyDraftState = {
  step1?: {
    legalName?: string;
    legalForm?: 'sarl' | 'sa' | 'association' | 'fondation';
    ideNumber?: string;
    siegeStreet?: string;
    siegeZip?: string;
    siegeCommune?: string;
    fiscalYearStart?: string;
    fiscalYearEnd?: string;
  };
  step2?: {
    chiffreAffaires?: number;
    produits?: number;
    chargesPersonnel?: number;
    chargesMaterielles?: number;
    amortissementsComptables?: number;
    autresCharges?: number;
    benefitAccounting?: number;
  };
  step3?: {
    chargesNonAdmises?: number;
    provisionsExcessives?: number;
    amortissementsExcessifs?: number;
    reservesLatentes?: number;
    autresCorrections?: number;
  };
  step4?: {
    capitalSocial?: number;
    reservesLegales?: number;
    reservesLibres?: number;
    reportBenefice?: number;
    capitalTotal?: number;
  };
};

export type CompanyDraft = {
  id: string;
  tenantId: string;
  year: number;
  canton: string;
  state: CompanyDraftState;
  createdAt: string;
  updatedAt: string;
};

export type PmTaxEstimate = {
  benefit: number;
  capital: number;
  ifd: number;
  icc: number;
  capitalTax: number;
  total: number;
  effectiveRate: number;
  disclaimer: string;
};

export type PmSubmitResponse = {
  formId: string;
  pdfBase64: string;
  structuredData: {
    formId: string;
    version: string;
    year: number;
    benefitImposable: number;
    taxEstimate: PmTaxEstimate;
    citations: Array<{ law: string; article: string; text: string }>;
  };
  taxEstimate: PmTaxEstimate;
  citations: Array<{ law: string; article: string; text: string }>;
};

// ── Types PP — Personne Physique workspace ───────────────────────────────────

export type PpTone = 'pos' | 'neg' | 'tax' | 'asset';

export type PpItem = {
  code: string;
  name: string;
  amount: number;
  count: number;
  tone: PpTone;
};

export type PpBucket = {
  k: string;
  items: PpItem[];
};

export type PpSummary = {
  buckets: PpBucket[];
  fiscalYear: number;
};
