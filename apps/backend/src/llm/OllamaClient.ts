import axios, { type AxiosInstance } from "axios";
import { config } from "../config/index.js";

export type OllamaGenerateOptions = {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  topP?: number;
  topK?: number;
  numCtx?: number;
  numPredict?: number;
  stream?: false;
  timeoutMs?: number;
  format?: "json";
  /**
   * Disable Qwen3 thinking mode. Default: false (= thinking OFF).
   * Qwen3 models consume num_predict tokens inside hidden <think>...</think>
   * blocks which leaves the response field empty. Lexa always wants direct
   * answers, so we default to no-think.
   */
  think?: boolean;
  /** Duration to keep model in VRAM after last use. Default: Ollama default (5m). Example: "30m". */
  keepAlive?: string;
};

export class OllamaClient {
  private http: AxiosInstance;

  constructor(baseUrl: string = config.OLLAMA_URL) {
    // Large default timeout because the Spark GB10 can be slow under GPU contention
    this.http = axios.create({ baseURL: baseUrl, timeout: 900_000 });
  }

  async generate(opts: OllamaGenerateOptions): Promise<{ response: string; durationMs: number }> {
    const started = Date.now();
    const body: Record<string, unknown> = {
      model: opts.model,
      prompt: opts.prompt,
      system: opts.system,
      stream: false,
      // Qwen3 thinking OFF by default (otherwise response field is empty).
      think: opts.think ?? false,
      options: {
        temperature: opts.temperature ?? 0.3,
        top_p: opts.topP ?? 0.9,
        top_k: opts.topK ?? 40,
        num_ctx: opts.numCtx ?? 8192,
        num_predict: opts.numPredict ?? -1,
      },
    };
    if (opts.format) body.format = opts.format;
    if (opts.keepAlive) body.keep_alive = opts.keepAlive;

    const { data } = await this.http.post<{
      response: string;
      done: boolean;
      total_duration?: number;
    }>("/api/generate", body, { timeout: opts.timeoutMs ?? 900_000 });

    return {
      response: data.response,
      durationMs: Date.now() - started,
    };
  }

  async listModels(): Promise<string[]> {
    const { data } = await this.http.get<{ models: { name: string }[] }>("/api/tags");
    return data.models.map((m) => m.name);
  }

  async health(): Promise<boolean> {
    try {
      const { status } = await this.http.get("/api/tags", { timeout: 5_000 });
      return status === 200;
    } catch {
      return false;
    }
  }
}

export const ollama = new OllamaClient();
