/**
 * GET /jobs/:id — Status endpoint for LLM queue jobs.
 *
 * Returns job status and result (if completed).
 * Useful for debugging queue state and future async mode (V1.1).
 *
 * Session 37: BullMQ queue per tenant.
 */
import { Router } from "express";
import { Queue, Job } from "bullmq";
import { config } from "../config/index.js";
import { requireAuth } from "../middleware/requireAuth.js";

export const jobsRouter = Router();

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  enableOfflineQueue: false,
  lazyConnect: true,
};

/**
 * GET /jobs/:id?tenant=<tenantId>
 * Query params:
 *   - tenant: tenant UUID (defaults to req.tenantId from JWT)
 *
 * Returns: { jobId, status, result?, error?, durationMs? }
 */
jobsRouter.get("/:id", requireAuth, async (req, res) => {
  const jobId = req.params["id"] as string;
  const tenantId = req.tenantId;

  if (!tenantId) {
    return res.status(400).json({ error: "missing tenantId" });
  }

  const queueName = `lexa-llm-${tenantId}`;
  const queue = new Queue(queueName, { connection: redisConnection });

  try {
    const job = await Job.fromId(queue, jobId);
    if (!job) {
      await queue.close();
      return res.status(404).json({ error: "job not found" });
    }

    const state = await job.getState();

    const response: Record<string, unknown> = {
      jobId: job.id,
      agentKey: (job.data as { agentKey?: string }).agentKey,
      status: state,
      attemptsMade: job.attemptsMade,
    };

    if (state === "completed") {
      response.result = job.returnvalue;
      const processedOn = job.processedOn ?? 0;
      const finishedOn = job.finishedOn ?? 0;
      if (processedOn && finishedOn) {
        response.durationMs = finishedOn - processedOn;
      }
    }

    if (state === "failed") {
      response.error = job.failedReason;
    }

    await queue.close();
    res.json(response);
  } catch (err) {
    await queue.close().catch(() => {});
    console.error("[jobs] status error:", err);
    res.status(500).json({ error: "failed to fetch job status", message: (err as Error).message });
  }
});
