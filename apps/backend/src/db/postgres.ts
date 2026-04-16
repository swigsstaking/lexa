import pg from "pg";
import { config } from "../config/index.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 5_000,
});

pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return pool.query<T>(sql, params as never);
}

export async function closePool(): Promise<void> {
  await pool.end();
}

/**
 * queryAsTenant — wrapper RLS V2 (préparé S32, activé session pre-launch)
 *
 * Exécute une query dans une transaction avec SET LOCAL app.active_tenant
 * pour que les policies RLS Postgres puissent filtrer par tenant.
 *
 * Usage actuel : NON activé en V1. Isolation = app-level via req.tenantId (JWT).
 * Activation : après migration 009 + ENABLE ROW LEVEL SECURITY sur les 4 tables.
 */
export async function queryAsTenant<T extends pg.QueryResultRow = pg.QueryResultRow>(
  tenantId: string,
  sql: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // set_config avec is_local=true est équivalent à SET LOCAL — valeur resetée en fin de transaction
    await client.query("SELECT set_config('app.active_tenant', $1, true)", [tenantId]);
    const result = await client.query<T>(sql, params as never);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
