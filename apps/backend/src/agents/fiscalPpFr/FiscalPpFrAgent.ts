import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";
import { AGENT_PROMPTS } from "../../llm/agent-prompts.js";

export type FiscalPpFrQuery = {
  question: string;
  context?: {
    status?: "salarie" | "independant" | "mixte";
    netIncome?: number; // CHF annual
    commune?: string;
    district?: string;
    civilStatus?: "single" | "married" | "divorced" | "widowed";
    isPropertyOwner?: boolean;
    isBilingual?: boolean; // Canton bilingue FR/DE
  };
};

export type FiscalPpFrAnswer = {
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
 * FiscalPpFrAgent — Specialized agent for Fribourg personal income tax (PP).
 *
 * Uses:
 *   - lexa-fiscal-pp-fr Modelfile (qwen3.5:9b + SYSTEM prompt PP FR)
 *   - Qdrant prioritizing LICD-FR / LIC-FR / ORD-FP-FR, with federal fallback on LIFD / LHID.
 */
export class FiscalPpFrAgent {
  private readonly model = "lexa-fiscal-pp-fr";
  private readonly useVllm = process.env.USE_VLLM_FISCAL_PP_FR === "true";
  private readonly vllmModel = process.env.VLLM_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
  private readonly systemPrompt = AGENT_PROMPTS["lexa-fiscal-pp-fr"]?.system ?? "";

  async ask(query: FiscalPpFrQuery): Promise<FiscalPpFrAnswer> {
    const started = Date.now();

    // 1. Enrich question with user context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search (top 8 for better coverage)
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank boosting Fribourg-specific sources, then federal tax sources
    const rankedHits = this.rankFrTaxSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `CONTEXTE FISCAL FR (extraits legaux):
${context}

QUESTION: ${enriched}

Reponds de maniere concise en citant les articles LICD / LIC / ORD-FP (BDLF) et les articles federaux LIFD / LHID pertinents. Termine par l avertissement obligatoire.

REPONSE:`;

    let response: string;
    if (this.useVllm) {
      try {
        const result = await vllm.generate({
          model: this.vllmModel,
          systemPrompt: this.systemPrompt,
          prompt,
          temperature: 0.15,
          numPredict: 800,
          think: false,
        });
        response = result.response;
        console.log(`[fiscal-pp-fr] vLLM ${this.vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`);
      } catch (err) {
        console.warn("[fiscal-pp-fr] vLLM failed, falling back to Ollama:", (err as Error).message);
        const { response: ollamaResponse } = await ollama.generate({
          model: this.model,
          prompt,
          temperature: 0.15,
          numCtx: 16384,
          numPredict: 600,
        });
        response = ollamaResponse;
      }
    } else {
      const { response: ollamaResponse } = await ollama.generate({
        model: this.model,
        prompt,
        temperature: 0.15,
        numCtx: 16384,
        numPredict: 600,
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

  private enrichQuestion(query: FiscalPpFrQuery): string {
    const parts: string[] = [query.question];
    if (query.context?.status) {
      const statusLabel =
        query.context.status === "salarie"
          ? "salarie avec LPP"
          : query.context.status === "independant"
            ? "independant sans LPP"
            : "mixte salarie + activite independante accessoire";
      parts.push(`Statut du contribuable: ${statusLabel}.`);
    }
    if (query.context?.netIncome) {
      parts.push(`Revenu net annuel: ${query.context.netIncome} CHF.`);
    }
    if (query.context?.commune) {
      parts.push(`Commune de domicile: ${query.context.commune} (Fribourg).`);
    }
    if (query.context?.district) {
      parts.push(`District: ${query.context.district}.`);
    }
    if (query.context?.civilStatus) {
      parts.push(`Etat civil: ${query.context.civilStatus}.`);
    }
    if (query.context?.isPropertyOwner) {
      parts.push("Contribuable proprietaire immobilier (valeur locative + impot immobilier FR).");
    }
    if (query.context?.isBilingual) {
      parts.push("Canton bilingue francais/allemand (Fribourg/Freiburg): references LICD en FR et DE disponibles.");
    }
    return parts.join(" ");
  }

  private rankFrTaxSources(hits: QdrantHit[]): QdrantHit[] {
    const tier = (law: string): number => {
      // 0 = sources FR prioritaires personnes physiques
      if (law === "LICD-FR") return 0;
      if (law === "LIC-FR") return 0;
      // 1 = ordonnance frais professionnels FR
      if (law === "ORD-FP-FR") return 1;
      // 2 = sources fédérales de référence
      if (law === "LIFD") return 2;
      if (law === "LHID") return 2;
      // 3 = circulaires fédérales
      if (law.startsWith("AFC-IFD-Circ")) return 3;
      return 10;
    };
    return [...hits].sort((a, b) => {
      const pa = tier(a.payload.law);
      const pb = tier(b.payload.law);
      if (pa !== pb) return pa - pb;
      return b.score - a.score;
    });
  }
}

export const fiscalPpFrAgent = new FiscalPpFrAgent();
