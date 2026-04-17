import { randomUUID } from "node:crypto";
import { query, queryAsTenant } from "../db/postgres.js";
import { eventStore } from "../events/EventStore.js";
import {
  TaxpayerDraftStateSchema,
  type TaxpayerDraftState,
} from "./schema.js";

type TaxpayerDraftRow = {
  id: string;
  tenant_id: string;
  fiscal_year: number;
  state: TaxpayerDraftState;
  current_step: number;
  completed_at: Date | null;
  created_at: Date;
  updated_at: Date;
};

export type TaxpayerDraft = {
  id: string;
  tenantId: string;
  fiscalYear: number;
  state: TaxpayerDraftState;
  currentStep: number;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

function toPublic(row: TaxpayerDraftRow): TaxpayerDraft {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    fiscalYear: row.fiscal_year,
    state: TaxpayerDraftStateSchema.parse(row.state ?? {}),
    currentStep: row.current_step,
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

export async function getOrCreateDraft(
  tenantId: string,
  fiscalYear: number,
): Promise<TaxpayerDraft> {
  const existing = await queryAsTenant<TaxpayerDraftRow>(
    tenantId,
    `SELECT * FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = $2`,
    [tenantId, fiscalYear],
  );
  if (existing.rows[0]) {
    return toPublic(existing.rows[0]);
  }

  const emptyState = TaxpayerDraftStateSchema.parse({});
  const inserted = await queryAsTenant<TaxpayerDraftRow>(
    tenantId,
    `INSERT INTO taxpayer_drafts (tenant_id, fiscal_year, state, current_step)
     VALUES ($1, $2, $3::jsonb, 1)
     RETURNING *`,
    [tenantId, fiscalYear, JSON.stringify(emptyState)],
  );
  return toPublic(inserted.rows[0]!);
}

/**
 * Applique une mutation atomique de champ (dot-path) sur un draft.
 * Persist l'état complet + émet un event TaxpayerFieldUpdated pour audit.
 */
export async function updateField(params: {
  tenantId: string;
  userId: string;
  fiscalYear: number;
  step: number;
  field: string;
  value: unknown;
}): Promise<TaxpayerDraft> {
  const { tenantId, userId, fiscalYear, step, field, value } = params;
  const draft = await getOrCreateDraft(tenantId, fiscalYear);

  // Apply dot-path mutation on a clone of the state
  const nextState = structuredClone(draft.state) as Record<string, unknown>;
  const parts = field.split(".");
  let cursor: Record<string, unknown> = nextState;
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]!;
    const child = cursor[key];
    if (typeof child !== "object" || child === null) {
      cursor[key] = {};
    }
    cursor = cursor[key] as Record<string, unknown>;
  }
  // Empty string → delete field (let optional enums / fields fall back to undefined)
  // Fix bug E2E PP : select "État civil" avec option "—" envoyait '' qui failait Zod enum
  if (value === "" || value === null) {
    delete cursor[parts[parts.length - 1]!];
  } else {
    cursor[parts[parts.length - 1]!] = value;
  }

  // Re-parse to validate (will throw on invalid types)
  const validated = TaxpayerDraftStateSchema.parse(nextState);

  const updated = await queryAsTenant<TaxpayerDraftRow>(
    tenantId,
    `UPDATE taxpayer_drafts
     SET state = $1::jsonb, current_step = GREATEST(current_step, $2)
     WHERE tenant_id = $3 AND fiscal_year = $4
     RETURNING *`,
    [JSON.stringify(validated), step, tenantId, fiscalYear],
  );

  // Audit event (best-effort, ne bloque pas la mutation si l'append fail)
  try {
    await eventStore.append({
      tenantId,
      streamId: randomUUID(),
      event: {
        type: "TaxpayerFieldUpdated",
        payload: {
          fiscalYear,
          step,
          field,
          value,
          updatedBy: userId,
        },
      },
      metadata: { source: "taxpayers.updateField" },
    });
  } catch (err) {
    console.warn("[taxpayers] audit event append failed:", err);
  }

  return toPublic(updated.rows[0]!);
}

export async function markSubmitted(
  tenantId: string,
  fiscalYear: number,
): Promise<TaxpayerDraft> {
  const updated = await queryAsTenant<TaxpayerDraftRow>(
    tenantId,
    `UPDATE taxpayer_drafts
     SET completed_at = NOW()
     WHERE tenant_id = $1 AND fiscal_year = $2
     RETURNING *`,
    [tenantId, fiscalYear],
  );
  if (!updated.rows[0]) {
    throw new Error("draft not found");
  }
  return toPublic(updated.rows[0]);
}

export async function resetDraft(
  tenantId: string,
  fiscalYear: number,
): Promise<void> {
  await queryAsTenant(
    tenantId,
    `DELETE FROM taxpayer_drafts WHERE tenant_id = $1 AND fiscal_year = $2`,
    [tenantId, fiscalYear],
  );
}
