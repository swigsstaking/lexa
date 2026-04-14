// Lexa — Event types (session 06 minimal set)

export type Citation = {
  law: string;
  article: string | null;
  rs?: string | null;
  heading?: string;
  score?: number;
};

export type LexaEvent =
  | {
      type: "TransactionIngested";
      payload: {
        source: "camt053" | "ocr" | "manual" | "swigs-pro";
        date: string; // ISO date
        description: string;
        amount: number; // positive = credit, negative = debit (bank view)
        currency: string;
        counterpartyIban?: string;
        documentId?: string;
      };
    }
  | {
      type: "TransactionClassified";
      payload: {
        transactionStreamId: string;
        agent: string;
        model: string;
        confidence: number;
        debitAccount: string;
        creditAccount: string;
        amountHt: number;
        amountTtc: number;
        tvaRate: number;
        tvaCode: string;
        costCenter?: string;
        reasoning: string;
        citations: Citation[];
        alternatives?: Array<{ account: string; confidence: number }>;
      };
    }
  | {
      type: "ClassificationValidatedByUser";
      payload: {
        transactionStreamId: string;
        userId: string;
        correction?: {
          debitAccount?: string;
          creditAccount?: string;
          tvaRate?: number;
        };
      };
    }
  | {
      type: "DeclarationGenerated";
      payload: {
        formId: string;
        version: string;
        method: "effective" | "tdfn";
        period: { quarter: 1 | 2 | 3 | 4; year: number; start: string; end: string };
        totals: {
          caHt: { standard: number; reduced: number; lodging: number };
          tvaDueTotal: number;
          impotPrealableTotal: number;
          solde: number;
        };
        eventCount: number;
        generatedBy: "lexa";
        liability: "preparation_only";
      };
    };

export type LexaEventType = LexaEvent["type"];

export type EventRecord<T extends LexaEvent = LexaEvent> = {
  id: number;
  tenantId: string;
  streamId: string;
  sequence: number;
  type: T["type"];
  payload: T["payload"];
  metadata: Record<string, unknown>;
  occurredAt: Date;
  recordedAt: Date;
};
