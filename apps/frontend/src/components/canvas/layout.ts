import type { LedgerAccount, LedgerEntry } from '@/api/types';
import type { AccountNodeData } from './AccountNode';
import type { ClassNodeData } from './ClassNode';
import type { TransactionEdgeData } from './TransactionEdge';

export type LedgerNode = {
  id: string;
  type: 'account';
  position: { x: number; y: number };
  data: AccountNodeData;
};

export type ClassLedgerNode = {
  id: string;
  type: 'classAgg';
  position: { x: number; y: number };
  data: ClassNodeData;
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

// ─── Constantes grille uniforme ───────────────────────────────────────────────
// Chaque compte occupe une cellule (CARD_W × ROW_H). Les cartes ont une largeur
// réelle de 220px (min-w-[220px] dans AccountNode), hauteur ~100px.
// Les catégories sémantiques (produit / actif / charge) sont chacune subdivisées
// en sous-colonnes internes quand beaucoup de comptes les peuplent.
export const CARD_W = 220; // largeur carte (AccountNode min-w)
export const GAP_X = 32; // gap horizontal entre sous-colonnes d'une même catégorie
export const GAP_GROUP = 80; // gap entre catégories (produit → actif → charge)
export const ROW_H = 130; // hauteur de ligne (carte ~100px + gap 30px)

/**
 * Nombre optimal de sous-colonnes pour N comptes.
 * Principe : 5-6 rangées max par sous-colonne pour rester lisible à zoom ~0.6.
 *   ≤ 5   comptes → 1 col
 *   6-10  comptes → 2 cols
 *   11-18 comptes → 3 cols
 *   19+   comptes → 4 cols (cap)
 */
function optimalSubCols(count: number): number {
  if (count <= 5) return 1;
  if (count <= 10) return 2;
  if (count <= 18) return 3;
  return 4;
}

export function buildCanvas(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
): { nodes: LedgerNode[]; edges: LedgerEdge[] } {
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

  // Sous-colonnes adaptives par catégorie
  const subColCountByCol = [0, 1, 2].map((col) =>
    optimalSubCols(accountsByCol[col].length),
  );

  // Largeur totale d'un groupe : n sous-cols de CARD_W + (n-1) GAP_X
  const groupWidth = (subCols: number) =>
    subCols * CARD_W + Math.max(0, subCols - 1) * GAP_X;

  // Position X du début de chaque catégorie (flux gauche → droite)
  const colXStart: number[] = [0, 0, 0];
  colXStart[0] = 0;
  colXStart[1] =
    colXStart[0] +
    (accountsByCol[0].length > 0 ? groupWidth(subColCountByCol[0]) + GAP_GROUP : 0);
  colXStart[2] =
    colXStart[1] +
    (accountsByCol[1].length > 0 ? groupWidth(subColCountByCol[1]) + GAP_GROUP : 0);

  // Nombre de rangées réelles par catégorie (pour centrage vertical global)
  const rowsInCol = (col: number) => {
    const n = accountsByCol[col].length;
    if (n === 0) return 0;
    return Math.ceil(n / subColCountByCol[col]);
  };
  const maxRows = Math.max(rowsInCol(0), rowsInCol(1), rowsInCol(2), 1);

  const nodes: LedgerNode[] = [];

  for (const col of [0, 1, 2]) {
    const colAccounts = accountsByCol[col];
    if (colAccounts.length === 0) continue;

    const subColCount = subColCountByCol[col];
    const xBase = colXStart[col];
    const totalRows = Math.ceil(colAccounts.length / subColCount);

    // Centrage vertical : les groupes plus courts sont poussés vers le milieu
    const groupHeight = totalRows * ROW_H;
    const maxHeight = maxRows * ROW_H;
    const yCenterOffset = (maxHeight - groupHeight) / 2;

    // Distribution column-major : on remplit la 1re sous-colonne avant la suivante
    // (les plus actifs restent visibles en haut-gauche du groupe)
    colAccounts.forEach((a, i) => {
      const subColIdx = Math.floor(i / totalRows);
      const rowInSubCol = i % totalRows;

      const x = xBase + subColIdx * (CARD_W + GAP_X);
      const y = yCenterOffset + rowInSubCol * ROW_H;

      const category = classifyAccount(extractCode(a.account));
      nodes.push({
        id: a.account,
        type: 'account',
        position: { x, y },
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
  // On utilise la colonne logique (0/1/2) pour la direction, pas le x exact
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

// ─── Libellés classes Käfer ───────────────────────────────────────────────────

export const KAFER_CLASS_LABELS: Record<string, string> = {
  '1': 'Actifs',
  '2': 'Passifs',
  '3': 'Produits',
  '4': 'Achats / Charges matières',
  '5': 'Personnel',
  '6': 'Charges d\'exploitation',
  '7': 'Produits & charges hors exploit.',
  '8': 'Résultat extraordinaire',
  '9': 'Clôture',
};

/** Seuil au-dessus duquel le collapse automatique est activé */
export const COLLAPSE_THRESHOLD = 50;

/**
 * Construit un canvas "collapsed" par classe Käfer.
 * Les classes dont les comptes ont au moins 1 entrée dans `expandedClasses` sont
 * remplacées par leurs nœuds individuels. Les autres sont représentées par 1 ClassNode.
 */
export function buildCollapsedCanvas(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
  expandedClasses: Set<string>,
): { nodes: (LedgerNode | ClassLedgerNode)[]; edges: LedgerEdge[] } {
  // Grouper les comptes par classe (premier digit)
  const byClass = new Map<string, LedgerAccount[]>();
  for (const a of accounts) {
    const cls = extractCode(a.account)[0] ?? '9';
    const arr = byClass.get(cls) ?? [];
    arr.push(a);
    byClass.set(cls, arr);
  }

  // Séparer les classes collapsed vs expanded
  const collapsedClasses = new Set<string>();
  const expandedAccountsAll: LedgerAccount[] = [];

  for (const [cls, accs] of byClass) {
    if (expandedClasses.has(cls)) {
      expandedAccountsAll.push(...accs);
    } else {
      collapsedClasses.add(cls);
    }
  }

  // Construire le canvas normal pour les comptes expanded
  const expandedResult =
    expandedAccountsAll.length > 0
      ? buildCanvas(expandedAccountsAll, entries)
      : { nodes: [], edges: [] };

  // ── Nœuds classes (collapsed) ─────────────────────────────────────────────

  // Layout des classes en grille 3 colonnes (même logique que buildCanvas)
  const CLASS_COL: Record<string, number> = {
    '3': 0, // produits → gauche
    '1': 1, // actifs   → centre
    '2': 2, // passifs  → droite
    '4': 2,
    '5': 2,
    '6': 2,
    '7': 2,
    '8': 2,
    '9': 2,
  };
  // Pour les class nodes : carte plus large (ClassNode min-w-[240px]) + hauteur
  // plus grande (padding vertical supérieur). On conserve la structure 3 colonnes
  // sémantiques avec le même écart que buildCanvas pour une cohérence visuelle.
  const CLASS_CARD_W = 260;
  const CLASS_ROW_H = 180;
  const CLASS_COL_X = [
    0,
    CLASS_CARD_W + GAP_GROUP,
    2 * (CLASS_CARD_W + GAP_GROUP),
  ];

  const classNodesByCol: Record<number, Array<{ cls: string; accs: LedgerAccount[] }>> = {
    0: [],
    1: [],
    2: [],
  };
  for (const cls of [...collapsedClasses].sort()) {
    const col = CLASS_COL[cls] ?? 2;
    classNodesByCol[col].push({ cls, accs: byClass.get(cls) ?? [] });
  }

  // Offset Y pour ne pas chevaucher les nœuds expanded (qui commencent à y=0)
  const expandedHeight =
    expandedAccountsAll.length > 0
      ? Math.max(...expandedResult.nodes.map((n) => n.position.y)) + CLASS_ROW_H + 60
      : 0;

  const classNodes: ClassLedgerNode[] = [];
  for (const col of [0, 1, 2]) {
    classNodesByCol[col].forEach(({ cls, accs }, i) => {
      const aggregatedBalance = accs.reduce((sum, a) => sum + a.balance, 0);
      classNodes.push({
        id: `class-${cls}`,
        type: 'classAgg',
        position: { x: CLASS_COL_X[col], y: expandedHeight + i * CLASS_ROW_H },
        data: {
          kafClass: cls,
          label: KAFER_CLASS_LABELS[cls] ?? `Classe ${cls}`,
          aggregatedBalance,
          accountCount: accs.length,
          expanded: false,
        },
      });
    });
  }

  // ── Edges entre classes (collapsed) ──────────────────────────────────────

  // Set des comptes expanded pour filtrer les edges
  const expandedAccountSet = new Set(expandedAccountsAll.map((a) => a.account));

  // Edges entre paires de classes collapsed
  type ClassEdgeAgg = { count: number; total: number; currency: string };
  const classEdgeMap = new Map<string, ClassEdgeAgg>();

  for (const e of entries) {
    if (e.lineType !== 'debit') continue;
    if (!e.counterpartAccount) continue;

    const srcCls = extractCode(e.counterpartAccount)[0] ?? '9';
    const tgtCls = extractCode(e.account)[0] ?? '9';

    const srcCollapsed = !expandedAccountSet.has(e.counterpartAccount);
    const tgtCollapsed = !expandedAccountSet.has(e.account);

    // Edge classe→classe uniquement si les 2 côtés sont collapsed
    if (srcCollapsed && tgtCollapsed && srcCls !== tgtCls) {
      const key = `class-${srcCls}->class-${tgtCls}`;
      const existing = classEdgeMap.get(key) ?? { count: 0, total: 0, currency: e.currency };
      existing.count++;
      existing.total += e.amount;
      classEdgeMap.set(key, existing);
    }
  }

  const fmtTotal = (n: number) =>
    new Intl.NumberFormat('fr-CH', { maximumFractionDigits: 0 }).format(n);

  const classEdges: LedgerEdge[] = Array.from(classEdgeMap.entries()).map(([key, agg], i) => {
    const [src, tgt] = key.split('->');
    return {
      id: `class-edge-${i}`,
      source: src,
      target: tgt,
      sourceHandle: 'r',
      targetHandle: 'l',
      type: 'transaction',
      animated: true,
      data: {
        amount: agg.total,
        currency: agg.currency,
        count: agg.count,
        direction: 'neutral' as const,
        label: `${agg.count} tx · ${fmtTotal(agg.total)} CHF`,
      },
    };
  });

  // Edges entre comptes expanded et classes collapsed (cross-boundary)
  // On les omet pour ne pas complexifier le rendu (ces edges feraient référence
  // à des IDs qui n'existent pas dans React Flow si une classe est collapsed).

  const allNodes: (LedgerNode | ClassLedgerNode)[] = [
    ...expandedResult.nodes,
    ...classNodes,
  ];
  const allEdges: LedgerEdge[] = [
    ...expandedResult.edges,
    ...classEdges,
  ];

  return { nodes: allNodes, edges: allEdges };
}
