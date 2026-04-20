import { useMemo, useState, useCallback, useEffect } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import type { LedgerAccount, LedgerEntry } from '@/api/types';
import { AccountNode } from './AccountNode';
import { ClassNode } from './ClassNode';
import { TransactionEdge } from './TransactionEdge';
import { buildCanvas, buildCollapsedCanvas, COLLAPSE_THRESHOLD } from './layout';
import { CanvasSkeleton } from './CanvasSkeleton';
import { LedgerDrawer, type LedgerSelection } from './LedgerDrawer';
import { usePeriodStore } from '@/stores/periodStore';

// nodeTypes stable en dehors du composant pour éviter les re-renders React Flow
const nodeTypes: NodeTypes = { account: AccountNode, classAgg: ClassNode };
const edgeTypes: EdgeTypes = { transaction: TransactionEdge };

/**
 * Recalcule les soldes de comptes depuis les écritures filtrées par période.
 * Utilisé quand la période n'est pas "toute l'année" pour cohérence avec
 * filteredEntries (l'API /ledger/balance retourne toujours l'année entière).
 */
function recomputeBalances(
  accounts: LedgerAccount[],
  entries: LedgerEntry[],
): LedgerAccount[] {
  const sums = new Map<string, { debit: number; credit: number }>();
  for (const e of entries) {
    const cur = sums.get(e.account) ?? { debit: 0, credit: 0 };
    if (e.lineType === 'debit') cur.debit += e.amount;
    else cur.credit += e.amount;
    sums.set(e.account, cur);
  }
  return accounts.map((a) => {
    const s = sums.get(a.account);
    if (!s) return { ...a, balance: 0, totalDebit: 0, totalCredit: 0 };
    // Convention comptable : comptes actif/charges (1xx, 4xx-9xx) = solde débiteur normal
    const code = a.account.match(/^\d+/)?.[0] ?? '';
    const first = code[0] ?? '0';
    const isDebitNormal =
      first === '1' || (first >= '4' && first <= '9');
    return {
      ...a,
      balance: isDebitNormal ? s.debit - s.credit : s.credit - s.debit,
      totalDebit: s.debit,
      totalCredit: s.credit,
    };
  });
}

/**
 * Mode d'affichage du grand livre :
 * - 'auto'           : collapse si >COLLAPSE_THRESHOLD comptes
 * - 'fully-expanded' : tous les comptes individuels affichés
 */
type CollapseMode = 'auto' | 'fully-expanded';

interface LedgerCanvasProps {
  /** Si fourni, ouvre le drawer sur le premier compte qui contient ce streamId */
  autoOpenStreamId?: string | null;
  /** Si fourni, ouvre directement l'éditeur de correction pour ce streamId */
  autoCorrectStreamId?: string | null;
}

export function LedgerCanvas({ autoOpenStreamId, autoCorrectStreamId }: LedgerCanvasProps = {}) {
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 200], queryFn: () => lexa.ledgerList(200) });
  const [selection, setSelection] = useState<LedgerSelection>(null);

  // Période de filtre depuis store partagé (ouvert via click sur FiscalTimeline)
  const period = usePeriodStore((s) => s.period);

  // Nav jump — ouvrir automatiquement le drawer sur le compte contenant le stream
  useEffect(() => {
    const targetId = autoOpenStreamId ?? autoCorrectStreamId;
    if (!targetId || !entries.data?.entries?.length) return;
    const entry = entries.data.entries.find((e) => e.streamId === targetId);
    if (entry && !selection) {
      setSelection({ kind: 'account', accountId: entry.account });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenStreamId, autoCorrectStreamId, entries.data]);

  // Mode collapse : 'auto' (défaut) ou 'fully-expanded' (forcé par l'user)
  const [collapseMode, setCollapseMode] = useState<CollapseMode>('auto');

  // Ensemble des classes Käfer actuellement développées (click sur ClassNode)
  const [expandedClasses, setExpandedClasses] = useState<Set<string>>(new Set());

  const filteredEntries = useMemo(() => {
    const all = entries.data?.entries ?? [];
    return all.filter((e) => {
      if (!e.occurredAt) return true;
      const d = e.occurredAt.slice(0, 10);
      return d >= period.start && d <= period.end;
    });
  }, [entries.data, period]);

  // Recalcule les soldes depuis filteredEntries pour que balance et écritures
  // soient cohérentes. Bypass si période = "all" (données API déjà correctes).
  const accountsForPeriod = useMemo(() => {
    if (!balance.data?.accounts) return [];
    if (period.key === 'all') return balance.data.accounts;
    return recomputeBalances(balance.data.accounts, filteredEntries);
  }, [balance.data, filteredEntries, period.key]);

  // Détermine si on doit activer le collapse (mode auto + seuil dépassé)
  const shouldCollapse = useMemo(
    () => collapseMode === 'auto' && accountsForPeriod.length > COLLAPSE_THRESHOLD,
    [collapseMode, accountsForPeriod.length],
  );

  // Graph React Flow (nodes + edges)
  const graph = useMemo(() => {
    if (accountsForPeriod.length === 0) return { nodes: [], edges: [] };
    if (!shouldCollapse) {
      return buildCanvas(accountsForPeriod, filteredEntries);
    }
    return buildCollapsedCanvas(accountsForPeriod, filteredEntries, expandedClasses);
  }, [accountsForPeriod, filteredEntries, shouldCollapse, expandedClasses]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.type === 'classAgg') {
        // Toggle expand/collapse de la classe cliquée
        const cls = (node.data as { kafClass: string }).kafClass;
        setExpandedClasses((prev) => {
          const next = new Set(prev);
          if (next.has(cls)) {
            next.delete(cls);
          } else {
            next.add(cls);
          }
          return next;
        });
        return;
      }
      setSelection({ kind: 'account', accountId: node.id });
    },
    [],
  );

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    // Ignorer les edges de classes agrégées
    if (edge.id.startsWith('class-edge-')) return;
    setSelection({ kind: 'edge', source: edge.source, target: edge.target });
  }, []);

  const closeDrawer = useCallback(() => setSelection(null), []);

  // Fermer une classe avec Echap (écouté sur le canvas)
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape' && expandedClasses.size > 0) {
        setExpandedClasses(new Set());
      }
    },
    [expandedClasses],
  );

  if (balance.isLoading || entries.isLoading) {
    return <CanvasSkeleton />;
  }

  const isCollapsed = shouldCollapse;
  const accountCount = accountsForPeriod.length;

  return (
    <div className="relative w-full h-full" onKeyDown={onKeyDown} tabIndex={-1}>
      {/* Bouton toggle collapse (visible seulement si >THRESHOLD comptes) */}
      {accountCount > COLLAPSE_THRESHOLD && (
        <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
          {isCollapsed && expandedClasses.size > 0 && (
            <button
              onClick={() => setExpandedClasses(new Set())}
              className="card-elevated px-3 py-1.5 text-2xs text-subtle hover:text-ink transition-colors"
            >
              Tout grouper
            </button>
          )}
          <button
            onClick={() =>
              setCollapseMode((prev) => (prev === 'auto' ? 'fully-expanded' : 'auto'))
            }
            className="card-elevated px-3 py-1.5 text-2xs font-medium text-ink hover:border-accent/60 transition-colors flex items-center gap-1.5"
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${isCollapsed ? 'bg-warning' : 'bg-success'}`}
            />
            {collapseMode === 'auto' ? 'Tout développer' : 'Vue par classes'}
            <span className="text-subtle">({accountCount} cptes)</span>
          </button>
        </div>
      )}

      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodeClick={onNodeClick}
        onEdgeClick={onEdgeClick}
        onPaneClick={closeDrawer}
        fitView
        fitViewOptions={{ padding: 0.12, maxZoom: 1.6 }}
        minZoom={0.3}
        maxZoom={2.2}
        proOptions={{ hideAttribution: true }}
        className="bg-bg"
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="rgb(var(--border))"
        />
        <Controls className="!bg-surface !border !border-border !rounded-lg [&>button]:!bg-surface [&>button]:!text-ink [&>button]:!border-border [&>button:hover]:!bg-elevated" />
      </ReactFlow>
      <LedgerDrawer
        selection={selection}
        accounts={accountsForPeriod}
        entries={filteredEntries}
        onClose={closeDrawer}
        autoCorrectStreamId={autoCorrectStreamId}
      />
    </div>
  );
}
