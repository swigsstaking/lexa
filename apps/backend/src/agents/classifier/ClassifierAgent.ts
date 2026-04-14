import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { config } from "../../config/index.js";
import type { Citation } from "../../events/types.js";

export type BankTransaction = {
  date: string;
  description: string;
  amount: number; // bank view (negative = debit for us = charge)
  currency: string;
  counterpartyIban?: string;
};

export type ClassificationResult = {
  debitAccount: string;
  creditAccount: string;
  amountHt: number;
  amountTtc: number;
  tvaRate: number;
  tvaCode: string;
  costCenter: string;
  confidence: number;
  reasoning: string;
  citations: Citation[];
  alternatives: Array<{ account: string; confidence: number }>;
  rawOllamaResponse: string;
  durationMs: number;
};

export class ClassifierAgent {
  private model: string;

  constructor(model: string = config.MODEL_CLASSIFIER) {
    this.model = model;
  }

  async classify(transaction: BankTransaction): Promise<ClassificationResult> {
    const started = Date.now();

    // 1. Build a query for the RAG from the transaction
    const query = `classification comptable suisse: ${transaction.description} ${Math.abs(transaction.amount)} ${transaction.currency}`;

    // 2. Embed and fetch relevant Käfer/law context
    const qVec = await embedder.embedOne(query);
    const hits = await qdrant.search({ vector: qVec, limit: 5 });

    // 3. Build context
    const contextLines = hits.map((h, i) => {
      const p = h.payload;
      return `${i + 1}. [${p.law} ${p.article}] ${p.heading ?? ""}\n${p.text.slice(0, 500)}`;
    });
    const context = contextLines.join("\n\n");

    // 4. Craft the classification prompt
    const isDebit = transaction.amount < 0;
    const absAmount = Math.abs(transaction.amount);

    const prompt = `Tu es un agent de classification comptable suisse. Tu classifies une transaction bancaire selon le plan comptable PME suisse (Kafer).

TRANSACTION:
- Date: ${transaction.date}
- Description: ${transaction.description}
- Montant: ${absAmount} ${transaction.currency} (${isDebit ? "sortie" : "entree"})
${transaction.counterpartyIban ? `- Contrepartie IBAN: ${transaction.counterpartyIban}` : ""}

CONTEXTE JURIDIQUE (pertinent):
${context}

INSTRUCTIONS:
Reponds UNIQUEMENT en JSON valide (sans markdown, sans commentaires), avec cette structure exacte:
{
  "debit_account": "XXXX - Nom du compte",
  "credit_account": "YYYY - Nom du compte",
  "tva_rate": 8.1,
  "tva_code": "TVA-standard",
  "cost_center": "general",
  "confidence": 0.85,
  "reasoning": "Explication courte de la classification",
  "citations": [
    {"law": "LTVA", "article": "Art. 25", "rs": "641.20"}
  ],
  "alternatives": [
    {"account": "ZZZZ - Autre compte possible", "confidence": 0.3}
  ]
}

Utilise le plan Kafer (1000 Caisse, 1020 Banque, 1100 Debiteurs, 2000 Creanciers, 3000 Ventes, 4000 Achats, 5000 Salaires, 6000 Loyers, etc.).
Pour une ${isDebit ? "sortie" : "entree"} bancaire, le compte 1020 Banque est en ${isDebit ? "credit" : "debit"}.

REPONSE JSON:`;

    const { response } = await ollama.generate({
      model: this.model,
      prompt,
      temperature: 0.1,
      numCtx: 8192,
      numPredict: 500,
    });

    // 5. Parse the JSON output robustly
    const parsed = this.parseClassificationJson(response);

    // 6. Compute amounts with TVA
    const tvaRate = parsed.tva_rate ?? 8.1;
    const amountTtc = absAmount;
    const amountHt = tvaRate > 0 ? amountTtc / (1 + tvaRate / 100) : amountTtc;

    return {
      debitAccount: parsed.debit_account ?? "UNKNOWN",
      creditAccount: parsed.credit_account ?? "UNKNOWN",
      amountHt: Number(amountHt.toFixed(2)),
      amountTtc: Number(amountTtc.toFixed(2)),
      tvaRate,
      tvaCode: parsed.tva_code ?? "TVA-standard",
      costCenter: parsed.cost_center ?? "general",
      confidence: Math.max(0, Math.min(1, parsed.confidence ?? 0.5)),
      reasoning: parsed.reasoning ?? "",
      citations: Array.isArray(parsed.citations) ? parsed.citations : [],
      alternatives: Array.isArray(parsed.alternatives) ? parsed.alternatives : [],
      rawOllamaResponse: response,
      durationMs: Date.now() - started,
    };
  }

  private parseClassificationJson(text: string): Record<string, unknown> & {
    debit_account?: string;
    credit_account?: string;
    tva_rate?: number;
    tva_code?: string;
    cost_center?: string;
    confidence?: number;
    reasoning?: string;
    citations?: Citation[];
    alternatives?: Array<{ account: string; confidence: number }>;
  } {
    // Try to extract JSON from the response (models sometimes wrap it in markdown)
    const cleaned = text
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```\s*$/i, "")
      .trim();

    const jsonStart = cleaned.indexOf("{");
    const jsonEnd = cleaned.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) {
      return { confidence: 0, reasoning: "Failed to parse model output: no JSON found" };
    }

    const jsonSlice = cleaned.slice(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(jsonSlice);
    } catch (err) {
      return {
        confidence: 0,
        reasoning: `JSON parse error: ${(err as Error).message}. Raw: ${jsonSlice.slice(0, 200)}`,
      };
    }
  }
}

export const classifierAgent = new ClassifierAgent();
