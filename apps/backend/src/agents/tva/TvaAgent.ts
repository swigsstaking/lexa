import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";

export type TvaQuery = {
  question: string;
  context?: {
    turnover?: number; // CHF annual
    method?: "effective" | "tdfn";
    sector?: string; // e.g., "construction", "immobilier", "restauration"
  };
};

export type TvaAnswer = {
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
 * TvaAgent — Specialized agent for complex Swiss VAT questions.
 *
 * Uses:
 *   - lexa-tva Modelfile (qwen3.5:9b + dedicated VAT system prompt)
 *   - Qdrant prioritizing LTVA / OLTVA / AFC Info TVA 12 / 15 / sector 17 / sector 04
 */
export class TvaAgent {
  private readonly model = "lexa-tva";

  async ask(query: TvaQuery): Promise<TvaAnswer> {
    const started = Date.now();

    // 1. Enrich question with context if provided
    const enriched = this.enrichQuestion(query);

    // 2. Embed and search Qdrant, boosting VAT sources
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 5 });

    // 3. Optionally re-rank to push LTVA/OLTVA/Info TVA to the top
    const rankedHits = this.rankVatSources(hits);

    // 4. Build context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (RS ${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    // 5. Prompt lexa-tva (uses its own SYSTEM prompt)
    const prompt = `CONTEXTE JURIDIQUE TVA:
${context}

QUESTION: ${enriched}

Reponds de maniere concise, cite les articles et les Info TVA utilises, et termine par l avertissement obligatoire.

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

  private enrichQuestion(query: TvaQuery): string {
    const parts: string[] = [query.question];
    if (query.context?.turnover) {
      parts.push(`Contexte: chiffre d'affaires annuel ${query.context.turnover} CHF.`);
    }
    if (query.context?.method) {
      parts.push(`Methode de decompte actuelle: ${query.context.method}.`);
    }
    if (query.context?.sector) {
      parts.push(`Secteur: ${query.context.sector}.`);
    }
    return parts.join(" ");
  }

  private rankVatSources(hits: QdrantHit[]): QdrantHit[] {
    const isVatSource = (law: string): number => {
      if (law === "LTVA") return 0;
      if (law === "OLTVA") return 1;
      if (law.startsWith("AFC-INFO_TVA")) return 2;
      return 10;
    };
    return [...hits].sort((a, b) => {
      const pa = isVatSource(a.payload.law);
      const pb = isVatSource(b.payload.law);
      if (pa !== pb) return pa - pb;
      return b.score - a.score; // higher score first within same tier
    });
  }
}

export const tvaAgent = new TvaAgent();
