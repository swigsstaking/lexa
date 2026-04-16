/**
 * handleLlmError — Mappe les erreurs LLM queue en réponses HTTP propres.
 *
 * | Erreur                  | HTTP | body.error         |
 * |-------------------------|------|--------------------|
 * | LlmQueueTimeoutError    | 504  | agent_timeout      |
 * | Ollama 500 / network    | 502  | agent_unavailable  |
 * | Validation (zod)        | 400  | invalid_body       |
 * | Inconnu                 | 500  | agent_failed       |
 *
 * Fix BUG-P3-01 — Session 2026-04-16 Lane D vague 2.
 */

import type { Response } from "express";
import { LlmQueueTimeoutError } from "../services/LlmQueue.js";

export function handleLlmError(err: unknown, res: Response, agentLabel: string): void {
  if (err instanceof LlmQueueTimeoutError) {
    res.status(504).json({
      error: "agent_timeout",
      message: `L'agent ${agentLabel} prend trop de temps à répondre. Réessayez dans quelques instants.`,
      retryAfter: 30,
    });
    return;
  }

  const message = err instanceof Error ? err.message : String(err);

  // Ollama down / réseau → 502
  if (
    message.includes("ECONNREFUSED") ||
    message.includes("ECONNRESET") ||
    message.includes("model runner") ||
    message.includes("Internal Server Error")
  ) {
    res.status(502).json({
      error: "agent_unavailable",
      message: `L'agent ${agentLabel} est temporairement indisponible. Réessayez dans quelques instants.`,
    });
    return;
  }

  // Erreur inconnue → 500
  res.status(500).json({
    error: "agent_failed",
    message,
  });
}
