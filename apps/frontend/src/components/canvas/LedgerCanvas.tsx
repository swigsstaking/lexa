import { useMemo, useState, useCallback } from 'react';
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
import { TransactionEdge } from './TransactionEdge';
import { buildCanvas } from './layout';
import { CanvasSkeleton } from './CanvasSkeleton';
import { LedgerDrawer, type LedgerSelection } from './LedgerDrawer';
import { PeriodModal } from './PeriodModal';
import { usePeriodStore } from '@/stores/periodStore';

const nodeTypes: NodeTypes = { account: AccountNode };
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

export function LedgerCanvas() {
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 200], queryFn: () => lexa.ledgerList(200) });
  const [selection, setSelection] = useState<LedgerSelection>(null);

  // Période de filtre depuis store partagé (ouvert via click sur FiscalTimeline)
  const period = usePeriodStore((s) => s.period);
  const modalOpen = usePeriodStore((s) => s.modalOpen);
  const closeModal = usePeriodStore((s) => s.closeModal);
  const setPeriod = usePeriodStore((s) => s.setPeriod);
  const currentYear = new Date().getFullYear();

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

  const graph = useMemo(() => {
    if (accountsForPeriod.length === 0) return { nodes: [], edges: [] };
    return buildCanvas(accountsForPeriod, filteredEntries);
  }, [accountsForPeriod, filteredEntries]);

  const onNodeClick = useCallback((_event: React.MouseEvent, node: Node) => {
    setSelection({ kind: 'account', accountId: node.id });
  }, []);

  const onEdgeClick = useCallback((_event: React.MouseEvent, edge: Edge) => {
    setSelection({ kind: 'edge', source: edge.source, target: edge.target });
  }, []);

  const closeDrawer = useCallback(() => setSelection(null), []);

  if (balance.isLoading || entries.isLoading) {
    return <CanvasSkeleton />;
  }

  return (
    <div className="relative w-full h-full">
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
      />
      <PeriodModal
        open={modalOpen}
        onClose={closeModal}
        year={currentYear}
        current={period}
        onSelect={setPeriod}
      />
    </div>
  );
}
