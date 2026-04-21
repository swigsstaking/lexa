/**
 * ConseillerAgent — 15ème agent Lexa (session 31)
 *
 * Agent d'optimisation fiscale proactive :
 * - Détection d'opportunités fiscales légitimes
 * - Réponses "et si ?" avec chiffres précis
 * - Briefing quotidien synthétique
 *
 * Model: lexa-conseiller (Spark DGX, basé sur lexa-audit)
 * Sources tier 0: LIFD art. 33 + 58 + 62 + 63 + 68 + 75, LHID art. 24-31, CO art. 960, Notice A AFC
 */

import { embedder } from "../../rag/EmbedderClient.js";
import { qdrant, type QdrantHit } from "../../rag/QdrantClient.js";
import { ollama } from "../../llm/OllamaClient.js";
import { vllm } from "../../llm/VllmClient.js";
import { AGENT_PROMPTS } from "../../llm/agent-prompts.js";

/**
 * REGLES STRICTES — Plafonds 3a OPP3 (à respecter absolument)
 * Source : OPP3 art. 7 al. 1 + Notice AFC mise à jour annuellement.
 *
 * Ces règles sont injectées dans TOUS les prompts du ConseillerAgent
 * pour éviter toute hallucination sur les plafonds 3a.
 */
const RULES_3A = `
RÈGLES STRICTES — Plafonds 3a OPP3 (à respecter absolument) :

| Statut                          | Plafond 2025/2026              |
|---------------------------------|--------------------------------|
| Salarié affilié à une LPP       | 7'258 CHF                      |
| Indépendant SANS LPP            | 20% du revenu net, plafonné à 36'288 CHF |

AVANT de citer un plafond 3a, TU DOIS demander à l'utilisateur :
- "Êtes-vous salarié ou indépendant ?"
- "Si salarié, êtes-vous affilié à une caisse de pension LPP ?"

NE JAMAIS inventer un plafond unique.
NE JAMAIS citer 35'000 CHF ou tout autre chiffre intermédiaire non officiel.

Source : OPP3 art. 7 al. 1 + Notice AFC mise à jour annuellement.
`;

export type ConseillerQuery = {
  question: string;
  year?: number;
  context?: {
    canton?: "VS" | "GE" | "VD" | "FR";
    entityType?: "pp" | "pm";
    civilStatus?: "single" | "married";
    currentIncome?: number;
    companyProfit?: number;
  };
};

export type ConseillerAnswer = {
  answer: string;
  citations: Array<{
    law: string;
    article: string;
    heading?: string;
    score: number;
    url?: string;
  }>;
  disclaimer: string;
  durationMs: number;
  model: string;
};

/**
 * ConseillerAgent — Agent conseiller optimisation fiscale proactive.
 *
 * Re-ranking tier 0: LIFD art. 33 + 58 + 62 + 63 + 68 (fiscal PP/PM)
 * Tier 1: LHID art. 24-31 (harmonisation cantonale)
 * Tier 2: CO art. 960 (évaluation actifs), Notice A AFC (amortissements)
 * Tier 3: lois cantonales (LF VS, LIPP GE, LI VD, LICD FR)
 */
export class ConseillerAgent {
  private readonly model = "lexa-conseiller";
  private readonly useVllm = process.env.USE_VLLM_CONSEILLER === "true";
  private readonly vllmModel = process.env.VLLM_MODEL ?? "apolo13x/Qwen3.5-35B-A3B-NVFP4";
  private readonly systemPrompt = AGENT_PROMPTS["lexa-conseiller"]?.system ?? "";

  async ask(query: ConseillerQuery): Promise<ConseillerAnswer> {
    const started = Date.now();

    // 1. Enrichir la question avec le contexte
    const enriched = this.enrichQuestion(query);

    // 2. Embed + Qdrant search
    const qVec = await embedder.embedOne(enriched);
    const hits = await qdrant.search({ vector: qVec, limit: 8 });

    // 3. Re-rank: boost LIFD art. 33/58/62/63/68 (sources conseiller)
    const rankedHits = this.rankConseillerSources(hits).slice(0, 5);

    // 4. Build RAG context
    const contextLines = rankedHits.map((h, i) => {
      const p = h.payload;
      const src = p.rs ? `[${p.law} (${p.rs}) art.${p.article}]` : `[${p.law} art.${p.article}]`;
      return `${i + 1}. ${src} ${p.heading ?? ""}\n${p.text.slice(0, 600)}`;
    });
    const context = contextLines.join("\n\n---\n\n");

    const prompt = `SOURCES LEGALES OPTIMISATION FISCALE (LIFD art.33+58+62+63+68, LHID art.24-31, CO art.960):
${context}
${RULES_3A}
QUESTION CONSEILLER: ${enriched}

Reponds avec le format : Constat -> Opportunite -> Chiffres -> Hypotheses -> Disclaimer.
Cite les articles pertinents (LIFD art.33 pour LPP/3a, LIFD art.62 pour amortissements, CO art.960 pour evaluation actifs).
Toujours quantifier l'economie estimee en CHF avec hypotheses explicites.
Respecte ABSOLUMENT les plafonds 3a ci-dessus — ne jamais inventer ni interpoler un chiffre.
Disclaimer final obligatoire : "Conseil indicatif, verifiez avec votre fiduciaire avant decision."

REPONSE CONSEILLER:`;

    let response: string;
    if (this.useVllm) {
      try {
        const result = await vllm.generate({
          model: this.vllmModel,
          systemPrompt: this.systemPrompt,
          prompt,
          temperature: 0.2,
          numPredict: 1000,
          think: false,
        });
        response = result.response;
        console.log(`[conseiller] vLLM ${this.vllmModel} — ${result.totalDurationMs}ms, ${result.evalCount} tokens`);
      } catch (err) {
        console.warn("[conseiller] vLLM failed, falling back to Ollama:", (err as Error).message);
        const { response: ollamaResponse } = await ollama.generate({
          model: this.model,
          prompt,
          temperature: 0.2,
        });
        response = ollamaResponse;
      }
    } else {
      const { response: ollamaResponse } = await ollama.generate({
        model: this.model,
        prompt,
        temperature: 0.2,
      });
      response = ollamaResponse;
    }

    // 5. Extract citations
    const citations = rankedHits.map((h) => ({
      law: h.payload.law,
      article: h.payload.article,
      heading: h.payload.heading,
      score: h.score,
      url: h.payload.url,
    }));

    return {
      answer: response.trim(),
      citations,
      disclaimer:
        "Conseil indicatif — non substitutif d'un conseil fiduciaire personnalisé. " +
        "Les simulations sont basées sur des barèmes approximatifs 2026.",
      durationMs: Date.now() - started,
      model: this.model,
    };
  }

  private enrichQuestion(query: ConseillerQuery): string {
    let q = query.question;
    if (query.year) {
      q = `[Exercice ${query.year}] ${q}`;
    }
    if (query.context) {
      const ctx = query.context;
      const parts: string[] = [];
      if (ctx.canton) parts.push(`Canton: ${ctx.canton}`);
      if (ctx.entityType) parts.push(`Type: ${ctx.entityType === "pp" ? "Personne physique" : "Personne morale"}`);
      if (ctx.civilStatus) parts.push(`Statut civil: ${ctx.civilStatus === "married" ? "marié" : "célibataire"}`);
      if (ctx.currentIncome) parts.push(`Revenu imposable: ${ctx.currentIncome.toLocaleString("fr-CH")} CHF`);
      if (ctx.companyProfit) parts.push(`Bénéfice société: ${ctx.companyProfit.toLocaleString("fr-CH")} CHF`);
      if (parts.length > 0) {
        q = `${q}\n\nContexte: ${parts.join(", ")}`;
      }
    }
    return q;
  }

  /**
   * generateDailyBriefing — Génère un briefing fiscal matinal via Ollama.
   *
   * Appelé par BriefingScheduler chaque matin à 6h pour chaque tenant actif.
   * Timeout graceful: si le LLM prend >45s, on retourne un briefing minimal sans crash.
   */
  async generateDailyBriefing(input: {
    tenantId: string;
    year: number;
    alerts: Array<{ kind: string; deadline: string; amount?: number; description: string }>;
    pendingClassifications: number;
    healthScore: { balance: number; revenueDelta: number; expenseDelta: number; ratio: number };
  }): Promise<{ content: Record<string, unknown>; markdown: string }> {
    const today = new Date().toLocaleDateString("fr-CH", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const alertsText =
      input.alerts.length > 0
        ? input.alerts.map((a) => `- [${a.kind.toUpperCase()}] ${a.description} (échéance: ${a.deadline}${a.amount ? `, ~${a.amount.toLocaleString("fr-CH")} CHF` : ""})`).join("\n")
        : "Aucune alerte urgente dans les 30 prochains jours.";

    const prompt = `Tu es le Conseiller fiscal Lexa. Génère un briefing matinal en Markdown pour le tenant ${input.tenantId}, année ${input.year}.
${RULES_3A}
DATE: ${today}

CONTEXTE:
- Alertes fiscales prochaines (30 jours):
${alertsText}
- Transactions en attente de classification: ${input.pendingClassifications}
- Score santé comptable: balance CHF ${input.healthScore.balance.toLocaleString("fr-CH")}, ratio revenus/charges ${input.healthScore.ratio}, delta revenus M-1: ${input.healthScore.revenueDelta > 0 ? "+" : ""}${Math.round(input.healthScore.revenueDelta)}%, delta charges M-1: ${input.healthScore.expenseDelta > 0 ? "+" : ""}${Math.round(input.healthScore.expenseDelta)}%

Format Markdown, ton chaleureux mais concis, structure EXACTE:
# Briefing du ${today}
## À faire aujourd'hui (échéances < 7 jours)
## Points de vigilance (alertes, anomalies)
## Opportunités d'optimisation (rachat LPP, 3a, dividende/salaire si applicable)
## Santé du dossier (score, tendance)

Max 400 mots. En français. Cite les articles de loi pertinents (LTVA art. 71, LIFD art. 33/161, LHID) quand applicable.
Si aucune alerte urgente, le dire positivement. Si des transactions sont en attente, encourager la classification.`;

    try {
      const llmCall = this.useVllm
        ? vllm.generate({
            model: this.vllmModel,
            systemPrompt: this.systemPrompt,
            prompt,
            temperature: 0.3,
            numPredict: 1000,
            think: false,
          }).then((r) => ({ response: r.response }))
        : ollama.generate({
            model: this.model,
            prompt,
            temperature: 0.3,
          });
      const result = await Promise.race([
        llmCall,
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("LLM timeout after 45s")), 45_000),
        ),
      ]) as { response: string };

      return {
        content: { ...input, generatedAt: new Date().toISOString() },
        markdown: result.response.trim(),
      };
    } catch (err) {
      console.warn(`[ConseillerAgent] generateDailyBriefing timeout/error:`, (err as Error).message);

      // Fallback minimal — ne pas crasher le scheduler
      const fallbackMd = `# Briefing du ${today}

## À faire aujourd'hui
${input.alerts.filter((a) => { const d = new Date(a.deadline); const in7 = new Date(Date.now() + 7 * 86400 * 1000); return d <= in7; }).map((a) => `- ${a.description} (${a.deadline})`).join("\n") || "Aucune échéance urgente."}

## Points de vigilance
${input.alerts.map((a) => `- ${a.description}`).join("\n") || "Aucune alerte dans les 30 jours."}
${input.pendingClassifications > 0 ? `\n- ${input.pendingClassifications} transaction(s) en attente de classification.` : ""}

## Opportunités d'optimisation
- Vérifiez votre pilier 3a 2026 (plafond 7'260 CHF — LIFD art. 33 al. 1 e)
- Rachat LPP possible selon votre certificat de prévoyance (LIFD art. 33 al. 1 d)

## Santé du dossier
Balance: CHF ${input.healthScore.balance.toLocaleString("fr-CH")} — ratio revenus/charges: ${input.healthScore.ratio}

_Briefing généré en mode dégradé — conseil indicatif, vérifiez avec votre fiduciaire._`;

      return {
        content: { ...input, generatedAt: new Date().toISOString(), fallback: true },
        markdown: fallbackMd,
      };
    }
  }

  /**
   * Re-rank hits pour sources conseiller:
   * - LIFD art.33 → +0.35 (LPP, 3a — déductions phares)
   * - LIFD art.58-68 → +0.3 (bénéfice PM, amortissements)
   * - LIFD art.62-63 → +0.3 (amortissements + provisions)
   * - LHID art.24-31 → +0.2 (harmonisation)
   * - CO art.960 → +0.2 (évaluation actifs)
   * - Lois cantonales → +0.1
   */
  private rankConseillerSources(hits: QdrantHit[]): QdrantHit[] {
    return hits
      .map((h) => {
        let boost = 0;
        const law = (h.payload.law ?? "").toUpperCase();
        const art = parseInt(String(h.payload.article ?? ""), 10);

        if (law === "LIFD") {
          if (art === 33) boost = 0.35; // déductions LPP + 3a
          else if (art >= 58 && art <= 68) boost = 0.3; // fiscal PM + amortissements
          else if (art === 62 || art === 63) boost = 0.3; // amortissements + provisions
          else if (art === 75) boost = 0.2; // déductions PP
          else boost = 0.1;
        } else if (law === "LHID") {
          if (art >= 24 && art <= 31) boost = 0.2;
        } else if (law === "CO" && art === 960) {
          boost = 0.2;
        } else if (["LF", "LIPP", "LI", "LICD"].includes(law)) {
          boost = 0.1; // lois cantonales
        }

        return { ...h, score: h.score + boost };
      })
      .sort((a, b) => b.score - a.score);
  }
}

export const conseillerAgent = new ConseillerAgent();
