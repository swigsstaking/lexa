import axios, { type AxiosInstance } from "axios";
import { config } from "../config/index.js";

export class EmbedderClient {
  private http: AxiosInstance;

  constructor(baseUrl: string = config.EMBEDDER_URL) {
    this.http = axios.create({
      baseURL: baseUrl,
      timeout: 60_000,
    });
  }

  /**
   * Encode texts with BGE-M3 (multilingual, 1024-dim dense).
   * The embedding service runs on the DGX Spark (:8001).
   */
  async embed(texts: string[]): Promise<number[][]> {
    const { data } = await this.http.post<{ vectors: number[][] }>("/embed", { texts });
    if (!Array.isArray(data.vectors) || data.vectors.length !== texts.length) {
      throw new Error(`Embedder returned ${data.vectors?.length} vectors for ${texts.length} inputs`);
    }
    return data.vectors;
  }

  async embedOne(text: string): Promise<number[]> {
    const vecs = await this.embed([text]);
    return vecs[0]!;
  }

  async health(): Promise<boolean> {
    try {
      const { status } = await this.http.get("/health", { timeout: 5_000 });
      return status === 200;
    } catch {
      return false;
    }
  }
}

export const embedder = new EmbedderClient();
