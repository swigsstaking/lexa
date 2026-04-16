/**
 * CAMT.053 Parser — ISO 20022 Bank-to-Customer Statement (S39)
 *
 * Supporte : camt.053.001.04 (et variantes .001.02, .001.08)
 * Banques cibles : UBS, Raiffeisen, BCV, BCGE, Postfinance, etc.
 *
 * Limitations V1 :
 *  - Un seul Stmt par fichier (multi-Stmt loggué + premier pris)
 *  - Encoding UTF-8 uniquement
 *  - Montants en "." comme séparateur décimal (norme CAMT)
 */

import { XMLParser } from "fast-xml-parser";
import { randomUUID } from "node:crypto";

export type ParsedTransaction = {
  messageId: string;
  statementId: string;
  accountIban: string;
  accountName: string;
  currency: string;
  txId: string;
  amount: number;
  creditDebit: "CRDT" | "DBIT";
  bookingDate: string; // YYYY-MM-DD
  valueDate: string;   // YYYY-MM-DD
  counterpartyName?: string;
  counterpartyIban?: string;
  reference?: string;       // RmtInf.Ustrd
  structuredRef?: string;   // RmtInf.Strd.CdtrRefInf.Ref (QR-facture, BVR)
};

export type Camt053ParseResult = {
  messageId: string;
  statementId: string;
  accountIban: string;
  accountName: string;
  currency: string;
  createdAt: string;
  transactions: ParsedTransaction[];
  warnings: string[];
};

// fast-xml-parser configuré pour CAMT (attributs XML sur Amt/@Ccy)
const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  parseAttributeValue: false, // garder string pour montants
  isArray: (name) =>
    // Force ces éléments en array même s'il n'y en a qu'un
    ["Stmt", "Ntry", "TxDtls"].includes(name),
});

/**
 * Extrait le texte d'un nœud qui peut être :
 *   - une string directe "47.80"
 *   - un objet avec attribut {"#text": "47.80", "@_Ccy": "CHF"}
 */
function nodeText(node: unknown): string | undefined {
  if (typeof node === "string") return node;
  if (typeof node === "number") return String(node);
  if (node && typeof node === "object") {
    const obj = node as Record<string, unknown>;
    if (typeof obj["#text"] === "string") return obj["#text"];
    if (typeof obj["#text"] === "number") return String(obj["#text"]);
  }
  return undefined;
}

/** Parse une date CAMT (peut être YYYY-MM-DD ou DateTime) */
function parseDate(val: unknown): string {
  const str = nodeText(val);
  if (!str) return "";
  // Prend les 10 premiers caractères (YYYY-MM-DD)
  return str.slice(0, 10);
}

/**
 * Extrait le montant, en gérant les formes :
 *  - "47.80"                     → 47.80
 *  - {"#text":"47.80","@_Ccy":"CHF"} → 47.80
 *  - 47.80                       → 47.80
 */
function parseAmount(amtNode: unknown): number {
  const str = nodeText(amtNode);
  if (!str) return 0;
  const v = parseFloat(str.replace(",", "."));
  return isNaN(v) ? 0 : v;
}

/** Navigue en profondeur dans un objet en suivant un chemin "a.b.c" */
function dig(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((cur, key) => {
    if (cur && typeof cur === "object") {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Retourne la première valeur non-undefined parmi plusieurs chemins */
function first(...vals: unknown[]): unknown {
  return vals.find((v) => v !== undefined && v !== null && v !== "");
}

/**
 * Parse un fichier XML CAMT.053 et retourne les transactions extraites.
 *
 * @throws {Error} Si le fichier n'est pas un CAMT.053 valide
 */
export function parseCamt053(xmlContent: string): Camt053ParseResult {
  const warnings: string[] = [];

  let doc: Record<string, unknown>;
  try {
    doc = xmlParser.parse(xmlContent) as Record<string, unknown>;
  } catch (err) {
    throw new Error(`XML parse error: ${(err as Error).message}`);
  }

  // Le nœud racine peut être "Document" ou namespaced — on cherche les deux
  const root =
    (doc["Document"] as Record<string, unknown> | undefined) ??
    // Certaines banques exportent avec namespace explicite
    (Object.values(doc).find(
      (v) =>
        v &&
        typeof v === "object" &&
        "BkToCstmrStmt" in (v as Record<string, unknown>),
    ) as Record<string, unknown> | undefined);

  if (!root) {
    throw new Error("Invalid CAMT.053: missing Document root element");
  }

  const bkStmt = root["BkToCstmrStmt"] as Record<string, unknown> | undefined;
  if (!bkStmt) {
    throw new Error("Invalid CAMT.053: missing BkToCstmrStmt");
  }

  const grpHdr = bkStmt["GrpHdr"] as Record<string, unknown> | undefined;
  const messageId = nodeText(grpHdr?.["MsgId"]) ?? randomUUID();
  const createdAt = nodeText(grpHdr?.["CreDtTm"]) ?? "";

  // Stmt est toujours un array (forcé par isArray above)
  const stmts = (bkStmt["Stmt"] as unknown[]) ?? [];
  if (stmts.length === 0) {
    throw new Error("Invalid CAMT.053: no Stmt found");
  }
  if (stmts.length > 1) {
    warnings.push(
      `Multi-statement CAMT (${stmts.length} stmts) — V1 traite uniquement le premier`,
    );
  }

  const stmt = stmts[0] as Record<string, unknown>;

  const statementId = nodeText(stmt["Id"]) ?? messageId;
  const acct = stmt["Acct"] as Record<string, unknown> | undefined;
  const acctId = acct?.["Id"] as Record<string, unknown> | undefined;

  // IBAN peut être dans Id.IBAN ou Id.Othr.Id
  const accountIban =
    nodeText(acctId?.["IBAN"]) ??
    nodeText(dig(acctId, "Othr.Id")) ??
    "UNKNOWN";
  const currency =
    nodeText(acct?.["Ccy"]) ??
    nodeText(dig(acct, "Id.Ccy")) ??
    "CHF";
  const accountName =
    nodeText(dig(acct, "Ownr.Nm")) ?? "Unknown";

  // Ntry est toujours un array (forcé par isArray above)
  const entries = (stmt["Ntry"] as unknown[]) ?? [];
  if (entries.length === 0) {
    warnings.push("Statement contains 0 entries");
  }

  const transactions: ParsedTransaction[] = [];

  for (let i = 0; i < entries.length; i++) {
    const ntry = entries[i] as Record<string, unknown>;

    const amtRaw = ntry["Amt"];
    const amount = parseAmount(amtRaw);
    const creditDebit = (nodeText(ntry["CdtDbtInd"]) ?? "DBIT") as
      | "CRDT"
      | "DBIT";
    const isCredit = creditDebit === "CRDT";

    const bookingDate = parseDate(
      dig(ntry, "BookgDt.Dt") ?? dig(ntry, "BookgDt.DtTm"),
    );
    const valueDate =
      parseDate(dig(ntry, "ValDt.Dt") ?? dig(ntry, "ValDt.DtTm")) ||
      bookingDate;

    // TxDtls : array forcé par isArray
    const ntryDtls = ntry["NtryDtls"] as Record<string, unknown> | undefined;
    const txDtlsArr = (ntryDtls?.["TxDtls"] as unknown[]) ?? [];
    const txDtls = (txDtlsArr[0] ?? {}) as Record<string, unknown>;

    // Refs
    const refs = txDtls["Refs"] as Record<string, unknown> | undefined;
    const acctSvcrRef = nodeText(refs?.["AcctSvcrRef"]);
    const endToEndId = nodeText(refs?.["EndToEndId"]);
    const txId =
      acctSvcrRef ??
      endToEndId ??
      nodeText(ntry["NtryRef"]) ??
      `${messageId}-${i}`;

    // Contrepartie : Cdtr si DBIT, Dbtr si CRDT
    const rltdPties = txDtls["RltdPties"] as Record<string, unknown> | undefined;
    const counterpartyParty = isCredit
      ? (rltdPties?.["Dbtr"] as Record<string, unknown> | undefined)
      : (rltdPties?.["Cdtr"] as Record<string, unknown> | undefined);
    const counterpartyAcct = isCredit
      ? (rltdPties?.["DbtrAcct"] as Record<string, unknown> | undefined)
      : (rltdPties?.["CdtrAcct"] as Record<string, unknown> | undefined);

    const counterpartyName = nodeText(counterpartyParty?.["Nm"]);
    const cpAcctId = counterpartyAcct?.["Id"] as Record<string, unknown> | undefined;
    const counterpartyIban =
      nodeText(cpAcctId?.["IBAN"]) ??
      nodeText(dig(cpAcctId, "Othr.Id"));

    // RmtInf — référence de paiement
    const rmtInf = txDtls["RmtInf"] as Record<string, unknown> | undefined;
    const reference = nodeText(rmtInf?.["Ustrd"]);
    const structuredRef = nodeText(
      dig(rmtInf, "Strd.CdtrRefInf.Ref") ??
      dig(rmtInf, "Strd.0.CdtrRefInf.Ref"),
    );

    // Fallback description si aucune ref
    const finalReference =
      reference ??
      nodeText(first(
        dig(ntry, "AddtlNtryInf"),
        dig(ntry, "AddtlNtryInf"),
      ));

    if (!bookingDate) {
      warnings.push(`Entry ${i}: missing booking date, skipping`);
      continue;
    }

    transactions.push({
      messageId,
      statementId,
      accountIban,
      accountName,
      currency,
      txId,
      amount,
      creditDebit,
      bookingDate,
      valueDate,
      counterpartyName: counterpartyName || undefined,
      counterpartyIban: counterpartyIban || undefined,
      reference: finalReference || undefined,
      structuredRef: structuredRef || undefined,
    });
  }

  return {
    messageId,
    statementId,
    accountIban,
    accountName,
    currency,
    createdAt,
    transactions,
    warnings,
  };
}
