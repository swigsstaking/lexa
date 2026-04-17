/**
 * BriefingScheduler — Job BullMQ quotidien 6h du matin
 *
 * Génère un briefing fiscal pour chaque tenant actif (a des events < 60 jours).
 * Fail gracefully si Redis indisponible au startup.
 *
 * Session: briefing-quotidien (avril 2026)
 */

import { Queue, Worker } from "bullmq";
import { config } from "../config/index.js";
import { query, queryAsTenant } from "../db/postgres.js";
import { ConseillerAgent } from "../agents/conseiller/ConseillerAgent.js";

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  enableOfflineQueue: false,
};

export async function startBriefingScheduler(): Promise<void> {
  try {
    const queue = new Queue("briefings-daily", { connection: redisConnection });

    // Schedule: every day at 6:00 heure suisse (Europe/Zurich = UTC+1/+2)
    await queue.upsertJobScheduler(
      "generate-all-tenants",
      { pattern: "0 6 * * *", tz: "Europe/Zurich" },
      { name: "generate-all-tenants", data: {} },
    );

    const worker = new Worker(
      "briefings-daily",
      async () => {
        const { rows } = await query<{ tenant_id: string }>(
          `SELECT DISTINCT tenant_id FROM events
           WHERE occurred_at > now() - interval '60 days'`,
          [],
        );

        const year = new Date().getFullYear();
        console.log(`[briefings] Generating daily briefings for ${rows.length} active tenants (year ${year})`);

        for (const r of rows) {
          try {
            await generateBriefingForTenant(r.tenant_id, year);
          } catch (e) {
            console.warn(`[briefings] failed for tenant ${r.tenant_id}:`, (e as Error).message);
          }
        }
      },
      { connection: redisConnection, concurrency: 2 },
    );

    worker.on("error", (err) => console.error("[briefings] worker error:", err.message));
    worker.on("completed", (job) => console.log(`[briefings] job ${job.id} completed`));

    console.log("[briefings] BriefingScheduler started — cron 06:00 daily");
  } catch (err) {
    console.warn("[briefings] Failed to start BriefingScheduler (Redis unavailable?):", (err as Error).message);
    // Fail gracefully — ne pas crasher l'app
  }
}

export async function generateBriefingForTenant(tenantId: string, year: number): Promise<void> {
  const today = new Date().toISOString().slice(0, 10);

  // Skip si briefing déjà généré aujourd'hui
  const { rows: existing } = await queryAsTenant(
    tenantId,
    `SELECT id FROM briefings WHERE tenant_id = $1 AND date_for = $2`,
    [tenantId, today],
  );
  if (existing.length > 0) {
    console.log(`[briefings] Skipping tenant ${tenantId} — briefing already exists for ${today}`);
    return;
  }

  // Collecter les données
  const [alerts, pendingClassifications, healthScore] = await Promise.all([
    collectTaxAlerts(tenantId, year),
    collectPendingClassifications(tenantId),
    collectHealthScore(tenantId),
  ]);

  // Appel LLM via ConseillerAgent
  const agent = new ConseillerAgent();
  const briefing = await agent.generateDailyBriefing({
    tenantId,
    year,
    alerts,
    pendingClassifications,
    healthScore,
  });

  // Sauvegarder
  await queryAsTenant(
    tenantId,
    `INSERT INTO briefings (tenant_id, year, date_for, content, markdown)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (tenant_id, date_for) DO NOTHING`,
    [tenantId, year, today, JSON.stringify(briefing.content), briefing.markdown],
  );

  console.log(`[briefings] Generated briefing for tenant ${tenantId} (${today})`);
}

// ─── Helpers de collecte ────────────────────────────────────────────────────

async function collectTaxAlerts(
  tenantId: string,
  year: number,
): Promise<Array<{ kind: string; deadline: string; amount?: number; description: string }>> {
  const alerts: Array<{ kind: string; deadline: string; amount?: number; description: string }> = [];

  // Échéances TVA trimestrielles pour l'année en cours
  // Délai légal : 60 jours après fin de période (LTVA art. 71)
  const now = new Date();
  const tvaPeriods = [
    { quarter: 1, deadline: `${year}-05-31`, description: "Décompte TVA T1 (LTVA art. 71)" },
    { quarter: 2, deadline: `${year}-08-31`, description: "Décompte TVA T2 (LTVA art. 71)" },
    { quarter: 3, deadline: `${year}-11-30`, description: "Décompte TVA T3 (LTVA art. 71)" },
    { quarter: 4, deadline: `${year + 1}-02-28`, description: "Décompte TVA T4 (LTVA art. 71)" },
  ];

  const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const p of tvaPeriods) {
    const deadline = new Date(p.deadline);
    if (deadline >= now && deadline <= in30Days) {
      alerts.push({
        kind: "tva",
        deadline: p.deadline,
        description: p.description,
      });
    }
  }

  // Acompte IFD — délai 31 mars / 15 septembre (LIFD art. 161 al. 1)
  const ifdDeadlines = [
    { deadline: `${year}-03-31`, description: "Acompte IFD (LIFD art. 161)" },
    { deadline: `${year}-09-15`, description: "Acompte IFD 2ème versement (LIFD art. 161)" },
  ];
  for (const d of ifdDeadlines) {
    const deadline = new Date(d.deadline);
    if (deadline >= now && deadline <= in30Days) {
      alerts.push({ kind: "ifd", deadline: d.deadline, description: d.description });
    }
  }

  // Vérifier le volume de transactions récentes pour alerter sur activité élevée
  try {
    const { rows } = await queryAsTenant(
      tenantId,
      `SELECT COUNT(*) as cnt, SUM(ABS(amount)) as vol
       FROM events
       WHERE tenant_id = $1
         AND occurred_at > now() - interval '30 days'
         AND type = 'transaction'`,
      [tenantId],
    );
    const cnt = parseInt(rows[0]?.cnt ?? "0", 10);
    if (cnt > 50) {
      alerts.push({
        kind: "activity",
        deadline: now.toISOString().slice(0, 10),
        amount: parseFloat(rows[0]?.vol ?? "0"),
        description: `Volume élevé: ${cnt} transactions ce mois (vérification recommandée)`,
      });
    }
  } catch {
    // Non bloquant
  }

  return alerts;
}

async function collectPendingClassifications(tenantId: string): Promise<number> {
  try {
    const { rows } = await queryAsTenant(
      tenantId,
      `SELECT COUNT(*) as cnt
       FROM events
       WHERE tenant_id = $1
         AND type = 'transaction'
         AND (payload->>'classified')::boolean IS NOT TRUE
         AND occurred_at > now() - interval '90 days'`,
      [tenantId],
    );
    return parseInt(rows[0]?.cnt ?? "0", 10);
  } catch {
    return 0;
  }
}

async function collectHealthScore(tenantId: string): Promise<{
  balance: number;
  revenueDelta: number;
  expenseDelta: number;
  ratio: number;
}> {
  try {
    // Utilise la vue account_balance si elle existe, sinon aggregate des events
    const { rows } = await queryAsTenant(
      tenantId,
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as revenues,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expenses
       FROM events
       WHERE tenant_id = $1
         AND type = 'transaction'
         AND occurred_at > date_trunc('year', now())`,
      [tenantId],
    );

    const revenues = parseFloat(rows[0]?.revenues ?? "0");
    const expenses = parseFloat(rows[0]?.expenses ?? "0");
    const balance = revenues - expenses;
    const ratio = expenses > 0 ? revenues / expenses : 1;

    // Delta vs mois précédent
    const { rows: prevRows } = await queryAsTenant(
      tenantId,
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as revenues,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expenses
       FROM events
       WHERE tenant_id = $1
         AND type = 'transaction'
         AND occurred_at >= now() - interval '60 days'
         AND occurred_at < now() - interval '30 days'`,
      [tenantId],
    );

    const prevRevenues = parseFloat(prevRows[0]?.revenues ?? "0");
    const prevExpenses = parseFloat(prevRows[0]?.expenses ?? "0");

    const { rows: currRows } = await queryAsTenant(
      tenantId,
      `SELECT
         COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as revenues,
         COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) as expenses
       FROM events
       WHERE tenant_id = $1
         AND type = 'transaction'
         AND occurred_at >= now() - interval '30 days'`,
      [tenantId],
    );

    const currRevenues = parseFloat(currRows[0]?.revenues ?? "0");
    const currExpenses = parseFloat(currRows[0]?.expenses ?? "0");

    return {
      balance,
      revenueDelta: prevRevenues > 0 ? ((currRevenues - prevRevenues) / prevRevenues) * 100 : 0,
      expenseDelta: prevExpenses > 0 ? ((currExpenses - prevExpenses) / prevExpenses) * 100 : 0,
      ratio: Math.round(ratio * 100) / 100,
    };
  } catch {
    return { balance: 0, revenueDelta: 0, expenseDelta: 0, ratio: 1 };
  }
}
