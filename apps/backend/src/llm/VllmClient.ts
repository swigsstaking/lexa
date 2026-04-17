import axios, { type AxiosInstance } from "axios";

export type VllmGenerateOptions = {
  /** System prompt (role=system) — distinct du prompt utilisateur */
  systemPrompt?: string;
  /** User prompt (role=user) */
  prompt: string;
  /** Model served by vLLM (must match --served-model-name or HF id) */
  model: string;
  temperature?: number;
  /** Max completion tokens */
  numPredict?: number;
  /** Forces response_format: {type: "json_object"} — vLLM guided JSON */
  format?: "json";
  /** Disable Qwen 3.x thinking mode */
  think?: boolean;
};

export type VllmGenerateResult = {
  response: string;
  evalCount: number;
  totalDurationMs: number;
};

export class VllmClient {
  private http: AxiosInstance;

  constructor(baseUrl: string, timeoutMs = 120_000) {
    this.http = axios.create({
      baseURL: baseUrl.replace(/\/$/, ""),
      timeout: timeoutMs,
    });
  }

  async generate(opts: VllmGenerateOptions): Promise<VllmGenerateResult> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.numPredict ?? 100,
      chat_template_kwargs: { enable_thinking: opts.think ?? false },
    };
    if (opts.format === "json") {
      body.response_format = { type: "json_object" };
    }

    const start = Date.now();
    const { data } = await this.http.post<{
      choices: Array<{ message: { content: string } }>;
      usage: { completion_tokens: number };
    }>("/v1/chat/completions", body);
    const elapsed = Date.now() - start;

    return {
      response: data.choices?.[0]?.message?.content ?? "",
      evalCount: data.usage?.completion_tokens ?? 0,
      totalDurationMs: elapsed,
    };
  }

  /** Health check — retourne true si vLLM est opérationnel */
  async healthCheck(): Promise<boolean> {
    try {
      const { status } = await this.http.get("/v1/models", { timeout: 5000 });
      return status === 200;
    } catch {
      return false;
    }
  }
}

export const vllm = new VllmClient(
  process.env.VLLM_URL ?? "http://192.168.110.103:8100",
);
