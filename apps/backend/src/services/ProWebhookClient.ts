import { createHmac } from "node:crypto";
import { config } from "../config/index.js";

/**
 * ProWebhookClient — session 20
 *
 * Notifie Swigs Pro après une classification Lexa.
 * POST HMAC-signé vers http://192.168.110.59:3003/api/integrations/lexa/webhook
 *
 * Signature canonique : sha256(${timestamp}.${rawBody})
 * Headers : X-Lexa-Signature: sha256=<hex>, X-Lexa-Timestamp: <unix-ms>
 *
 * Protection replay : timestamp inclus dans la signature canonique.
 * Pro vérifie que |now - ts| < 5 min.
 *
 * Retry naïf in-memory : 3 tentatives avec backoff 1s/5s/30s.
 * Si échec final : console.warn + continue (fire-and-forget).
 */

const RETRY_DELAYS_MS = [1_000, 5_000, 30_000];

interface Classification {
  debitAccount: string;
  creditAccount: string;
  tvaRate: number;
  tvaCode?: string;
  confidence: number;
  amountHt?: number;
  amountTtc?: number;
  citations?: Array<{ source?: string; article?: string | null; law: string }>;
}

export class ProWebhookClient {
  async notify(
    streamId: string,
    txId: string | undefined,
    classification: Classification,
  ): Promise<void> {
    if (!config.PRO_WEBHOOK_ENABLED) return;
    if (!txId) {
      console.warn("[pro-webhook] txId undefined, skip notify");
      return;
    }

    const body = JSON.stringify({
      txId,
      streamId,
      classification: {
        debitAccount: classification.debitAccount,
        creditAccount: classification.creditAccount,
        tvaRate: classification.tvaRate,
        tvaCode: classification.tvaCode ?? null,
        confidence: classification.confidence,
        amountHt: classification.amountHt ?? null,
        amountTtc: classification.amountTtc ?? null,
        citations: (classification.citations ?? []).map((c) => ({
          source: c.source ?? null,
          article: c.article ?? null,
          law: c.law,
        })),
      },
      classifiedAt: new Date().toISOString(),
    });

    for (let attempt = 1; attempt <= 3; attempt++) {
      const ts = Date.now().toString();
      const canonical = `${ts}.${body}`;
      const signature = createHmac("sha256", config.LEXA_WEBHOOK_SECRET)
        .update(canonical)
        .digest("hex");

      try {
        const resp = await fetch(config.PRO_WEBHOOK_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Lexa-Signature": `sha256=${signature}`,
            "X-Lexa-Timestamp": ts,
          },
          body,
          signal: AbortSignal.timeout(15_000),
        });

        console.log(
          `[pro-webhook] notify tx=%s attempt=%d status=%d`,
          txId,
          attempt,
          resp.status,
        );

        if (resp.ok) return;

        // 4xx non-retryable (bad request, not found, etc.)
        if (resp.status >= 400 && resp.status < 500) {
          console.warn(
            `[pro-webhook] tx=%s attempt=%d non-retryable status=%d`,
            txId,
            attempt,
            resp.status,
          );
          return;
        }

        // 5xx → retry
      } catch (err) {
        console.warn(
          `[pro-webhook] tx=%s attempt=%d network error: %s`,
          txId,
          attempt,
          (err as Error).message,
        );
      }

      if (attempt < 3) {
        await sleep(RETRY_DELAYS_MS[attempt - 1]!);
      }
    }

    console.warn(`[pro-webhook] tx=%s all 3 attempts failed, giving up`, txId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const proWebhookClient = new ProWebhookClient();
