import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";
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

/** System prompt Käfer extrait en constante pour réutilisation chat-style (vLLM) */
const SYSTEM_PROMPT_CLASSIFIER = `Tu es un agent de classification comptable suisse. Tu classifies une transaction bancaire selon le plan comptable PME suisse (Kafer).
Reponds UNIQUEMENT en JSON valide (sans markdown, sans commentaires), avec EXACTEMENT ces cles:
{"debit_account":"XXXX - Nom","credit_account":"YYYY - Nom","tva_rate":8.1,"tva_code":"TVA-standard","cost_center":"general","confidence":0.85,"reasoning":"court","citations":[{"law":"LTVA","article":"Art.25","rs":"641.20"}],"alternatives":[{"account":"ZZZZ - Nom","confidence":0.3}]}
IMPORTANT: utiliser "debit_account" et "credit_account" (avec _account), jamais "debit"/"credit" seuls.

PLAN KAFER (comptes cles):
1000 Caisse / 1020 Banque / 1100 Debiteurs / 1170 TVA deductible / 1510 Mobilier / 1530 Vehicules
2000 Creanciers / 2100 Dettes CT / 2200 TVA due / 2270 Impots / 2300 Emprunts LT
3000 Ventes / 3200 Prestations services / 4000 Achats / 5000 Salaires / 5700 Charges sociales / 5800 Autres charges personnel
6000 Loyers / 6200 Assurances / 6400 Representation / 6500 Frais admin et telecom / 6800 Charges financieres (frais bancaires interets)
7500 Produits financiers (interets recus)

REGLES CRITIQUES — appliquer en priorite absolue:
R1 FRAIS BANCAIRES: frais tenue compte, commissions, agios UBS/CS/PostFinance → debit_account:6800 (PAS 6500). 6500=telecom/admin.
R2 VIREMENT CLIENT: encaissement facture emise (amount>0, contrepartie=client) → credit_account:3200 (PAS 1100). 1100=OD internes uniquement.
R3 TVA AFC: paiement AFC/administration federale contributions → debit_account:2200 (PAS 2270 Impots).
R4 SORTIE bancaire: credit_account=1020. ENTREE bancaire: debit_account=1020.
R5 DESCRIPTION DUPLIQUEE: si la description contient "X | Y | Z" avec repetition du meme nom (ex: "Acme SA | Acme SA | Acme SA"), traiter comme "Acme SA" simple. Les barres verticales separent counterpartyName / reference / structuredRef cote Swigs Pro — ignorer les duplicates.
R6 REFERENCES SCOR/RF: les codes type "RF80R001920260207" ou "SCOR/RF" dans la description sont des references de paiement suisses — classer comme virement client entrant (debit_account:1020, credit_account:3200).

EXEMPLES (few-shot — cles exactes a utiliser):
desc="Paiement loyer bureau" amt=-4500 cp="REGIE" → {"debit_account":"6000","credit_account":"1020","confidence":0.98}
desc="Salaire net" amt=-5200 cp="DUPONT JEAN" → {"debit_account":"5000","credit_account":"1020","confidence":0.97}
desc="Frais de tenue de compte" amt=-25 cp="UBS" → {"debit_account":"6800","credit_account":"1020","confidence":0.95}
desc="Commission virement" amt=-8 cp="POSTFINANCE" → {"debit_account":"6800","credit_account":"1020","confidence":0.96}
desc="Virement client facture F-2026-01" amt=+8500 cp="ACME SARL" → {"debit_account":"1020","credit_account":"3200","confidence":0.92}
desc="Paiement client" amt=+3200 cp="MARTIN SA" → {"debit_account":"1020","credit_account":"3200","confidence":0.90}
desc="Decompte TVA trimestre" amt=-3200 cp="ADMIN FED CONTRIBUTIONS" → {"debit_account":"2200","credit_account":"1020","confidence":0.98}
desc="Facture fournisseur materiaux" amt=-1800 cp="METAL SUISSE SA" → {"debit_account":"4000","credit_account":"1020","confidence":0.95}
desc="Interet creancier banque" amt=+12.50 cp="UBS" → {"debit_account":"1020","credit_account":"7500","confidence":0.97}
desc="Achat mobilier bureau" amt=-2100 cp="IKEA" → {"debit_account":"1510","credit_account":"1020","confidence":0.95}
desc="Paiement Swisscom mobile" amt=-89 cp="SWISSCOM" → {"debit_account":"6500","credit_account":"1020","confidence":0.92}
desc="Prime assurance RC pro" amt=-890 cp="HELVETIA" → {"debit_account":"6200","credit_account":"1020","confidence":0.96}
desc="Remboursement note de frais" amt=-450 cp="EMPLOYE NOM" → {"debit_account":"5800","credit_account":"1020","confidence":0.88}
desc="Versement AVS/AI LPP" amt=-2100 cp="CAISSE AVS" → {"debit_account":"5700","credit_account":"1020","confidence":0.95}
desc="Retrait DAB especes" amt=-500 cp="ATM UBS" → {"debit_account":"1000","credit_account":"1020","confidence":0.97}
desc="Amortissement pret bancaire" amt=-3000 cp="UBS CREDIT" → {"debit_account":"2300","credit_account":"1020","confidence":0.93}
desc="Achat vehicule utilitaire" amt=-28000 cp="GARAGE AUTO" → {"debit_account":"1530","credit_account":"1020","confidence":0.95}
desc="Virement client RF80R001920260207" amt=+12000 cp="" → {"debit_account":"1020","credit_account":"3200","tva_code":"N0","confidence":0.88}
desc="APCOM Solutions SA — 30020000005907" amt=+5500 cp="APCOM" → {"debit_account":"1020","credit_account":"3200","tva_code":"N8","confidence":0.87}
desc="Greco Autogroup Sarl | Greco Autogroup Sarl | Greco Autogroup Sarl" amt=+3200 cp="GRECO" → {"debit_account":"1020","credit_account":"3200","tva_code":"N8","confidence":0.85}`;

export class ClassifierAgent {
  private model: string;
  private useVllm: boolean;

  constructor(model?: string) {
    this.useVllm = process.env.USE_VLLM_CLASSIFIER === "true";
    if (this.useVllm) {
      this.model = process.env.VLLM_CLASSIFIER_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
    } else {
      this.model = model ?? config.MODEL_CLASSIFIER;
    }
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

    const isDebit = transaction.amount < 0;
    const absAmount = Math.abs(transaction.amount);

    // 4a. User prompt (transaction data + contexte RAG) — commun aux 2 chemins
    const userPrompt = `TRANSACTION:
- Date: ${transaction.date}
- Description: ${transaction.description}
- Montant: ${absAmount} ${transaction.currency} (${isDebit ? "sortie" : "entree"})
${transaction.counterpartyIban ? `- Contrepartie IBAN: ${transaction.counterpartyIban}` : ""}

CONTEXTE JURIDIQUE (pertinent):
${context}

Pour une ${isDebit ? "sortie" : "entree"} bancaire, le compte 1020 Banque est en ${isDebit ? "credit" : "debit"}.

REPONSE JSON:`;

    // 4b. Prompt complet pour Ollama (concat system + user — compatible generate())
    const fullPromptWithSystem = `${SYSTEM_PROMPT_CLASSIFIER}

${userPrompt}`;

    let parsed: ReturnType<typeof this.parseClassificationJson>;
    let rawResponse = "";

    if (this.useVllm) {
      // Chemin vLLM (OpenAI-compat chat completions)
      try {
        const result = await vllm.generate({
          model: this.model,
          systemPrompt: SYSTEM_PROMPT_CLASSIFIER,
          prompt: userPrompt,
          temperature: 0.1,
          numPredict: 200, // few-shot prompt génère ~130-150 tokens (reasoning + citations)
          format: "json",
          think: false,
        });
        rawResponse = result.response;
        console.log(
          `[classifier] vLLM ${this.model} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`,
        );
        parsed = this.parseClassificationJson(rawResponse);
      } catch (err) {
        console.warn(
          "[classifier] vLLM failed, falling back to Ollama:",
          (err as Error).message,
        );
        // Fallback Ollama automatique
        const { response } = await ollama.generate({
          model: config.MODEL_CLASSIFIER,
          prompt: fullPromptWithSystem,
          stream: false,
          think: false,
          format: "json",
          temperature: 0.1,
          numCtx: 8192,
          numPredict: 200, // 200 tokens : JSON Käfer + citations[] tient en 150-180 tokens
          keepAlive: "30m",
        });
        rawResponse = response;
        parsed = this.parseClassificationJson(rawResponse);
      }
    } else {
      // Chemin Ollama (prod actuelle / fallback)
      const { response } = await ollama.generate({
        model: this.model,
        prompt: fullPromptWithSystem,
        stream: false,
        think: false,        // désactive le chain-of-thought Qwen 3.x (économise ~400 tokens)
        format: "json",      // force un output JSON strict valide
        temperature: 0.1,
        numCtx: 8192,
        numPredict: 200,     // 200 tokens : JSON Käfer + citations[] tient en 150-180 tokens
        keepAlive: "30m",    // garde lexa-classifier en VRAM entre les appels CAMT batch
      });
      rawResponse = response;
      parsed = this.parseClassificationJson(rawResponse);
    }

    // 5. Compute amounts with TVA
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
      rawOllamaResponse: rawResponse,
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
      const result = JSON.parse(jsonSlice) as Record<string, unknown>;
      // Normalise les comptes : tolère "6000 - Loyers" ou "6000" ou "6000-Loyers"
      // Assure que debit_account et credit_account commencent par 4 chiffres (plan Käfer)
      for (const key of ["debit_account", "credit_account"] as const) {
        const val = result[key];
        if (typeof val === "string" && /^[0-9]{4}/.test(val)) {
          // Déjà correct — normalise le format "XXXX" en "XXXX - Nom" si pas de tiret
          if (!/^[0-9]{4}\s*-/.test(val)) {
            result[key] = val; // on garde tel quel, le code aval accepte les 2 formats
          }
        }
      }
      return result;
    } catch (err) {
      return {
        confidence: 0,
        reasoning: `JSON parse error: ${(err as Error).message}. Raw: ${jsonSlice.slice(0, 200)}`,
      };
    }
  }
}

export const classifierAgent = new ClassifierAgent();
