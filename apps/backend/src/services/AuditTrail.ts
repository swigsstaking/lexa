/**
 * AuditTrail — Service d'audit trail agrégé (session 30)
 *
 * Agrège events + ai_decisions pour un tenant+year et retourne
 * une timeline structurée pour exportation fiduciaire.
 *
 * CO art. 958f : conservation 10 ans obligatoire
 * LTVA art. 70 : conservation TVA 10 ans
 */

import { queryAsTenant } from "../db/postgres.js";

export type AuditTrailEvent = {
  eventId: number;
  streamId: string;
  occurredAt: string;
  type: string;
  description?: string;
  amount?: number;
  currency?: string;
  // IA decision linked (si disponible)
  aiDecision?: {
    id: string;
    agent: string;
    model: string;
    confidence: number;
    reasoning?: string;
    citations: Array<{ law: string; article: string; rs?: string }>;
    alternatives: Array<{ account: string; confidence: number }>;
    createdAt: string;
  };
};

export type AuditTrailSummary = {
  tenantId: string;
  year: number;
  events: AuditTrailEvent[];
  stats: {
    totalEvents: number;
    totalAiDecisions: number;
    averageConfidence: number | null;
    citationsCount: number;
    lowConfidenceCount: number; // confidence < 0.7
    eventTypes: Record<string, number>;
  };
  legalBasis: {
    conservation: string;
    tva: string;
  };
  generatedAt: string;
};

/**
 * Construit l'audit trail pour un tenant et une année fiscale.
 */
export async function buildAuditTrail(
  tenantId: string,
  year: number,
): Promise<AuditTrailSummary> {
  const startDate = `${year}-01-01`;
  const endDate = `${year}-12-31`;

  // 1. Récupère tous les events de l'année
  const eventsResult = await queryAsTenant<{
    id: number;
    stream_id: string;
    occurred_at: string;
    type: string;
    payload: Record<string, unknown>;
  }>(
    tenantId,
    `SELECT id, stream_id, occurred_at, type, payload
     FROM events
     WHERE tenant_id = $1
       AND occurred_at >= $2::date
       AND occurred_at <= ($3::date + interval '1 day')
     ORDER BY occurred_at ASC`,
    [tenantId, startDate, endDate],
  );

  // 2. Récupère toutes les ai_decisions de l'année (via events JOIN)
  // Un seul queryAsTenant suffit — RLS s'applique aux deux tables du JOIN
  const decisionsResult = await queryAsTenant<{
    id: string;
    event_id: number;
    agent: string;
    model: string;
    confidence: string;
    reasoning: string | null;
    citations: Array<{ law: string; article: string; rs?: string }>;
    alternatives: Array<{ account: string; confidence: number }>;
    created_at: string;
  }>(
    tenantId,
    `SELECT ad.id, ad.event_id, ad.agent, ad.model, ad.confidence::text,
            ad.reasoning, ad.citations, ad.alternatives, ad.created_at::text
     FROM ai_decisions ad
     JOIN events e ON ad.event_id = e.id
     WHERE ad.tenant_id = $1
       AND e.occurred_at >= $2::date
       AND e.occurred_at <= ($3::date + interval '1 day')
     ORDER BY ad.created_at ASC`,
    [tenantId, startDate, endDate],
  );

  // 3. Build map eventId → aiDecision
  const decisionMap = new Map<number, (typeof decisionsResult.rows)[0]>();
  for (const d of decisionsResult.rows) {
    decisionMap.set(d.event_id, d);
  }

  // 4. Construit la timeline
  const events: AuditTrailEvent[] = eventsResult.rows.map((e) => {
    const payload = e.payload as Record<string, unknown>;
    const aiDec = decisionMap.get(e.id);

    const entry: AuditTrailEvent = {
      eventId: e.id,
      streamId: e.stream_id,
      occurredAt: e.occurred_at,
      type: e.type,
      description: typeof payload.description === "string" ? payload.description : undefined,
      amount: typeof payload.amount === "number" ? payload.amount :
              typeof payload.amountTtc === "number" ? payload.amountTtc : undefined,
      currency: typeof payload.currency === "string" ? payload.currency : "CHF",
    };

    if (aiDec) {
      entry.aiDecision = {
        id: aiDec.id,
        agent: aiDec.agent,
        model: aiDec.model,
        confidence: parseFloat(aiDec.confidence),
        reasoning: aiDec.reasoning ?? undefined,
        citations: Array.isArray(aiDec.citations) ? aiDec.citations : [],
        alternatives: Array.isArray(aiDec.alternatives) ? aiDec.alternatives : [],
        createdAt: aiDec.created_at,
      };
    }

    return entry;
  });

  // 5. Stats
  const eventTypeCounts: Record<string, number> = {};
  let totalConfidence = 0;
  let confidenceCount = 0;
  let citationsCount = 0;
  let lowConfidenceCount = 0;

  for (const e of events) {
    eventTypeCounts[e.type] = (eventTypeCounts[e.type] ?? 0) + 1;
    if (e.aiDecision) {
      totalConfidence += e.aiDecision.confidence;
      confidenceCount++;
      citationsCount += e.aiDecision.citations.length;
      if (e.aiDecision.confidence < 0.7) lowConfidenceCount++;
    }
  }

  return {
    tenantId,
    year,
    events,
    stats: {
      totalEvents: events.length,
      totalAiDecisions: decisionsResult.rows.length,
      averageConfidence: confidenceCount > 0
        ? Math.round((totalConfidence / confidenceCount) * 10000) / 10000
        : null,
      citationsCount,
      lowConfidenceCount,
      eventTypes: eventTypeCounts,
    },
    legalBasis: {
      conservation: "CO art. 958f (RS 220) — conservation 10 ans obligatoire",
      tva: "LTVA art. 70 (RS 641.20) — conservation documents TVA 10 ans",
    },
    generatedAt: new Date().toISOString(),
  };
}
