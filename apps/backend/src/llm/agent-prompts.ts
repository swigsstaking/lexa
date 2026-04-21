/**
 * agent-prompts.ts — System prompts extraits des Modelfiles Ollama pour injection vLLM.
 *
 * Source: agent-prompts-data.json (42KB, 14 modelfiles avec system_prompt + params Ollama)
 * Utilisé par les agents migrés vLLM pour injecter le system prompt en mode chat.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

type AgentParams = {
  temperature?: number;
  num_predict?: number;
  num_ctx?: number;
  top_k?: number;
  top_p?: number;
  repeat_penalty?: number;
  presence_penalty?: number;
  num_gpu?: number;
};

type AgentPromptEntry = {
  system: string;
  params: AgentParams;
};

type RawEntry = {
  modelfile: string;
  system_prompt: string;
  params: AgentParams;
};

function loadPrompts(): Record<string, AgentPromptEntry> {
  const raw = readFileSync(join(__dirname, "agent-prompts-data.json"), "utf-8");
  const entries: RawEntry[] = JSON.parse(raw);
  const result: Record<string, AgentPromptEntry> = {};
  for (const e of entries) {
    result[e.modelfile] = {
      system: e.system_prompt,
      params: e.params,
    };
  }
  return result;
}

export const AGENT_PROMPTS: Record<string, AgentPromptEntry> = loadPrompts();

/**
 * Retourne le system prompt pour un modelfile donné.
 * Retourne une chaîne vide si la clé n'existe pas (fallback sécurisé).
 */
export function getAgentPrompt(modelfile: string): string {
  return AGENT_PROMPTS[modelfile]?.system ?? "";
}

/**
 * Retourne les params Ollama pour un modelfile donné (temperature, num_predict, etc.).
 */
export function getAgentParams(modelfile: string): AgentParams {
  return AGENT_PROMPTS[modelfile]?.params ?? {};
}
