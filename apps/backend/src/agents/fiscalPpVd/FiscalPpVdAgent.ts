import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";
import { AGENT_PROMPTS } from "../../llm/agent-prompts.js";

export type FiscalPpVdQuery = {
  question: string;
  context?: {
    status?: "salarie" | "independant" | "mixte";
    netIncome?: number; // CHF annual
    commune?: string;
    civilStatus?: "single" | "married" | "divorced" | "widowed";
    isPropertyOwner?: boolean;
    isFrontalier?: boolean; // VD a des communes frontalières avec GE (Nyon, etc.)
  };
};

export type FiscalPpVdAnswer = {
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
 * FiscalPpVdAgent — Specialized agent for Vaud personal income tax (PP).
 *
 * Uses:
 *   - lexa-fiscal-pp-vd Modelfile (qwen3.5:9b + SYSTEM prompt PP VD)
 *   - Qdrant prioritizing LI-VD / LIPC-VD, with federal fallback on LIFD /
 *     LHID / AFC-IFD-Circ. RLI-VD priorisé comme source réglementaire VD.
 */
export class FiscalPpVdAgent {
  private readonly model = "lexa-fiscal-pp-vd";
  private readonly useVllm = process.env.USE_VLLM_FISCAL_PP_VD === "true";
  private readonly vllmModel = process.env.VLLM_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
  private readonly systemPrompt = AGENT_PROMPTS["lexa-fiscal-pp-vd"]?.system ?? "";

  async ask(query: FiscalPpVdQuery): Promise<FiscalPpVdAnswer> {
    const started = Date.now();

    // 1. Enrich question with user context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search (top 8 for better coverage)
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank boosting Vaud-specific sources, then federal tax sources
    const rankedHits = this.rankVdTaxSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (RS ${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `CONTEXTE FISCAL VD (extraits legaux):
${context}

QUESTION: ${enriched}

Reponds de maniere concise en citant les articles LI / LIPC (BLV) et les articles federaux LIFD / LHID pertinents. Termine par l avertissement obligatoire.

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
        console.log(`[fiscal-pp-vd] vLLM ${this.vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`);
      } catch (err) {
        console.warn("[fiscal-pp-vd] vLLM failed, falling back to Ollama:", (err as Error).message);
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

  private enrichQuestion(query: FiscalPpVdQuery): string {
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
      parts.push(`Commune de domicile: ${query.context.commune} (Vaud).`);
    }
    if (query.context?.civilStatus) {
      parts.push(`Etat civil: ${query.context.civilStatus}.`);
    }
    if (query.context?.isPropertyOwner) {
      parts.push("Contribuable proprietaire immobilier (valeur locative + impot immobilier VD).");
    }
    if (query.context?.isFrontalier) {
      parts.push("Contribuable domicilie dans une commune VD frontaliere (ex: Nyon, Rolle, Morges).");
    }
    return parts.join(" ");
  }

  private rankVdTaxSources(hits: QdrantHit[]): QdrantHit[] {
    const tier = (law: string): number => {
      // 0 = sources VD prioritaires personnes physiques
      if (law === "LI-VD") return 0;
      if (law === "LIPC-VD") return 0;
      // 1 = réglementation d'application VD
      if (law === "RLI-VD") return 1;
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

export const fiscalPpVdAgent = new FiscalPpVdAgent();
