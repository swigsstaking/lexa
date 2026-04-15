import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";

export type FiscalPpNeQuery = {
  question: string;
  context?: {
    status?: "salarie" | "independant" | "mixte";
    netIncome?: number; // CHF annual
    commune?: string;
    civilStatus?: "single" | "married" | "divorced" | "widowed";
    isPropertyOwner?: boolean;
  };
};

export type FiscalPpNeAnswer = {
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
 * FiscalPpNeAgent — Specialized agent for Neuchatel personal income tax (PP).
 *
 * Uses:
 *   - lexa-fiscal-pp-ne Modelfile (qwen3.5:9b + SYSTEM prompt PP NE)
 *   - Qdrant prioritizing LCdir-NE / RGI-NE / ORD-FP-NE, with federal fallback on LIFD / LHID.
 *   - Authority: SCCO NE (Service cantonal des contributions, Neuchatel)
 */
export class FiscalPpNeAgent {
  private readonly model = "lexa-fiscal-pp-ne";

  async ask(query: FiscalPpNeQuery): Promise<FiscalPpNeAnswer> {
    const started = Date.now();

    // 1. Enrich question with user context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search (top 8 for better coverage)
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank boosting Neuchatel-specific sources, then federal tax sources
    const rankedHits = this.rankNeTaxSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `CONTEXTE FISCAL NE (extraits legaux):
${context}

QUESTION: ${enriched}

Reponds de maniere concise en citant les articles LCdir / RGI / ORD-FP (RSN) et les articles federaux LIFD / LHID pertinents. Autorite fiscale competente: SCCO NE (Service cantonal des contributions, Neuchatel). Termine par l avertissement obligatoire.

REPONSE:`;

    const { response } = await ollama.generate({
      model: this.model,
      prompt,
      temperature: 0.15,
      numCtx: 16384,
      numPredict: 600,
    });

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

  private enrichQuestion(query: FiscalPpNeQuery): string {
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
      parts.push(`Commune de domicile: ${query.context.commune} (Neuchatel).`);
    }
    if (query.context?.civilStatus) {
      parts.push(`Etat civil: ${query.context.civilStatus}.`);
    }
    if (query.context?.isPropertyOwner) {
      parts.push("Contribuable proprietaire immobilier (valeur locative + impot immobilier NE).");
    }
    return parts.join(" ");
  }

  private rankNeTaxSources(hits: QdrantHit[]): QdrantHit[] {
    const tier = (law: string): number => {
      // 0 = sources NE prioritaires personnes physiques
      if (law === "LCdir-NE") return 0;
      if (law === "RGI-NE") return 0;
      // 1 = ordonnance frais professionnels NE
      if (law === "ORD-FP-NE") return 1;
      // 2 = sources federales de reference
      if (law === "LIFD") return 2;
      if (law === "LHID") return 2;
      // 3 = circulaires federales
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

export const fiscalPpNeAgent = new FiscalPpNeAgent();
