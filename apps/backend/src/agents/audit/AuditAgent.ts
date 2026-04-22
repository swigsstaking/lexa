/**
 * AuditAgent — 14ème agent Lexa (session 30)
 *
 * Garant de l'intégrité du système IA Lexa :
 * - Vérification citations légales via Qdrant
 * - Détection contradictions entre décisions IA successives
 * - Audit trail pour exportation fiduciaire
 *
 * Model: lexa-audit (Spark DGX, basé sur lexa-cloture)
 * Sources tier 0: CO 957-963b, LTVA 70, nLPD
 */

import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";

export type AuditQuery = {
  question: string;
  year?: number;
  context?: {
    recentDecisions?: Array<{
      agent: string;
      confidence: number;
      citations: Array<{ law: string; article: string }>;
    }>;
  };
};

export type AuditAnswer = {
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
 * AuditAgent — Agent audit intégrité IA Lexa (CO 958f, LTVA 70, nLPD).
 *
 * Re-ranking tier 0: CO 957-963b (comptabilité, conservation 10 ans)
 * Tier 1: LTVA (TVA), LIFD (fiscal)
 * Tier 2: cantonales
 */
/** System prompt Audit extrait en constante pour réutilisation chat-style (vLLM) */
const SYSTEM_PROMPT_AUDIT = `Tu es un agent d'audit comptable et juridique suisse. Tu analyses les décisions IA, vérifies les citations légales et détectes les contradictions.
Reponds de maniere conservatrice en citant les articles pertinents (CO 958f pour conservation 10 ans, LTVA 70, nLPD si donnees personnelles).
Si tu ne peux pas verifier une citation, flags-la UNVERIFIED. Toujours disclaimer final.`;

export class AuditAgent {
  private readonly model = "lexa-audit";
  private readonly vllmModel: string;
  private readonly useVllm: boolean;

  constructor() {
    this.useVllm = process.env.USE_VLLM_AUDIT === "true";
    this.vllmModel =
      process.env.VLLM_AUDIT_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
  }

  async ask(query: AuditQuery): Promise<AuditAnswer> {
    const started = Date.now();

    // 1. Enrich question with audit context
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank: boost CO 957-963b et LTVA 70 (sources audit)
    const rankedHits = this.rankAuditSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) art.${p.article}]` : `[${p.law} art.${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 600)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const userPrompt = `SOURCES LEGALES AUDIT (CO 957-963b, LTVA 70, nLPD):
${context}

QUESTION AUDIT: ${enriched}

REPONSE AUDIT:`;

    const fullPromptWithSystem = `${SYSTEM_PROMPT_AUDIT}

${userPrompt}`;

    let response = "";

    if (this.useVllm) {
      // Chemin vLLM (OpenAI-compat chat completions) — ~4-5× plus rapide que Ollama natif
      try {
        const result = await vllm.generate({
          model: this.vllmModel,
          systemPrompt: SYSTEM_PROMPT_AUDIT,
          prompt: userPrompt,
          temperature: 0,
          topP: 0.1,
          topK: 1,
          repetitionPenalty: 1.0,
          numPredict: 2048,
        });
        response = result.response;
        console.log(
          `[audit] vLLM ${this.vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`,
        );
      } catch (err) {
        console.warn(
          "[audit] vLLM failed, falling back to Ollama:",
          (err as Error).message,
        );
        // Fallback Ollama automatique
        const { response: ollamaResponse } = await ollama.generate({
          model: this.model,
          prompt: fullPromptWithSystem,
          temperature: 0.05,
        });
        response = ollamaResponse;
      }
    } else {
      // Chemin Ollama (prod actuelle / fallback)
      const { response: ollamaResponse } = await ollama.generate({
        model: this.model,
        prompt: fullPromptWithSystem,
        temperature: 0.05,
      });
      response = ollamaResponse;
    }

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
      disclaimer: "Audit indicatif — non substitutif d'un audit fiduciaire externe.",
      durationMs: Date.now() - started,
      model: this.model,
    };
  }

  private enrichQuestion(query: AuditQuery): string {
    let q = query.question;
    if (query.year) {
      q = `[Exercice ${query.year}] ${q}`;
    }
    if (query.context?.recentDecisions && query.context.recentDecisions.length > 0) {
      const decisionsText = query.context.recentDecisions
        .map((d) => `${d.agent} (confiance ${d.confidence}) — citations: ${d.citations.map((c) => `${c.law} art.${c.article}`).join(", ")}`)
        .join("; ");
      q = `${q}\n\nDécisions récentes à auditer: ${decisionsText}`;
    }
    return q;
  }

  /**
   * Re-rank hits pour sources audit:
   * - CO art.957-963b → +0.3 (conservation, bilan)
   * - LTVA art.70-71 → +0.2
   * - nLPD / GDPR → +0.15
   * - LIFD → +0.05
   */
  private rankAuditSources(hits: QdrantHit[]): QdrantHit[] {
    return hits
      .map((h) => {
        let boost = 0;
        const law = (h.payload.law ?? "").toUpperCase();
        const art = String(h.payload.article ?? "");

        if (law === "CO") {
          const artNum = parseInt(art, 10);
          if (artNum >= 957 && artNum <= 963) boost = 0.3;
        } else if (law === "LTVA") {
          const artNum = parseInt(art, 10);
          if (artNum >= 70 && artNum <= 72) boost = 0.2;
        } else if (law === "NLPD" || law === "GDPR" || law === "DSG" || law === "NLDP") {
          boost = 0.15;
        } else if (law === "LIFD") {
          boost = 0.05;
        }

        return { ...h, score: h.score + boost };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export const auditAgent = new AuditAgent();
