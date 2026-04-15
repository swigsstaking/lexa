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
      type: "TaxpayerFieldUpdated";
      payload: {
        fiscalYear: number;
        step: number;
        field: string;
        value: unknown;
        updatedBy: string;
      };
    }
  | {
      type: "DeclarationGenerated";
      payload: {
        formId: string;
        version: string;
        /**
         * Type de formulaire : "tva" pour TVA AFC (trimestriel/annuel,
         * effective/TDFN), "vs-pp" pour déclaration fiscale PP Valais.
         * Session 14+ : "ge-pp", "vs-pm", etc.
         */
        formKind: "tva" | "vs-pp";
        /**
         * Méthode TVA (effective/tdfn) — absent pour les formulaires non-TVA.
         */
        method?: "effective" | "tdfn";
        /**
         * Période du décompte. `quarter` est optionnel : absent pour les
         * décomptes annuels et VS-PP (annuel par construction).
         */
        period: {
          quarter?: 1 | 2 | 3 | 4;
          year: number;
          start: string;
          end: string;
        };
        /**
         * Totals génériques — structure dépendant de formKind :
         * - TVA : caHt, tvaDueTotal, impotPrealableTotal, solde
         * - VS-PP : revenuTotal, fortuneNette, revenuImposable
         */
        totals: Record<string, unknown>;
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
