import { embedder } from "./EmbedderClient.js";
import { qdrant, type QdrantHit } from "./QdrantClient.js";
import { ollama } from "../llm/OllamaClient.js";
import { config } from "../config/index.js";

export type RagAnswer = {
  answer: string;
  citations: Array<{
    law: string;
    article: string;
    heading?: string;
    score: number;
    url?: string;
  }>;
  rawHits: QdrantHit[];
  durationMs: number;
};

/**
 * Pipeline RAG canonique pour Lexa:
 *   question -> BGE-M3 embedding -> Qdrant search -> context building -> Ollama generate
 */
export async function ragQuery(params: {
  question: string;
  topK?: number;
  model?: string;
  filter?: Record<string, unknown>;
}): Promise<RagAnswer> {
  const started = Date.now();
  const { question, topK = config.RAG_TOP_K, model = config.MODEL_REASONING, filter } = params;

  // 1. Embed the query
  const qVec = await embedder.embedOne(question);

  // 2. Qdrant search
  const hits = await qdrant.search({ vector: qVec, limit: topK, filter });

  // 3. Build context string (top-K sources)
  const contextParts = hits.map((hit, i) => {
    const p = hit.payload;
    const source = p.rs ? `[${p.law} (RS ${p.rs}) ${p.article}]` : `[${p.law} ${p.article}]`;
    return `${i + 1}. ${source} ${p.heading ?? ""}\n${p.text}`;
  });
  const context = contextParts.join("\n\n---\n\n");

  // 4. Prompt the model with strict citation requirement
  const prompt = `Tu es un assistant comptable suisse specialise. Tu reponds UNIQUEMENT avec les informations du contexte ci-dessous.

CONTEXTE JURIDIQUE (sources officielles):
${context}

QUESTION: ${question}

INSTRUCTIONS:
1. Reponds de maniere concise et factuelle.
2. Cite OBLIGATOIREMENT les articles de loi utilises (format: Art. XX LTVA ou Art. XX LIFD).
3. Si les informations du contexte sont insuffisantes, dis-le explicitement.
4. Termine par un avertissement: "Information a titre indicatif - verifiez avec votre fiduciaire."

REPONSE:`;

  const { response } = await ollama.generate({
    model,
    prompt,
    temperature: 0.2,
    numCtx: 16384,
  });

  // 5. Assemble the citations from hits
  const citations = hits.map((hit) => ({
    law: hit.payload.law,
    article: hit.payload.article,
    heading: hit.payload.heading,
    score: hit.score,
    url: hit.payload.url,
  }));

  return {
    answer: response.trim(),
    citations,
    rawHits: hits,
    durationMs: Date.now() - started,
  };
}
