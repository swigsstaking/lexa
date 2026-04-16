import type { LedgerAccount, LedgerEntry } from '@/api/types';
import type { AccountNodeData } from './AccountNode';
import type { TransactionEdgeData } from './TransactionEdge';

export type LedgerNode = {
  id: string;
  type: 'account';
  position: { x: number; y: number };
  data: AccountNodeData;
};

export type LedgerEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
  type: 'transaction';
  animated: true;
  data: TransactionEdgeData;
};

/**
 * Heuristic classifier using the leading digit of the Käfer account code.
 * 1xxx → actifs, 2xxx → passifs, 3xxx → produits, 4/5/6/7/8xxx → charges.
 */
function classifyAccount(code: string): AccountNodeData['category'] {
  const first = code.trim()[0];
  switch (first) {
    case '1':
      return 'actif';
    case '2':
      return 'passif';
    case '3':
      return 'produit';
    case '4':
    case '5':
    case '6':
    case '7':
    case '8':
      return 'charge';
    default:
      return 'neutre';
  }
}

function extractCode(accountLabel: string): string {
  const match = accountLabel.match(/^(\d+)/);
  return match?.[1] ?? accountLabel.split(' ')[0] ?? accountLabel;
}

function extractLabel(accountLabel: string): string {
  return accountLabel.replace(/^\d+\s*-\s*/, '').trim();
}

/**
 * Project LedgerAccount[] + LedgerEntry[] → react-flow nodes + edges.
 *
 * Layout "flux comptable gauche-droite" :
 *   Col 0 (gauche)  → Produits (3xxx) — sources de cash
 *   Col 1 (centre)  → Actifs (1xxx) — hub (banque au centre)
 *   Col 2 (droite)  → Charges (5/6/7/8xxx) + Passifs (2xxx) — destinations
 *
 * Toutes les edges vont gauche → droite (pas de croisement horizontal).
 * Dans chaque colonne, comptes classés par activité (plus actif au milieu).
 */
const FLOW_COL: Record<AccountNodeData['category'], number> = {
  produit: 0,
  actif: 1,
  passif: 2,
  charge: 2,
  neutre: 1,
};

export function buildCanvas(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
): { nodes: LedgerNode[]; edges: LedgerEdge[] } {
  const COL_W = 420;
  const ROW_H = 160;

  // Count activity per account (transactions touching each)
  const activityByAccount = new Map<string, number>();
  for (const e of entries) {
    activityByAccount.set(e.account, (activityByAccount.get(e.account) ?? 0) + 1);
  }

  // Find which accounts have a recent transaction (last 5 entries)
  const recentAccounts = new Set<string>();
  entries.slice(0, 5).forEach((e) => {
    recentAccounts.add(e.account);
    if (e.counterpartAccount) recentAccounts.add(e.counterpartAccount);
  });

  // Group accounts by column, then sort by activity descending (most active → top)
  const accountsByCol: Record<number, LedgerAccount[]> = { 0: [], 1: [], 2: [] };
  for (const a of accounts) {
    const category = classifyAccount(extractCode(a.account));
    const col = FLOW_COL[category];
    accountsByCol[col].push(a);
  }
  for (const col of [0, 1, 2]) {
    accountsByCol[col].sort(
      (a, b) => (activityByAccount.get(b.account) ?? 0) - (activityByAccount.get(a.account) ?? 0),
    );
  }

  // Compute vertical centering : tallest column = full height, others centered
  const maxRows = Math.max(
    accountsByCol[0].length,
    accountsByCol[1].length,
    accountsByCol[2].length,
  );

  const nodes: LedgerNode[] = [];
  for (const col of [0, 1, 2]) {
    const colAccounts = accountsByCol[col];
    const colHeight = colAccounts.length * ROW_H;
    const centerOffset = ((maxRows * ROW_H) - colHeight) / 2;
    colAccounts.forEach((a, i) => {
      const category = classifyAccount(extractCode(a.account));
      nodes.push({
        id: a.account,
        type: 'account',
        position: { x: col * COL_W, y: centerOffset + i * ROW_H },
        data: {
          code: extractCode(a.account),
          label: extractLabel(a.account),
          balance: a.balance,
          debit: a.totalDebit,
          credit: a.totalCredit,
          category,
          recent: recentAccounts.has(a.account),
        },
      });
    });
  }

  // Map de colonne par compte pour déterminer handles + direction flux
  const colByAccount = new Map<string, number>();
  for (const col of [0, 1, 2]) {
    for (const a of accountsByCol[col]) {
      colByAccount.set(a.account, col);
    }
  }

  // Aggregate edges par paire (source, target) : 1 edge par paire de comptes,
  // avec montant total + nombre de transactions.
  type AggregatedEdge = {
    source: string;
    target: string;
    totalAmount: number;
    currency: string;
    count: number;
    lastOccurredAt?: string;
  };
  const aggregated = new Map<string, AggregatedEdge>();

  for (const e of entries) {
    if (e.lineType !== 'debit') continue;
    if (!e.counterpartAccount) continue;
    const key = `${e.counterpartAccount}->${e.account}`;
    const existing = aggregated.get(key);
    if (existing) {
      existing.totalAmount += e.amount;
      existing.count += 1;
      if (e.occurredAt && (!existing.lastOccurredAt || e.occurredAt > existing.lastOccurredAt)) {
        existing.lastOccurredAt = e.occurredAt;
      }
    } else {
      aggregated.set(key, {
        source: e.counterpartAccount,
        target: e.account,
        totalAmount: e.amount,
        currency: e.currency,
        count: 1,
        lastOccurredAt: e.occurredAt,
      });
    }
  }

  const edges: LedgerEdge[] = Array.from(aggregated.entries()).map(([key, agg]) => {
    const sourceCol = colByAccount.get(agg.source) ?? 1;
    const targetCol = colByAccount.get(agg.target) ?? 1;
    // Handle choisi selon position relative des colonnes (évite les croisements)
    // Source à gauche de target → source.right → target.left
    // Source à droite de target → source.left-src → target.right-tgt (revient)
    const leftToRight = sourceCol <= targetCol;
    const sourceHandle = leftToRight ? 'r' : 'l-src';
    const targetHandle = leftToRight ? 'l' : 'r-tgt';

    // Direction flux comptable (du point de vue des actifs/banque en col 1) :
    // - target est actif (col 1) → entrée de cash (vert)
    // - source est actif (col 1) → sortie de cash (orange)
    // - autre → neutre (gris)
    const targetCategory = classifyAccount(extractCode(agg.target));
    const sourceCategory = classifyAccount(extractCode(agg.source));
    let direction: 'in' | 'out' | 'neutral' = 'neutral';
    if (targetCategory === 'actif') direction = 'in';
    else if (sourceCategory === 'actif') direction = 'out';

    return {
      id: `edge-${key}`,
      source: agg.source,
      target: agg.target,
      sourceHandle,
      targetHandle,
      type: 'transaction',
      animated: true,
      data: {
        amount: agg.totalAmount,
        currency: agg.currency,
        count: agg.count,
        lastOccurredAt: agg.lastOccurredAt,
        direction,
      },
    };
  });

  return { nodes, edges };
}
