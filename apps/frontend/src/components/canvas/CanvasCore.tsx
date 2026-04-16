import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  type Node,
  type NodeTypes,
  type EdgeTypes,
  ReactFlowProvider,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { AnimatePresence } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

import { AgentNode } from './AgentNode';
import { EntityNode } from './EntityNode';
import { TransactionNode } from './TransactionNode';
import { CanvasEdge } from './CanvasEdge';
import { TimelineBar } from './TimelineBar';
import { ChatSidebar, type CanvasChatAgentId } from './ChatSidebar';
import { useCanvasData } from './hooks/useCanvasData';
import { useCanvasLayout } from './hooks/useCanvasLayout';
import { useAgentStates } from './hooks/useAgentStates';

const CHAT_CAPABLE: CanvasChatAgentId[] = ['classifier', 'reasoning', 'tva', 'cloture', 'audit', 'conseiller'];

const nodeTypes: NodeTypes = {
  agent: AgentNode,
  entity: EntityNode,
  transaction: TransactionNode,
};

const edgeTypes: EdgeTypes = {
  canvas: CanvasEdge,
};

function CanvasInner() {
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const { nodes: rawNodes, edges, auditEvents, isLoading } = useCanvasData();
  const { applyPositions, savePositions, resetLayout } = useCanvasLayout(activeTenantId ?? null);
  const agentStates = useAgentStates();
  const year = new Date().getFullYear();

  const [openChatAgent, setOpenChatAgent] = useState<CanvasChatAgentId | null>(null);

// Injecter les callbacks onChatOpen + états dans les agent nodes
  const nodes = useMemo<Node[]>(() => {
    const withPositions = applyPositions(rawNodes);
    return withPositions.map((n) => {
      if (n.type === 'agent') {
        const agentId = (n.data as { agentId: string }).agentId;
        return {
          ...n,
          data: {
            ...n.data,
            state: agentStates[agentId] ?? 'idle',
            onChatOpen: (id: string) => {
              if (CHAT_CAPABLE.includes(id as CanvasChatAgentId)) {
                setOpenChatAgent(id as CanvasChatAgentId);
              }
            },
          },
        };
      }
      return n;
    });
  }, [rawNodes, applyPositions, agentStates]);

  // Sauvegarder positions après drag
  const handleNodeDragStop = useCallback(
    (_event: React.MouseEvent, _node: Node, allNodes: Node[]) => {
      savePositions(allNodes);
    },
    [savePositions],
  );

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-stone-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-stone-700 border-t-stone-400 animate-spin" />
          <span className="text-xs text-stone-500 font-mono">Chargement du canvas…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      {/* React Flow canvas */}
      <div className="flex-1 min-h-0 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeDragStop={handleNodeDragStop}
          fitView
          fitViewOptions={{ padding: 0.15, maxZoom: 1.0 }}
          minZoom={0.1}
          maxZoom={4}
          proOptions={{ hideAttribution: true }}
          className="bg-stone-950"
          deleteKeyCode={null}
          defaultEdgeOptions={{ type: 'canvas' }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={28}
            size={1.2}
            color="rgb(41 37 36)"
          />

          <Controls
            className="!bg-stone-900 !border !border-stone-700 !rounded-lg [&>button]:!bg-stone-900 [&>button]:!text-stone-300 [&>button]:!border-stone-700 [&>button:hover]:!bg-stone-800"
            showInteractive={false}
          />

          <MiniMap
            className="!bg-stone-900 !border !border-stone-700 !rounded-lg"
            nodeColor={(n) => {
              if (n.type === 'agent') return 'rgb(87 83 78)';
              if (n.type === 'entity') return 'rgb(68 64 60)';
              return 'rgb(41 37 36)';
            }}
            maskColor="rgb(12 10 9 / 0.7)"
          />

          {/* Panel reset layout */}
          <Panel position="top-right">
            <button
              onClick={resetLayout}
              title="Réinitialiser le layout"
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-2xs text-stone-400 hover:text-stone-200 hover:border-stone-600 transition-colors font-mono"
            >
              <RotateCcw className="w-3 h-3" />
              Reset layout
            </button>
          </Panel>

          {/* Panel compteur nodes */}
          <Panel position="top-left">
            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-stone-900/80 border border-stone-800 rounded-lg">
              <span className="text-2xs text-stone-500 font-mono">
                {nodes.length} nodes · {edges.length} edges
              </span>
            </div>
          </Panel>
        </ReactFlow>

        {/* Chat Sidebar overlay */}
        <AnimatePresence>
          {openChatAgent && (
            <ChatSidebar
              agentId={openChatAgent}
              onClose={() => setOpenChatAgent(null)}
            />
          )}
        </AnimatePresence>
      </div>

      {/* Timeline fiscale bottom */}
      <TimelineBar events={auditEvents} year={year} />
    </div>
  );
}

export function CanvasCore() {
  return (
    <ReactFlowProvider>
      <CanvasInner />
    </ReactFlowProvider>
  );
}
