import { randomUUID } from "node:crypto";
import { queryAsTenant } from "../db/postgres.js";
import { eventStore } from "../events/EventStore.js";
import type { EventRecord } from "../events/types.js";
import type { FilledForm, FilledVsPpForm } from "./types.js";

type DeclarationEventRow = {
  stream_id: string;
  id: string;
  payload: {
    formId: string;
    version: string;
    method: "effective" | "tdfn";
    period: {
      quarter?: 1 | 2 | 3 | 4;
      year: number;
      start: string;
      end: string;
    };
  };
};

/**
 * Retourne un `DeclarationGenerated` existant pour la même combinaison
 * (tenant, formId, version, method, year, quarter?) ou `null` sinon.
 *
 * L'idempotence est keyée sur les 5 champs structurants du décompte,
 * pas sur le streamId. Permet à l'UI de cliquer plusieurs fois "Générer"
 * sans polluer l'audit trail.
 */
export async function findExistingDeclaration(params: {
  tenantId: string;
  formId: string;
  version: string;
  method: "effective" | "tdfn";
  year: number;
  quarter?: 1 | 2 | 3 | 4;
}): Promise<{ streamId: string; eventId: number } | null> {
  const { tenantId, formId, version, method, year, quarter } = params;
  const quarterClause = quarter
    ? `AND (payload->'period'->>'quarter')::int = $6`
    : `AND NOT (payload->'period' ? 'quarter')`;
  const values: unknown[] = [tenantId, formId, version, method, year];
  if (quarter) values.push(quarter);

  const result = await queryAsTenant<DeclarationEventRow>(
    tenantId,
    `SELECT id::text, stream_id, payload
     FROM events
     WHERE tenant_id = $1
       AND type = 'DeclarationGenerated'
       AND payload->>'formId' = $2
       AND payload->>'version' = $3
       AND payload->>'method' = $4
       AND (payload->'period'->>'year')::int = $5
       ${quarterClause}
     ORDER BY occurred_at DESC
     LIMIT 1`,
    values,
  );
  const row = result.rows[0];
  if (!row) return null;
  return { streamId: row.stream_id, eventId: Number(row.id) };
}

/**
 * Persist un event `DeclarationGenerated` construit à partir d'un FilledForm.
 * Ne fait PAS le check d'idempotence — le caller doit l'avoir fait avec
 * `findExistingDeclaration` si souhaité.
 */
export async function appendDeclarationEvent(
  form: FilledForm,
): Promise<EventRecord> {
  const streamId = randomUUID();
  const period =
    form.period.kind === "quarterly"
      ? {
          quarter: form.period.quarter,
          year: form.period.year,
          start: form.period.start,
          end: form.period.end,
        }
      : {
          year: form.period.year,
          start: form.period.start,
          end: form.period.end,
        };

  return eventStore.append({
    tenantId: form.company.tenantId,
    streamId,
    event: {
      type: "DeclarationGenerated",
      payload: {
        formId: form.formId,
        version: form.version,
        formKind: "tva",
        method: form.method,
        period,
        totals: {
          caHt: form.projection.caHt,
          tvaDueTotal: form.projection.tvaDue.total,
          impotPrealableTotal: form.projection.impotPrealable.total,
          solde: form.projection.solde,
        },
        eventCount: form.projection.eventCount,
        generatedBy: "lexa",
        liability: "preparation_only",
      },
    },
    metadata: {
      source: "forms",
      kind: form.period.kind,
    },
  });
}

// ── VS-PP idempotence ──────────────────────────────────

/**
 * Retourne un event `DeclarationGenerated` existant pour une déclaration
 * fiscale PP Valais (keyé sur tenantId + formId + version + year).
 */
export async function findExistingVsPpDeclaration(params: {
  tenantId: string;
  formId: string;
  version: string;
  year: number;
}): Promise<{ streamId: string; eventId: number } | null> {
  const { tenantId, formId, version, year } = params;
  const result = await queryAsTenant<{ id: string; stream_id: string }>(
    tenantId,
    `SELECT id::text, stream_id
     FROM events
     WHERE tenant_id = $1
       AND type = 'DeclarationGenerated'
       AND payload->>'formId' = $2
       AND payload->>'version' = $3
       AND payload->>'formKind' = 'vs-pp'
       AND (payload->'period'->>'year')::int = $4
     ORDER BY occurred_at DESC
     LIMIT 1`,
    [tenantId, formId, version, year],
  );
  const row = result.rows[0];
  if (!row) return null;
  return { streamId: row.stream_id, eventId: Number(row.id) };
}

export async function appendVsPpDeclarationEvent(
  form: FilledVsPpForm,
): Promise<EventRecord> {
  const streamId = randomUUID();
  const period = {
    year: form.year,
    start: `${form.year}-01-01`,
    end: `${form.year}-12-31`,
  };

  return eventStore.append({
    tenantId: form.company.tenantId,
    streamId,
    event: {
      type: "DeclarationGenerated",
      payload: {
        formId: form.formId,
        version: form.version,
        formKind: "vs-pp",
        period,
        totals: {
          revenuTotal: form.projection.revenuTotal,
          fortuneNette: form.projection.fortuneNette,
          deductionTotal: form.projection.deductionTotal,
          revenuImposable: form.projection.revenuImposable,
        },
        eventCount: form.projection.eventCount,
        generatedBy: "lexa",
        liability: "preparation_only",
      },
    },
    metadata: {
      source: "forms",
      kind: "vs-pp",
      canton: form.company.canton,
    },
  });
}
