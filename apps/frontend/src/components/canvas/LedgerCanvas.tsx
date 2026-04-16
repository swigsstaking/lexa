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
import { AccountNode } from './AccountNode';
import { TransactionEdge } from './TransactionEdge';
import { buildCanvas } from './layout';
import { CanvasSkeleton } from './CanvasSkeleton';
import { LedgerDrawer, type LedgerSelection } from './LedgerDrawer';

const nodeTypes: NodeTypes = { account: AccountNode };
const edgeTypes: EdgeTypes = { transaction: TransactionEdge };

export function LedgerCanvas() {
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 200], queryFn: () => lexa.ledgerList(200) });
  const [selection, setSelection] = useState<LedgerSelection>(null);

  const graph = useMemo(() => {
    if (!balance.data || !entries.data) return { nodes: [], edges: [] };
    return buildCanvas(balance.data.accounts, entries.data.entries);
  }, [balance.data, entries.data]);

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
        accounts={balance.data?.accounts ?? []}
        entries={entries.data?.entries ?? []}
        onClose={closeDrawer}
      />
    </div>
  );
}
