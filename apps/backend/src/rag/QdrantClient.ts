import axios, { type AxiosInstance } from "axios";
import { config } from "../config/index.js";

export type QdrantHit = {
  id: string;
  score: number;
  payload: {
    text: string;
    law: string;
    law_label?: string;
    article: string;
    article_num?: string;
    heading?: string;
    rs?: string | null;
    topic?: string;
    date_version?: string;
    source?: string;
    category?: string;
    jurisdiction?: string;
    url?: string;
    page?: number;
  };
};

export class QdrantClient {
  private http: AxiosInstance;
  private collection: string;

  constructor(
    baseUrl: string = config.QDRANT_URL,
    collection: string = config.QDRANT_COLLECTION,
  ) {
    this.http = axios.create({ baseURL: baseUrl, timeout: 30_000 });
    this.collection = collection;
  }

  async search(params: {
    vector: number[];
    limit?: number;
    filter?: Record<string, unknown>;
  }): Promise<QdrantHit[]> {
    const { vector, limit = config.RAG_TOP_K, filter } = params;
    const body: Record<string, unknown> = {
      vector,
      limit,
      with_payload: true,
    };
    if (filter) body.filter = filter;

    const { data } = await this.http.post<{ result: QdrantHit[] }>(
      `/collections/${this.collection}/points/search`,
      body,
    );
    return data.result;
  }

  async countPoints(): Promise<number> {
    const { data } = await this.http.get<{ result: { points_count: number } }>(
      `/collections/${this.collection}`,
    );
    return data.result.points_count;
  }

  async health(): Promise<boolean> {
    try {
      const { status } = await this.http.get("/healthz", { timeout: 5_000 });
      return status === 200;
    } catch {
      try {
        await this.countPoints();
        return true;
      } catch {
        return false;
      }
    }
  }
}

export const qdrant = new QdrantClient();
