import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import { AccountNode } from './AccountNode';
import { TransactionEdge } from './TransactionEdge';
import { buildCanvas } from './layout';
import { CanvasSkeleton } from './CanvasSkeleton';

const nodeTypes: NodeTypes = { account: AccountNode };
const edgeTypes: EdgeTypes = { transaction: TransactionEdge };

export function LedgerCanvas() {
  const balance = useQuery({ queryKey: ['balance'], queryFn: lexa.ledgerBalance });
  const entries = useQuery({ queryKey: ['ledger', 200], queryFn: () => lexa.ledgerList(200) });

  const graph = useMemo(() => {
    if (!balance.data || !entries.data) return { nodes: [], edges: [] };
    return buildCanvas(balance.data.accounts, entries.data.entries);
  }, [balance.data, entries.data]);

  if (balance.isLoading || entries.isLoading) {
    return <CanvasSkeleton />;
  }

  return (
    <ReactFlow
      nodes={graph.nodes}
      edges={graph.edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.2, maxZoom: 1.2 }}
      minZoom={0.3}
      maxZoom={1.8}
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
  );
}
