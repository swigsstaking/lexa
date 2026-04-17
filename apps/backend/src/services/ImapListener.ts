/**
 * ImapListener — Poll IMAP toutes les N minutes pour les emails entrants.
 *
 * Désactivé automatiquement si IMAP_HOST absent (dev local sans credentials).
 * Phase 1 V1.2 — whitepaper "zéro saisie manuelle".
 */

import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { routeIncomingEmail } from "./EmailRouter.js";

export function startImapListener(): NodeJS.Timer | undefined {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASSWORD) {
    console.info("[imap] disabled (no IMAP env vars)");
    return undefined;
  }

  async function connectAndPoll(): Promise<void> {
    let client: ImapFlow | null = null;
    try {
      client = new ImapFlow({
        host: process.env.IMAP_HOST!,
        port: Number(process.env.IMAP_PORT ?? 993),
        secure: (process.env.IMAP_TLS ?? "true") === "true",
        auth: {
          user: process.env.IMAP_USER!,
          pass: process.env.IMAP_PASSWORD!,
        },
        logger: false,
      });
      await client.connect();
      await client.mailboxOpen("INBOX");

      // Fetch unseen messages UIDs
      const uids = await client.search({ seen: false }, { uid: true });
      if (!uids || uids.length === 0) {
        await client.logout();
        return;
      }

      console.info(`[imap] found ${uids.length} unseen message(s)`);

      for (const uid of uids) {
        try {
          const msg = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (!msg || !msg.source) continue;
          const parsed = await simpleParser(msg.source);
          await routeIncomingEmail(parsed);
          // Marquer comme lu
          await client.messageFlagsAdd({ uid: String(uid) }, ["\\Seen"], { uid: true });
        } catch (err) {
          console.warn("[imap] message fetch/parse failed:", (err as Error).message);
        }
      }
      await client.logout();
    } catch (err) {
      console.error("[imap] connection error:", (err as Error).message);
      if (client) {
        try {
          await client.logout();
        } catch {
          // ignore logout errors
        }
      }
    }
  }

  // Premier run immédiat, puis poll périodique
  void connectAndPoll();
  const pollMs = Number(process.env.IMAP_POLL_INTERVAL_MS ?? 300_000);
  const interval = setInterval(() => void connectAndPoll(), pollMs);

  console.info(`[imap] listener started, polling every ${pollMs / 1000}s`);
  return interval;
}
