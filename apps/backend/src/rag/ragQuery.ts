import { embedder } from "./EmbedderClient.js";
import { qdrant, type QdrantHit } from "./QdrantClient.js";
import { ollama } from "../llm/OllamaClient.js";
import { vllm } from "../llm/VllmClient.js";
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

/** System prompt Reasoning extrait en constante pour réutilisation chat-style (vLLM) */
const SYSTEM_PROMPT_REASONING = `Tu es un assistant comptable suisse specialise. Tu reponds UNIQUEMENT avec les informations du contexte juridique fourni.
Instructions :
1. Reponds de maniere concise et factuelle.
2. Cite OBLIGATOIREMENT les articles de loi utilises (format: Art. XX LTVA ou Art. XX LIFD).
3. Si les informations du contexte sont insuffisantes, dis-le explicitement.
4. Termine par un avertissement: "Information a titre indicatif - verifiez avec votre fiduciaire."`;

/**
 * Pipeline RAG canonique pour Lexa:
 *   question -> BGE-M3 embedding -> Qdrant search -> context building -> Ollama/vLLM generate
 *
 * USE_VLLM_REASONING=true active vLLM Qwen3.5 (~4-5× plus rapide), fallback Ollama si erreur.
 */
export async function ragQuery(params: {
  question: string;
  topK?: number;
  model?: string;
  filter?: Record<string, unknown>;
}): Promise<RagAnswer> {
  const started = Date.now();
  const { question, topK = config.RAG_TOP_K, model = config.MODEL_REASONING, filter } = params;

  const useVllm = process.env.USE_VLLM_REASONING === "true";
  const vllmModel =
    process.env.VLLM_REASONING_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";

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

  // 4. User prompt (contexte RAG + question) — commun aux 2 chemins
  const userPrompt = `CONTEXTE JURIDIQUE (sources officielles):
${context}

QUESTION: ${question}

REPONSE:`;

  // 5. Prompt complet pour Ollama (concat system + user)
  const fullPromptWithSystem = `${SYSTEM_PROMPT_REASONING}

${userPrompt}`;

  let response = "";

  if (useVllm) {
    // Chemin vLLM (OpenAI-compat chat completions) — ~4-5× plus rapide que Ollama natif
    try {
      const result = await vllm.generate({
        model: vllmModel,
        systemPrompt: SYSTEM_PROMPT_REASONING,
        prompt: userPrompt,
        temperature: 0.2,
        numPredict: 2048,
      });
      response = result.response;
      console.log(
        `[reasoning] vLLM ${vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`,
      );
    } catch (err) {
      console.warn(
        "[reasoning] vLLM failed, falling back to Ollama:",
        (err as Error).message,
      );
      // Fallback Ollama automatique
      const { response: ollamaResponse } = await ollama.generate({
        model,
        prompt: fullPromptWithSystem,
        temperature: 0.2,
        numCtx: 16384,
      });
      response = ollamaResponse;
    }
  } else {
    // Chemin Ollama (prod actuelle / fallback)
    const { response: ollamaResponse } = await ollama.generate({
      model,
      prompt: fullPromptWithSystem,
      temperature: 0.2,
      numCtx: 16384,
    });
    response = ollamaResponse;
  }

  // 6. Assemble the citations from hits
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
