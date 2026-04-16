import { query } from "../db/postgres.js";

// ─── Types ────────────────────────────────────────────────────────────────────

export type AccountLine = {
  account: string;
  accountName: string | null;
  balance: number;
};

export type BalanceSheet = {
  year: number;
  asOf: string; // "YYYY-12-31"
  assets: AccountLine[];
  assetsTotal: number;
  liabilities: AccountLine[];
  liabilitiesTotal: number;
  equity: AccountLine[];
  equityTotal: number;
  isBalanced: boolean;
};

export type IncomeStatement = {
  year: number;
  period: { start: string; end: string };
  revenues: AccountLine[];
  revenuesTotal: number;
  charges: AccountLine[];
  chargesTotal: number;
  financialResult: number; // net classe 7
  extraordinaryResult: number; // net classes 8+9
  netResult: number;
};

type Gap = {
  type: "missing_depreciation" | "missing_accrual" | "orphan_entry" | "unbalanced";
  severity: "info" | "warning" | "error";
  message: string;
};

export type LedgerHealth = {
  year: number;
  entriesCount: number;
  lastEntryDate: string | null;
  isBalanced: boolean;
  gaps: Gap[];
  co_959c_ready: boolean;
};

// ─── Balance row from DB ──────────────────────────────────────────────────────

type BalanceRow = {
  account: string;
  total_debit: string;
  total_credit: string;
  balance: string;
};

type CountRow = {
  count: string;
};

type LastDateRow = {
  last_date: string | null;
};

// ─── Käfer account name lookup (V1: basic map, expandable) ────────────────────
// Full Käfer chart: ~500 accounts. V1 covers major classes with common names.
// TODO S30+: ingest full Käfer YAML and join via Qdrant or static map.
const KAFER_NAMES: Record<string, string> = {
  // Classe 1 — Actifs
  "1000": "Caisse",
  "1020": "Banque compte courant",
  "1060": "Titres cotés",
  "1100": "Créances clients",
  "1109": "Ducroire (provision)",
  "1170": "TVA déductible",
  "1176": "Acomptes d'impôts",
  "1200": "Stocks de marchandises",
  "1210": "Stocks de produits semi-finis",
  "1300": "Charges payées d'avance",
  "1301": "Produits à recevoir",
  "1400": "Machines et appareils",
  "1440": "Mobilier",
  "1441": "Installations informatiques",
  "1500": "Immeubles",
  "1510": "Terrain",
  "1520": "Bâtiments",
  "1530": "Installations techniques",
  "1700": "Brevets et licences",
  "1710": "Goodwill",
  "1800": "Parts dans des sociétés",
  "1850": "Prêts à long terme",
  // Classe 2 — Passifs
  "2000": "Dettes fournisseurs",
  "2010": "Billets à ordre à payer",
  "2100": "Banque (crédit court terme)",
  "2110": "Banque (crédit courant)",
  "2200": "TVA due à l'AFC",
  "2261": "Impôts dus (directs)",
  "2270": "Prélèvements sociaux à payer",
  "2300": "Produits reçus d'avance",
  "2301": "Charges à payer",
  "2400": "Prêts hypothécaires",
  "2420": "Dettes à long terme envers banques",
  "2500": "Dettes à long terme envers actionnaires",
  "2800": "Capital-actions / Capital social",
  "2850": "Réserve légale de capital",
  "2900": "Bénéfice reporté",
  "2960": "Bénéfice/perte de l'exercice",
  // Classe 3 — Produits d'exploitation
  "3000": "Ventes de marchandises",
  "3200": "Produits des travaux",
  "3400": "Produits des prestations de services",
  "3600": "Autres produits d'exploitation",
  "3700": "Variations de stocks",
  "3800": "Travaux effectués par l'entreprise pour elle-même",
  // Classe 4 — Charges de matière
  "4000": "Achats de marchandises",
  "4200": "Achats de matières premières",
  "4400": "Variation de stocks matières",
  // Classe 5 — Charges de personnel
  "5000": "Salaires et appointements",
  "5100": "Charges sociales (AVS/AI/APG)",
  "5200": "Prévoyance professionnelle (LPP)",
  "5700": "Autres charges de personnel",
  // Classe 6 — Autres charges d'exploitation
  "6000": "Loyers et charges locatives",
  "6100": "Entretien et réparations",
  "6200": "Énergie",
  "6300": "Frais de véhicules",
  "6400": "Assurances",
  "6500": "Publicité et marketing",
  "6600": "Frais administratifs",
  "6700": "Amortissements",
  "6800": "Charges financières",
  "6900": "Corrections de valeur",
  // Classe 7 — Résultat financier
  "7000": "Produits financiers",
  "7010": "Intérêts créanciers",
  "7020": "Dividendes",
  "7100": "Charges financières",
  "7200": "Gains de change",
  "7210": "Pertes de change",
  // Classe 8 — Résultat hors exploitation
  "8000": "Produits hors exploitation",
  "8100": "Charges hors exploitation",
  "8500": "Produits exceptionnels",
  "8900": "Charges exceptionnelles",
  // Classe 9 — Impôts
  "9200": "Impôts sur le bénéfice et le capital",
};

function getAccountName(account: string): string | null {
  // Try exact match first
  if (KAFER_NAMES[account]) return KAFER_NAMES[account];
  // Try 4-digit prefix
  const prefix4 = account.substring(0, 4);
  if (KAFER_NAMES[prefix4]) return KAFER_NAMES[prefix4];
  return null;
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

/**
 * Project balance sheet for a given year.
 * Uses ledger_entries materialized view (session 08).
 * Balance = cumulative from inception to year-12-31 (balance sheet = stock, not flow).
 */
export async function projectBalanceSheet(tenantId: string, year: number): Promise<BalanceSheet> {
  const asOf = `${year}-12-31`;

  // Query account balances up to year-12-31 (cumulative = balance sheet logic)
  const result = await query<BalanceRow>(
    `SELECT
       account,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)  AS total_debit,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)
         - COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS balance
     FROM ledger_entries
     WHERE tenant_id = $1
       AND (transaction_date IS NULL OR transaction_date <= $2)
       AND LEFT(account, 1) IN ('1', '2')
     GROUP BY account
     ORDER BY account`,
    [tenantId, asOf],
  );

  const rows = result.rows;

  // Split by class
  const assets: AccountLine[] = [];
  const liabilities: AccountLine[] = [];
  const equity: AccountLine[] = [];

  for (const r of rows) {
    const balance = Number(r.balance);
    const line: AccountLine = {
      account: r.account,
      accountName: getAccountName(r.account),
      balance: Math.abs(balance), // display as positive
    };

    const firstChar = r.account.charAt(0);
    const firstTwo = r.account.substring(0, 2);
    const firstTwoNum = parseInt(firstTwo, 10);

    if (firstChar === "1") {
      // Classe 1 = Actifs (debit balance = positive asset)
      if (balance !== 0) assets.push(line);
    } else if (firstChar === "2") {
      // Classe 2: 20-27 = Passifs/Dettes, 28-29 = Fonds propres
      if (!isNaN(firstTwoNum) && firstTwoNum >= 28) {
        if (balance !== 0) equity.push(line);
      } else {
        if (balance !== 0) liabilities.push(line);
      }
    }
  }

  const assetsTotal = Number(assets.reduce((s, a) => s + a.balance, 0).toFixed(2));
  const liabilitiesTotal = Number(liabilities.reduce((s, a) => s + a.balance, 0).toFixed(2));
  const equityTotal = Number(equity.reduce((s, a) => s + a.balance, 0).toFixed(2));

  const isBalanced = Math.abs(assetsTotal - (liabilitiesTotal + equityTotal)) < 0.05;

  return {
    year,
    asOf,
    assets,
    assetsTotal,
    liabilities,
    liabilitiesTotal,
    equity,
    equityTotal,
    isBalanced,
  };
}

// ─── Income Statement ─────────────────────────────────────────────────────────

/**
 * Project income statement for a given year.
 * Period: year-01-01 to year-12-31.
 * Uses ledger_entries materialized view (session 08).
 */
export async function projectIncomeStatement(
  tenantId: string,
  year: number,
): Promise<IncomeStatement> {
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;

  const result = await query<BalanceRow>(
    `SELECT
       account,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0)  AS total_debit,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0) AS total_credit,
       COALESCE(SUM(amount) FILTER (WHERE line_type = 'credit'), 0)
         - COALESCE(SUM(amount) FILTER (WHERE line_type = 'debit'), 0) AS balance
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date >= $2
       AND transaction_date <= $3
       AND LEFT(account, 1) IN ('3', '4', '5', '6', '7', '8', '9')
     GROUP BY account
     ORDER BY account`,
    [tenantId, start, end],
  );

  const rows = result.rows;

  const revenues: AccountLine[] = [];
  const charges: AccountLine[] = [];
  let financialResult = 0;
  let extraordinaryResult = 0;

  for (const r of rows) {
    const debit = Number(r.total_debit);
    const credit = Number(r.total_credit);
    const net = credit - debit; // positive = net credit = revenue
    const firstChar = r.account.charAt(0);

    if (firstChar === "3") {
      // Classe 3 = Produits d'exploitation (net credit = revenue)
      if (net !== 0) {
        revenues.push({
          account: r.account,
          accountName: getAccountName(r.account),
          balance: Number(net.toFixed(2)),
        });
      }
    } else if (firstChar === "4" || firstChar === "5" || firstChar === "6") {
      // Classes 4/5/6 = Charges (net debit = charge, displayed positive)
      const chargeAmt = debit - credit;
      if (chargeAmt !== 0) {
        charges.push({
          account: r.account,
          accountName: getAccountName(r.account),
          balance: Number(Math.abs(chargeAmt).toFixed(2)),
        });
      }
    } else if (firstChar === "7") {
      // Classe 7 = Résultat financier
      financialResult += net;
    } else if (firstChar === "8" || firstChar === "9") {
      // Classes 8+9 = Résultat extraordinaire + impôts
      extraordinaryResult += net;
    }
  }

  const revenuesTotal = Number(revenues.reduce((s, a) => s + a.balance, 0).toFixed(2));
  const chargesTotal = Number(charges.reduce((s, a) => s + a.balance, 0).toFixed(2));

  financialResult = Number(financialResult.toFixed(2));
  extraordinaryResult = Number(extraordinaryResult.toFixed(2));

  const netResult = Number(
    (revenuesTotal - chargesTotal + financialResult + extraordinaryResult).toFixed(2),
  );

  return {
    year,
    period: { start, end },
    revenues,
    revenuesTotal,
    charges,
    chargesTotal,
    financialResult,
    extraordinaryResult,
    netResult,
  };
}

// ─── Ledger Health ────────────────────────────────────────────────────────────

/**
 * Compute ledger health indicators for a given year (CO 958c compliance V1).
 */
export async function computeLedgerHealth(tenantId: string, year: number): Promise<LedgerHealth> {
  const bs = await projectBalanceSheet(tenantId, year);

  // Count total entries for tenant/year
  const countResult = await query<CountRow>(
    `SELECT COUNT(DISTINCT event_id)::text AS count
     FROM ledger_entries
     WHERE tenant_id = $1
       AND (transaction_date IS NULL OR (transaction_date >= $2 AND transaction_date <= $3))`,
    [tenantId, `${year}-01-01`, `${year}-12-31`],
  );
  const entriesCount = Number(countResult.rows[0]?.count ?? 0);

  // Last entry date
  const lastDateResult = await query<LastDateRow>(
    `SELECT MAX(transaction_date)::text AS last_date
     FROM ledger_entries
     WHERE tenant_id = $1
       AND transaction_date <= $2`,
    [tenantId, `${year}-12-31`],
  );
  const lastEntryDate = lastDateResult.rows[0]?.last_date ?? null;

  const gaps: Gap[] = [];

  // Check balance
  if (!bs.isBalanced) {
    const diff = Math.abs(bs.assetsTotal - (bs.liabilitiesTotal + bs.equityTotal));
    gaps.push({
      type: "unbalanced",
      severity: "error",
      message: `Bilan déséquilibré de ${diff.toFixed(2)} CHF (CO art. 958c al. 1 — image fidèle requise)`,
    });
  }

  // Check if no entries at all
  if (entriesCount === 0) {
    gaps.push({
      type: "orphan_entry",
      severity: "info",
      message: `Aucune écriture enregistrée pour l'exercice ${year}. Importez vos relevés bancaires pour démarrer la projection.`,
    });
  }

  // V1: basic check — if entries exist but no classe 6 (charges amortissement = 6700),
  // flag as potential missing depreciation
  if (entriesCount > 0 && bs.assetsTotal > 0) {
    const deprResult = await query<CountRow>(
      `SELECT COUNT(DISTINCT event_id)::text AS count
       FROM ledger_entries
       WHERE tenant_id = $1
         AND transaction_date >= $2
         AND transaction_date <= $3
         AND account LIKE '67%'`,
      [tenantId, `${year}-01-01`, `${year}-12-31`],
    );
    const deprCount = Number(deprResult.rows[0]?.count ?? 0);
    if (deprCount === 0) {
      gaps.push({
        type: "missing_depreciation",
        severity: "warning",
        message: `Aucun amortissement (compte 67xx) enregistré pour ${year}. Vérifiez vos immobilisations (CO art. 960a al. 3 — amortissements systématiques requis).`,
      });
    }
  }

  const co_959c_ready = bs.isBalanced && entriesCount > 0 && gaps.filter((g) => g.severity === "error").length === 0;

  return {
    year,
    entriesCount,
    lastEntryDate,
    isBalanced: bs.isBalanced,
    gaps,
    co_959c_ready,
  };
}
