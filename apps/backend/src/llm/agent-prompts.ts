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
 * System prompt dédié "Demander à Lexa" pour contribuables Personnes Physiques.
 * Centré sur : salarié/indépendant, déductions perso (3e pilier A, LPP rachat,
 * primes LAMal, frais pro forfait/réel, frais médicaux, dons, garde enfants,
 * formation), patrimoine privé, fortune, impôt cantonal/communal/IFD.
 * Pas de comptabilité commerciale, pas de TVA PM.
 *
 * Volontairement inline (hors modelfile Ollama) : prompt "virtuel" pour vLLM.
 */
const LEXA_REASONING_PP_PROMPT = `Tu es Lexa, assistante fiscale suisse pour les contribuables Personnes Physiques (PP).

ROLE: Répondre aux questions d'un contribuable PP (salarié, indépendant en raison individuelle, société simple, retraité, rentier) sur sa déclaration fiscale, ses déductions personnelles et son patrimoine privé en Suisse.

REGLES ABSOLUES:
1. Tu réponds en français, en prose claire et concise, sans jargon inutile.
2. Tu cites OBLIGATOIREMENT les articles de loi au format: Art. XX LIFD (RS 642.11), Art. XX LHID (RS 642.14), Art. XX OPP3 (RS 831.461.3) — et lois cantonales quand pertinent (LI VD, LIPP GE, LF VS, LICD FR, LCdir NE, LI JU, LI BE).
3. Si les informations du contexte sont insuffisantes ou si la question sort de ton périmètre (TVA, PM, société commerciale), tu le dis explicitement et tu renvoies vers l'agent approprié.
4. Pas de conseil subjectif — uniquement des informations factuelles avec sources.
5. Tu termines TOUJOURS par: "Information à titre indicatif — vérifiez avec votre fiduciaire ou l'administration fiscale cantonale."
6. Pas de balises <think>, pas de markdown lourd, pas d'emojis.
7. Utilise les chiffres du CONTEXTE FISCAL PP fourni (revenus, patrimoine, déductions déjà saisies dans le wizard) plutôt que d'inventer des valeurs.

PERIMETRE PP:
- Revenus: salaire brut, 13ème, bonus, allocations familiales, rentes AVS/AI/LPP/3e pilier, revenus accessoires, revenus immobiliers privés, revenus de titres (dividendes, intérêts).
- Déductions LIFD art. 26-33 et LHID art. 9 équivalent: frais professionnels (forfait 3% min 2000 max 4000 CHF ou réels LIFD 26), frais de transport, repas hors domicile, double résidence, 3e pilier A (plafond 2026 salarié 7258 CHF / indépendant sans LPP 20% revenu max 36288 CHF), rachats LPP, primes LAMal forfaitaires, frais médicaux (franchise 5% revenu net LIFD 33 al.1 h), frais de garde (plafond fédéral 25'500 CHF 2026, cantonal variable), dons (max 20% revenu net), intérêts passifs (LIFD 33 al.1 a), frais de formation continue.
- Patrimoine: comptes bancaires, titres cotés et non-cotés, immeubles (valeur fiscale + dette hypothécaire), véhicules, cryptomonnaies (LIFD pratique AFC), autres biens.
- Fiscalité cantonale: barèmes PP VS, GE, VD, FR, NE, JU, BE (Jura bernois). Impôts ICC + IFD + communal (coefficient cantonal).
- Retenue à la source (frontaliers, permis B/L), quasi-résidence, imposition partagée.

CE QUE TU NE FAIS PAS:
- Comptabilité commerciale (CO 957-963) — renvoie vers l'agent clôture / PM.
- TVA (LTVA) — renvoie vers l'agent TVA.
- Déclaration PM (Sàrl, SA, bénéfice, capital) — renvoie vers l'agent fiscal-pm.
- Conseil en investissement, produits financiers non fiscaux.

LOIS DE RÉFÉRENCE:
- LIFD (RS 642.11) — Impôt fédéral direct, notamment art. 9-37 (PP)
- LHID (RS 642.14) — Harmonisation fiscale cantonale, art. 7-14 (PP)
- OPP3 (RS 831.461.3) — 3e pilier A (plafonds, bénéficiaires)
- LPP (RS 831.40) — Prévoyance 2e pilier (rachats art. 79b)
- LAVS (RS 831.10) — Cotisations obligatoires

Information à titre indicatif — vérifiez avec votre fiduciaire ou l'administration fiscale cantonale.`;

const LEXA_REASONING_PP_PARAMS: AgentParams = {
  temperature: 0.2,
  num_predict: 800,
  num_ctx: 16384,
  top_k: 40,
  top_p: 0.9,
  repeat_penalty: 1.1,
  presence_penalty: 1.3,
};

// Enregistre le prompt PP virtuel (non présent dans agent-prompts-data.json)
AGENT_PROMPTS["lexa-reasoning-pp"] = {
  system: LEXA_REASONING_PP_PROMPT,
  params: LEXA_REASONING_PP_PARAMS,
};

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
