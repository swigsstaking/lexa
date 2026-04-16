/**
 * ConseillerAgent — 15ème agent Lexa (session 31)
 *
 * Agent d'optimisation fiscale proactive :
 * - Détection d'opportunités fiscales légitimes
 * - Réponses "et si ?" avec chiffres précis
 * - Briefing quotidien synthétique
 *
 * Model: lexa-conseiller (Spark DGX, basé sur lexa-audit)
 * Sources tier 0: LIFD art. 33 + 58 + 62 + 63 + 68 + 75, LHID art. 24-31, CO art. 960, Notice A AFC
 */

import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";

export type ConseillerQuery = {
  question: string;
  year?: number;
  context?: {
    canton?: "VS" | "GE" | "VD" | "FR";
    entityType?: "pp" | "pm";
    civilStatus?: "single" | "married";
    currentIncome?: number;
    companyProfit?: number;
  };
};

export type ConseillerAnswer = {
  answer: string;
  citations: Array<{
    law: string;
    article: string;
    heading?: string;
    score: number;
    url?: string;
  }>;
  disclaimer: string;
  durationMs: number;
  model: string;
};

/**
 * ConseillerAgent — Agent conseiller optimisation fiscale proactive.
 *
 * Re-ranking tier 0: LIFD art. 33 + 58 + 62 + 63 + 68 (fiscal PP/PM)
 * Tier 1: LHID art. 24-31 (harmonisation cantonale)
 * Tier 2: CO art. 960 (évaluation actifs), Notice A AFC (amortissements)
 * Tier 3: lois cantonales (LF VS, LIPP GE, LI VD, LICD FR)
 */
export class ConseillerAgent {
  private readonly model = "lexa-conseiller";

  async ask(query: ConseillerQuery): Promise<ConseillerAnswer> {
    const started = Date.now();

    // 1. Enrichir la question avec le contexte
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank: boost LIFD art. 33/58/62/63/68 (sources conseiller)
    const rankedHits = this.rankConseillerSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) art.${p.article}]` : `[${p.law} art.${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 600)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `SOURCES LEGALES OPTIMISATION FISCALE (LIFD art.33+58+62+63+68, LHID art.24-31, CO art.960):
${context}

QUESTION CONSEILLER: ${enriched}

Reponds avec le format : Constat -> Opportunite -> Chiffres -> Hypotheses -> Disclaimer.
Cite les articles pertinents (LIFD art.33 pour LPP/3a, LIFD art.62 pour amortissements, CO art.960 pour evaluation actifs).
Toujours quantifier l'economie estimee en CHF avec hypotheses explicites.
Disclaimer final obligatoire : "Conseil indicatif, verifiez avec votre fiduciaire avant decision."

REPONSE CONSEILLER:`;

    const { response } = await ollama.generate({
      model: this.model,
      prompt,
      temperature: 0.2,
    });

    // 5. Extract citations
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
      disclaimer:
        "Conseil indicatif — non substitutif d'un conseil fiduciaire personnalisé. " +
        "Les simulations sont basées sur des barèmes approximatifs 2026.",
      durationMs: Date.now() - started,
      model: this.model,
    };
  }

  private enrichQuestion(query: ConseillerQuery): string {
    let q = query.question;
    if (query.year) {
      q = `[Exercice ${query.year}] ${q}`;
    }
    if (query.context) {
      const ctx = query.context;
      const parts: string[] = [];
      if (ctx.canton) parts.push(`Canton: ${ctx.canton}`);
      if (ctx.entityType) parts.push(`Type: ${ctx.entityType === "pp" ? "Personne physique" : "Personne morale"}`);
      if (ctx.civilStatus) parts.push(`Statut civil: ${ctx.civilStatus === "married" ? "marié" : "célibataire"}`);
      if (ctx.currentIncome) parts.push(`Revenu imposable: ${ctx.currentIncome.toLocaleString("fr-CH")} CHF`);
      if (ctx.companyProfit) parts.push(`Bénéfice société: ${ctx.companyProfit.toLocaleString("fr-CH")} CHF`);
      if (parts.length > 0) {
        q = `${q}\n\nContexte: ${parts.join(", ")}`;
      }
    }
    return q;
  }

  /**
   * Re-rank hits pour sources conseiller:
   * - LIFD art.33 → +0.35 (LPP, 3a — déductions phares)
   * - LIFD art.58-68 → +0.3 (bénéfice PM, amortissements)
   * - LIFD art.62-63 → +0.3 (amortissements + provisions)
   * - LHID art.24-31 → +0.2 (harmonisation)
   * - CO art.960 → +0.2 (évaluation actifs)
   * - Lois cantonales → +0.1
   */
  private rankConseillerSources(hits: QdrantHit[]): QdrantHit[] {
    return hits
      .map((h) => {
        let boost = 0;
        const law = (h.payload.law ?? "").toUpperCase();
        const art = parseInt(String(h.payload.article ?? ""), 10);

        if (law === "LIFD") {
          if (art === 33) boost = 0.35; // déductions LPP + 3a
          else if (art >= 58 && art <= 68) boost = 0.3; // fiscal PM + amortissements
          else if (art === 62 || art === 63) boost = 0.3; // amortissements + provisions
          else if (art === 75) boost = 0.2; // déductions PP
          else boost = 0.1;
        } else if (law === "LHID") {
          if (art >= 24 && art <= 31) boost = 0.2;
        } else if (law === "CO" && art === 960) {
          boost = 0.2;
        } else if (["LF", "LIPP", "LI", "LICD"].includes(law)) {
          boost = 0.1; // lois cantonales
        }

        return { ...h, score: h.score + boost };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export const conseillerAgent = new ConseillerAgent();
