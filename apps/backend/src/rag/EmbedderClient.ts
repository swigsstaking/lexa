import axios, { type AxiosInstance } from "axios";
import { config } from "../config/index.js";

type OpenAIEmbeddingResponse = {
  object: string;
  data: Array<{
    object: string;
    index: number;
    embedding: number[];
  }>;
  model: string;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
};

/**
 * EmbedderClient — talks to a llama.cpp llama-server running in --embedding mode
 * on the DGX Spark, serving BGE-M3 GGUF on GPU.
 *
 * Uses the OpenAI-compatible `/v1/embeddings` endpoint.
 */
export class EmbedderClient {
  private http: AxiosInstance;

  constructor(baseUrl: string = config.EMBEDDER_URL) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
    });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];
    const { data } = await this.http.post<OpenAIEmbeddingResponse>(
      "/v1/embeddings",
      { input: texts },
    );
    if (!Array.isArray(data.data) || data.data.length !== texts.length) {
      throw new Error(
        `Embedder returned ${data.data?.length ?? 0} vectors for ${texts.length} inputs`,
      );
    }
    // Sort by index to keep input order
    return data.data
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
  }

  async embedOne(text: string): Promise<number[]> {
    const vecs = await this.embed([text]);
    return vecs[0]!;
  }

  /**
   * Health probe réelle (session 14) — fait un vrai `embedOne("ping")` et
   * vérifie que le vecteur retourne bien la dimension attendue (1024 pour
   * BGE-M3). Évite le drift invisible EMBEDDER_URL observé sessions 12→13
   * où le /health superficiel passait vert mais /v1/embeddings retournait 404.
   */
  async health(): Promise<boolean> {
    try {
      const vec = await this.embedOne("ping");
      return Array.isArray(vec) && vec.length === 1024;
    } catch {
      return false;
    }
  }
}

export const embedder = new EmbedderClient();
