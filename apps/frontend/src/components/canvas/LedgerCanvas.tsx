import { useMemo } from 'react';
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import { AccountNode, type AccountNodeData } from './AccountNode';
import { TransactionEdge } from './TransactionEdge';
import { buildCanvas } from './layout';

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
    return (
      <div className="h-full grid place-items-center text-muted text-sm">
        Chargement du canvas...
      </div>
    );
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
      <MiniMap
        pannable
        zoomable
        maskColor="rgba(10, 11, 14, 0.6)"
        className="!bg-surface !border !border-border !rounded-lg"
        nodeColor={(n) => {
          const d = n.data as AccountNodeData | undefined;
          if (!d) return 'rgb(var(--border-strong))';
          if (d.category === 'actif') return 'rgb(var(--success))';
          if (d.category === 'passif') return 'rgb(var(--warning))';
          if (d.category === 'charge') return 'rgb(var(--danger))';
          if (d.category === 'produit') return 'rgb(var(--accent))';
          return 'rgb(var(--border-strong))';
        }}
      />
    </ReactFlow>
  );
}
