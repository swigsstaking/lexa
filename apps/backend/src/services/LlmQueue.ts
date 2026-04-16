/**
 * LlmQueue — BullMQ queue per tenant to serialize Ollama requests.
 *
 * Session 37: Fixes concurrent timeout issue (3 simultaneous clients = 120s timeout).
 * Pattern: 1 queue + 1 worker per tenant, concurrency=1, serialize LLM calls.
 *
 * Anti-circular-import: agents register their handler via registerLlmHandler().
 * LlmQueue never imports agents directly.
 */
import { Queue, Worker, QueueEvents, type Job } from "bullmq";
import { config } from "../config/index.js";

// ── Redis connection ──────────────────────────────────────────────────────────

const redisConnection = {
  host: config.REDIS_HOST,
  port: config.REDIS_PORT,
  // Disable offline queue to fail fast if Redis is down
  enableOfflineQueue: false,
  // Prevent unhandled connection errors from crashing the process
  lazyConnect: true,
};

// ── Handler registry (avoids circular imports) ───────────────────────────────

type LlmHandler = (payload: unknown) => Promise<unknown>;
const handlers = new Map<string, LlmHandler>();

/**
 * Register an LLM handler for a given agent key.
 * Called from route files at startup, after agents are instantiated.
 */
export function registerLlmHandler(agentKey: string, fn: LlmHandler): void {
  handlers.set(agentKey, fn);
}

// ── Per-tenant queue / worker / queueEvents ───────────────────────────────────

interface TenantResources {
  queue: Queue;
  worker: Worker;
  queueEvents: QueueEvents;
  lastUsed: number;
}

const tenantResources = new Map<string, TenantResources>();

/** Lazy-init queue + worker + queueEvents for a tenant. */
function getResourcesForTenant(tenantId: string): TenantResources {
  const existing = tenantResources.get(tenantId);
  if (existing) {
    existing.lastUsed = Date.now();
    return existing;
  }

  const queueName = `lexa-llm-${tenantId}`;

  const queue = new Queue(queueName, {
    connection: redisConnection,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  // concurrency: 1 = serialize all LLM calls for this tenant
  const worker = new Worker(
    queueName,
    async (job: Job) => {
      const { agentKey, payload } = job.data as {
        agentKey: string;
        payload: unknown;
      };
      const handler = handlers.get(agentKey);
      if (!handler) {
        throw new Error(`No LLM handler registered for agentKey: "${agentKey}"`);
      }
      return handler(payload);
    },
    {
      connection: redisConnection,
      concurrency: 1,
    },
  );

  // QueueEvents needed for job.waitUntilFinished()
  const queueEvents = new QueueEvents(queueName, {
    connection: redisConnection,
  });

  // Propagate errors to stderr but don't crash
  worker.on("error", (err) => {
    console.error(`[LlmQueue] worker error (tenant=${tenantId}):`, err.message);
  });
  queueEvents.on("error", (err) => {
    console.error(`[LlmQueue] queueEvents error (tenant=${tenantId}):`, err.message);
  });
  queue.on("error", (err) => {
    console.error(`[LlmQueue] queue error (tenant=${tenantId}):`, err.message);
  });

  const resources: TenantResources = {
    queue,
    worker,
    queueEvents,
    lastUsed: Date.now(),
  };

  tenantResources.set(tenantId, resources);
  return resources;
}

// ── Idle cleanup (prevent RAM leak for inactive tenants) ──────────────────────
// Close resources for tenants idle for more than 30 minutes.
const IDLE_TTL_MS = 30 * 60 * 1000;

setInterval(async () => {
  const now = Date.now();
  for (const [tenantId, res] of tenantResources.entries()) {
    if (now - res.lastUsed > IDLE_TTL_MS) {
      try {
        await Promise.all([
          res.worker.close(),
          res.queueEvents.close(),
          res.queue.close(),
        ]);
      } catch {
        // Ignore close errors
      }
      tenantResources.delete(tenantId);
      console.info(`[LlmQueue] cleaned up idle tenant resources: ${tenantId}`);
    }
  }
}, IDLE_TTL_MS).unref(); // .unref() so the interval doesn't prevent process exit

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Enqueue an LLM call for a tenant and wait for the result (blocking await mode).
 *
 * If the queue is empty, execution is immediate.
 * If another job is running for the same tenant, this waits in line (serialize).
 *
 * @param tenantId - Tenant UUID (from req.tenantId)
 * @param agentKey - Handler key registered via registerLlmHandler()
 * @param payload  - Typed payload forwarded to the handler
 * @param options  - Optional: timeoutMs override (default: config.LLM_QUEUE_TIMEOUT_MS)
 */
/**
 * Erreur custom levée quand un job LLM dépasse le timeout configuré.
 * Permet aux routes de distinguer un timeout d'une autre erreur → HTTP 504.
 */
export class LlmQueueTimeoutError extends Error {
  constructor(agentKey: string, tenantId: string, timeoutMs: number) {
    super(`LLM queue timeout after ${timeoutMs}ms — agent: ${agentKey}, tenant: ${tenantId}`);
    this.name = "LlmQueueTimeoutError";
  }
}

export async function enqueueLlmCall(
  tenantId: string,
  agentKey: string,
  payload: unknown,
  options: { timeoutMs?: number } = {},
): Promise<unknown> {
  const { queue, queueEvents } = getResourcesForTenant(tenantId);
  const timeoutMs = options.timeoutMs ?? config.LLM_QUEUE_TIMEOUT_MS;

  const job = await queue.add(agentKey, { agentKey, payload });

  try {
    return await job.waitUntilFinished(queueEvents, timeoutMs);
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes("timed out") || err.message.includes("timeout"))
    ) {
      throw new LlmQueueTimeoutError(agentKey, tenantId, timeoutMs);
    }
    throw err;
  }
}

/** Graceful shutdown: close all tenant resources. */
export async function shutdownLlmQueue(): Promise<void> {
  await Promise.allSettled(
    [...tenantResources.values()].map(async (res) => {
      await res.worker.close();
      await res.queueEvents.close();
      await res.queue.close();
    }),
  );
  tenantResources.clear();
}
