import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pool, query, closePool } from "./postgres.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const MIGRATIONS_DIR = join(__dirname, "migrations");

async function ensureMigrationsTable(): Promise<void> {
  await query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     TEXT PRIMARY KEY,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function appliedMigrations(): Promise<Set<string>> {
  const result = await query<{ version: string }>("SELECT version FROM schema_migrations");
  return new Set(result.rows.map((r) => r.version));
}

async function runMigration(filename: string): Promise<void> {
  const version = filename.replace(/\.sql$/, "");
  const sql = readFileSync(join(MIGRATIONS_DIR, filename), "utf-8");
  console.log(`-> applying ${version}`);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`   OK ${version}`);
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

async function main(): Promise<void> {
  await ensureMigrationsTable();
  const already = await appliedMigrations();

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  let applied = 0;
  for (const file of files) {
    const version = file.replace(/\.sql$/, "");
    if (already.has(version)) {
      console.log(`-- skipping ${version} (already applied)`);
      continue;
    }
    await runMigration(file);
    applied += 1;
  }

  console.log(`\n${applied} migration(s) applied.`);
  await closePool();
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
