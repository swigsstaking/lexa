import { query } from "../db/postgres.js";
import type { LexaEvent, EventRecord } from "./types.js";

type EventRow = {
  id: string;
  tenant_id: string;
  stream_id: string;
  sequence: string;
  type: string;
  payload: LexaEvent["payload"];
  metadata: Record<string, unknown>;
  occurred_at: Date;
  recorded_at: Date;
};

function toRecord(row: EventRow): EventRecord {
  return {
    id: Number(row.id),
    tenantId: row.tenant_id,
    streamId: row.stream_id,
    sequence: Number(row.sequence),
    type: row.type as LexaEvent["type"],
    payload: row.payload,
    metadata: row.metadata,
    occurredAt: row.occurred_at,
    recordedAt: row.recorded_at,
  };
}

export class EventStore {
  async append(params: {
    tenantId: string;
    streamId: string;
    event: LexaEvent;
    metadata?: Record<string, unknown>;
    occurredAt?: Date;
  }): Promise<EventRecord> {
    const { tenantId, streamId, event, metadata = {}, occurredAt = new Date() } = params;

    const nextSeqResult = await query<{ next_seq: string }>(
      `SELECT COALESCE(MAX(sequence), 0) + 1 AS next_seq
       FROM events WHERE tenant_id = $1 AND stream_id = $2`,
      [tenantId, streamId],
    );
    const sequence = Number(nextSeqResult.rows[0]?.next_seq ?? 1);

    const insertResult = await query<EventRow>(
      `INSERT INTO events (tenant_id, stream_id, sequence, type, payload, metadata, occurred_at)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7)
       RETURNING *`,
      [
        tenantId,
        streamId,
        sequence,
        event.type,
        JSON.stringify(event.payload),
        JSON.stringify(metadata),
        occurredAt,
      ],
    );

    return toRecord(insertResult.rows[0]!);
  }

  async readStream(params: {
    tenantId: string;
    streamId: string;
    fromSequence?: number;
  }): Promise<EventRecord[]> {
    const { tenantId, streamId, fromSequence = 0 } = params;
    const result = await query<EventRow>(
      `SELECT * FROM events
       WHERE tenant_id = $1 AND stream_id = $2 AND sequence >= $3
       ORDER BY sequence ASC`,
      [tenantId, streamId, fromSequence],
    );
    return result.rows.map(toRecord);
  }

  async readByType(params: {
    tenantId: string;
    type: string;
    limit?: number;
  }): Promise<EventRecord[]> {
    const { tenantId, type, limit = 100 } = params;
    const result = await query<EventRow>(
      `SELECT * FROM events
       WHERE tenant_id = $1 AND type = $2
       ORDER BY occurred_at DESC
       LIMIT $3`,
      [tenantId, type, limit],
    );
    return result.rows.map(toRecord);
  }

  async count(tenantId: string): Promise<number> {
    const result = await query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM events WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(result.rows[0]?.count ?? 0);
  }
}

export const eventStore = new EventStore();
