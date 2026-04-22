import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";
import { AGENT_PROMPTS } from "../../llm/agent-prompts.js";

export type ClotureQuery = {
  question: string;
  year?: number;
  balanceSheet?: {
    assetsTotal: number;
    liabilitiesTotal: number;
    equityTotal: number;
    isBalanced: boolean;
  };
  incomeStatement?: {
    revenuesTotal: number;
    chargesTotal: number;
    netResult: number;
  };
};

export type ClotureAnswer = {
  answer: string;
  citations: Array<{
    law: string;
    article: string;
    heading?: string;
    score: number;
    url?: string;
  }>;
  durationMs: number;
  model: string;
};

/**
 * ClotureAgent — Agent spécialisé clôture comptable continue suisse (CO 957-963).
 *
 * Uses:
 *   - lexa-cloture Modelfile (based on lexa-fiscal-pm)
 *   - Qdrant re-ranking:
 *     Tier 0 (highest): CO art.957-963b (comptabilité obligatoire, bilan, compte résultat, annexe)
 *     Tier 1: LIFD art.58 (bénéfice imposable) + autres lois fédérales fiscales
 *     Tier 2: Sources cantonales
 *     Tier 3: Tout le reste
 */
export class ClotureAgent {
  private readonly model = "lexa-cloture";
  private readonly useVllm = process.env.USE_VLLM_CLOTURE === "true";
  private readonly vllmModel = process.env.VLLM_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
  private readonly systemPrompt = AGENT_PROMPTS["lexa-cloture"]?.system ?? "";

  async ask(query: ClotureQuery): Promise<ClotureAnswer> {
    const started = Date.now();

    // 1. Enrich question with cloture context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search (top 8 for CO coverage)
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank boosting CO 957-963 (tier 0 = highest priority)
    const rankedHits = this.rankClotureSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `CONTEXTE COMPTABLE CO 957-963 (extraits legaux pertinents):
${context}

QUESTION: ${enriched}

Reponds de maniere concise en citant les articles CO (art.957-963b) pertinents. Pour les amortissements, cite art.960a-960b CO et les taux admis AFC. Propose des ecritures correctives si applicable au format: Debit {compte} -- Credit {compte} -- Montant {CHF}. Termine par l avertissement obligatoire.

REPONSE:`;

    let response: string;
    if (this.useVllm) {
      try {
        const result = await vllm.generate({
          model: this.vllmModel,
          systemPrompt: this.systemPrompt,
          prompt,
          temperature: 0,
          topP: 0.1,
          topK: 1,
          repetitionPenalty: 1.0,
          numPredict: 800,
          think: false,
        });
        response = result.response;
        console.log(`[cloture] vLLM ${this.vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`);
      } catch (err) {
        console.warn("[cloture] vLLM failed, falling back to Ollama:", (err as Error).message);
        const { response: ollamaResponse } = await ollama.generate({
          model: this.model,
          prompt,
          temperature: 0.1,
          numCtx: 32768,
          numPredict: 800,
        });
        response = ollamaResponse;
      }
    } else {
      const { response: ollamaResponse } = await ollama.generate({
        model: this.model,
        prompt,
        temperature: 0.1,
        numCtx: 32768,
        numPredict: 800,
      });
      response = ollamaResponse;
    }

    const citations = rankedHits.map((h) => ({
      law: h.payload.law,
      article: h.payload.article,
      heading: h.payload.heading,
      score: h.score,
      url: h.payload.url,
    }));

    return {
      answer: response.trim(),
      citations,
      durationMs: Date.now() - started,
      model: this.model,
    };
  }

  private enrichQuestion(query: ClotureQuery): string {
    const parts: string[] = [query.question];

    if (query.year) {
      parts.push(`Exercice comptable: ${query.year}.`);
    }

    if (query.balanceSheet) {
      const bs = query.balanceSheet;
      parts.push(
        `Bilan: Actifs=${bs.assetsTotal} CHF, Passifs=${bs.liabilitiesTotal} CHF, Fonds propres=${bs.equityTotal} CHF, Equilibre=${bs.isBalanced ? "oui" : "NON - desequilibre detecte"}.`,
      );
    }

    if (query.incomeStatement) {
      const is = query.incomeStatement;
      parts.push(
        `Compte de resultat: Produits=${is.revenuesTotal} CHF, Charges=${is.chargesTotal} CHF, Resultat net=${is.netResult} CHF.`,
      );
    }

    return parts.join(" ");
  }

  private rankClotureSources(hits: QdrantHit[]): QdrantHit[] {
    return [...hits].sort((a, b) => {
      const ta = this.tierCloture(a);
      const tb = this.tierCloture(b);
      if (ta !== tb) return tb - ta; // higher tier first
      return b.score - a.score;
    });
  }

  /**
   * Tier ranking for cloture sources.
   *
   * Tier 4 (highest): CO art.957-963b — comptabilité obligatoire, bilan, compte résultat, annexe
   * Tier 3:           LIFD art.58 (bénéfice imposable, lien fiscal direct)
   * Tier 2:           Autres lois fédérales (LIFD PP, LHID, LTVA, CO autres)
   * Tier 1:           Sources cantonales
   * Tier 0:           Tout le reste
   */
  private tierCloture(hit: QdrantHit): number {
    const law = String(hit.payload?.law ?? "");
    const articleStr = String(hit.payload?.article ?? "").replace("art. ", "").split(".")[0];
    const articleNum = parseInt(articleStr, 10);

    // Tier 4: CO art.957-963b — coeur de la clôture
    if (law === "CO" && !isNaN(articleNum) && articleNum >= 957 && articleNum <= 963) return 4;

    // Tier 3: LIFD art.58 — bénéfice imposable (lien clôture → fiscalité)
    if (law === "LIFD" && !isNaN(articleNum) && articleNum === 58) return 3;

    // Tier 2: autres lois fédérales
    if (["LIFD", "LHID", "CO", "LTVA", "OLTVA"].includes(law)) return 2;

    // Tier 1: lois cantonales
    if (["LIPM", "LI-VS", "LF-VS", "LI-VD", "LICD-FR", "LI-JU"].includes(law)) return 1;

    return 0;
  }
}

export const clotureAgent = new ClotureAgent();
