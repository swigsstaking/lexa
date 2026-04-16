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
 * Layout strategy (simple 4-column grid by category):
 *   Col 0 → actifs (gauche)
 *   Col 1 → passifs
 *   Col 2 → produits
 *   Col 3 → charges (droite)
 * Each column stacks vertically, 160px row height, 280px col width.
 */
export function buildCanvas(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
): { nodes: LedgerNode[]; edges: LedgerEdge[] } {
  const COL_W = 300;
  const ROW_H = 160;
  const categoryCols: Record<AccountNodeData['category'], number> = {
    actif: 0,
    passif: 1,
    produit: 2,
    charge: 3,
    neutre: 4,
  };
  const columnCounters: Record<number, number> = {};

  // Find which accounts have a recent transaction (last 5 entries)
  const recentAccounts = new Set<string>();
  entries.slice(0, 5).forEach((e) => {
    recentAccounts.add(e.account);
    if (e.counterpartAccount) recentAccounts.add(e.counterpartAccount);
  });

  const nodes: LedgerNode[] = accounts.map((a) => {
    const category = classifyAccount(extractCode(a.account));
    const col = categoryCols[category];
    const row = columnCounters[col] ?? 0;
    columnCounters[col] = row + 1;
    return {
      id: a.account,
      type: 'account',
      position: { x: col * COL_W, y: row * ROW_H },
      data: {
        code: extractCode(a.account),
        label: extractLabel(a.account),
        balance: a.balance,
        debit: a.totalDebit,
        credit: a.totalCredit,
        category,
        recent: recentAccounts.has(a.account),
      },
    };
  });

  // Aggregate edges par paire (source, target) : 1 edge par paire de comptes,
  // avec montant total + nombre de transactions. Évite la forêt de labels superposés
  // quand on a plusieurs transactions entre les mêmes comptes.
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

  const edges: LedgerEdge[] = Array.from(aggregated.entries()).map(([key, agg]) => ({
    id: `edge-${key}`,
    source: agg.source,
    target: agg.target,
    type: 'transaction',
    animated: true,
    data: {
      amount: agg.totalAmount,
      currency: agg.currency,
      count: agg.count,
      lastOccurredAt: agg.lastOccurredAt,
    },
  }));

  return { nodes, edges };
}
