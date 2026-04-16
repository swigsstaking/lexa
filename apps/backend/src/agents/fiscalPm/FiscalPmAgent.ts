import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";

export type FiscalPmQuery = {
  question: string;
  context?: {
    legalForm?: "sarl" | "sa" | "association" | "fondation" | "autre";
    canton?: "VS" | "GE" | "VD" | "FR" | "NE" | "JU" | "BE";
    year?: number;
    revenuNet?: number;    // bénéfice net comptable CHF
    fondsPropres?: number; // capital + réserves CHF
    ideNumber?: string;    // CHE-xxx
  };
};

export type FiscalPmAnswer = {
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
 * FiscalPmAgent — Specialized agent for Swiss corporate income tax (PM).
 *
 * Uses:
 *   - lexa-fiscal-pm Modelfile (based on lexa-fiscal-pp-fr + PM SYSTEM prompt)
 *   - Qdrant re-ranking:
 *     Tier 0: LIFD art.57-79 (IFD PM) + CO art.957-963 (comptabilité obligatoire)
 *     Tier 1: LHID art.24-31 (harmonisation PM)
 *     Tier 2: autres lois fédérales (LTVA, etc.)
 *     Tier 3: lois cantonales PM
 */
export class FiscalPmAgent {
  private readonly model = "lexa-fiscal-pm";

  async ask(query: FiscalPmQuery): Promise<FiscalPmAnswer> {
    const started = Date.now();

    // 1. Enrich question with corporate context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search (top 8 for better coverage)
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank boosting PM federal sources (LIFD art.57-79, CO), then LHID
    const rankedHits = this.rankPmTaxSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 700)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `CONTEXTE FISCAL PM (extraits legaux pertinents):
${context}

QUESTION: ${enriched}

Reponds de maniere concise en citant les articles LIFD (art.57-79 PM) et CO (art.957-963b comptabilite) pertinents. Pour l IFD: rappelle le taux 8.5% de l art. 68 LIFD. Termine par l avertissement obligatoire.

REPONSE:`;

    const { response } = await ollama.generate({
      model: this.model,
      prompt,
      temperature: 0.1,
      numCtx: 16384,
      numPredict: 700,
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

  private enrichQuestion(query: FiscalPmQuery): string {
    const parts: string[] = [query.question];

    if (query.context?.legalForm) {
      const formLabel =
        query.context.legalForm === "sarl"
          ? "Sarl (societe a responsabilite limitee)"
          : query.context.legalForm === "sa"
            ? "SA (societe anonyme)"
            : query.context.legalForm === "association"
              ? "association"
              : query.context.legalForm === "fondation"
                ? "fondation"
                : "autre forme juridique";
      parts.push(`Forme juridique: ${formLabel}.`);
    }

    if (query.context?.canton) {
      parts.push(`Canton d imposition: ${query.context.canton}.`);
    }

    if (query.context?.year) {
      parts.push(`Exercice fiscal: ${query.context.year}.`);
    }

    if (query.context?.revenuNet !== undefined) {
      parts.push(`Benefice net comptable: ${query.context.revenuNet} CHF.`);
    }

    if (query.context?.fondsPropres !== undefined) {
      parts.push(`Fonds propres: ${query.context.fondsPropres} CHF.`);
    }

    if (query.context?.ideNumber) {
      parts.push(`Numero IDE: ${query.context.ideNumber}.`);
    }

    return parts.join(" ");
  }

  private rankPmTaxSources(hits: QdrantHit[]): QdrantHit[] {
    return [...hits].sort((a, b) => {
      const ta = this.tierPm(a);
      const tb = this.tierPm(b);
      if (ta !== tb) return tb - ta; // higher tier first
      return b.score - a.score;
    });
  }

  /**
   * Tier ranking for PM tax sources.
   *
   * Tier 4 (highest): LIFD art.57-79 (impôt PM, bénéfice net, taux 8.5%)
   *                   CO art.957-963b (comptabilité obligatoire PM)
   * Tier 3:           LHID art.24-31 (harmonisation cantonale PM)
   * Tier 2:           Autres lois fédérales (LIFD PP, LHID PP, LTVA, CO autres)
   * Tier 1:           Sources cantonales PM
   * Tier 0:           Tout le reste
   */
  private tierPm(hit: QdrantHit): number {
    const law = String(hit.payload?.law ?? "");
    const articleStr = String(hit.payload?.article ?? "").replace("art. ", "").split(".")[0];
    const articleNum = parseInt(articleStr, 10);

    // Tier 4: LIFD art.57-79 (section PM)
    if (law === "LIFD" && !isNaN(articleNum) && articleNum >= 57 && articleNum <= 79) return 4;

    // Tier 4: CO art.957-963 (comptabilité)
    if (law === "CO" && !isNaN(articleNum) && articleNum >= 957 && articleNum <= 963) return 4;

    // Tier 3: LHID art.24-31 (harmonisation PM)
    if (law === "LHID" && !isNaN(articleNum) && articleNum >= 24 && articleNum <= 31) return 3;

    // Tier 2: autres lois fédérales
    if (["LIFD", "LHID", "CO", "LTVA", "OLTVA"].includes(law)) return 2;

    // Tier 1: lois cantonales PM
    if (["LIPM", "LI-VS", "LF-VS", "LI-VD", "LICD-FR", "LI-JU"].includes(law)) return 1;

    return 0;
  }
}

export const fiscalPmAgent = new FiscalPmAgent();
