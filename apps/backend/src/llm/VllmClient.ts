import axios, { type AxiosInstance } from "axios";

export type VllmGenerateOptions = {
  /** System prompt (role=system) — distinct du prompt utilisateur */
  systemPrompt?: string;
  /** User prompt (role=user) */
  prompt: string;
  /** Model served by vLLM (must match --served-model-name or HF id) */
  model: string;
  temperature?: number;
  /** Nucleus sampling — typiquement 0.9. Forcer 0.1 pour greedy-like. */
  topP?: number;
  /** Top-K sampling (extension vLLM, pas OpenAI-standard). 1 = greedy déterministe. */
  topK?: number;
  /** Pénalité de répétition (extension vLLM). 1.0 = aucune pénalité. */
  repetitionPenalty?: number;
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

export type VllmStreamChunk = {
  delta: string;
  done: boolean;
  finishReason?: string;
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
    if (opts.topP !== undefined) body.top_p = opts.topP;
    if (opts.topK !== undefined) body.top_k = opts.topK;
    if (opts.repetitionPenalty !== undefined) body.repetition_penalty = opts.repetitionPenalty;
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

  /**
   * Streaming SSE — POST /v1/chat/completions avec stream:true
   * Retourne un AsyncGenerator qui yield chaque delta de token.
   * Usage: for await (const chunk of vllm.generateStream(opts)) { ... }
   */
  async *generateStream(opts: VllmGenerateOptions): AsyncGenerator<VllmStreamChunk> {
    const body: Record<string, unknown> = {
      model: opts.model,
      messages: [
        ...(opts.systemPrompt ? [{ role: "system", content: opts.systemPrompt }] : []),
        { role: "user", content: opts.prompt },
      ],
      temperature: opts.temperature ?? 0.1,
      max_tokens: opts.numPredict ?? 100,
      chat_template_kwargs: { enable_thinking: opts.think ?? false },
      stream: true,
    };
    if (opts.topP !== undefined) body.top_p = opts.topP;
    if (opts.topK !== undefined) body.top_k = opts.topK;
    if (opts.repetitionPenalty !== undefined) body.repetition_penalty = opts.repetitionPenalty;
    if (opts.format === "json") {
      body.response_format = { type: "json_object" };
    }

    // Utiliser fetch natif pour le streaming (axios ne supporte pas bien SSE)
    const baseURL = (this.http.defaults.baseURL ?? "").replace(/\/$/, "");
    const response = await fetch(`${baseURL}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!response.ok || !response.body) {
      const errText = await response.text().catch(() => "unknown");
      throw new Error(`vLLM stream error ${response.status}: ${errText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // Traiter les lignes SSE complètes
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? ""; // Garder le fragment incomplet

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const data = trimmed.slice(5).trim();
          if (data === "[DONE]") {
            yield { delta: "", done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{
                delta?: { content?: string };
                finish_reason?: string | null;
              }>;
            };
            const choice = parsed.choices?.[0];
            if (!choice) continue;

            const content = choice.delta?.content ?? "";
            const finishReason = choice.finish_reason ?? undefined;
            const isDone = !!finishReason;

            if (content || isDone) {
              yield { delta: content, done: isDone, finishReason };
            }
          } catch {
            // Ignorer les lignes SSE malformées
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
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
