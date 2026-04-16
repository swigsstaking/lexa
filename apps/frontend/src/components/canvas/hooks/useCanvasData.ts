import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import type { Node, Edge } from '@xyflow/react';

// ── Positions par défaut (layout calculé) ────────────────────────────────────

/** Agents en arc autour du centre */
function agentDefaultPosition(index: number, total: number): { x: number; y: number } {
  const centerX = 700;
  const centerY = 280;
  const radius = 320;
  const angle = (index / total) * Math.PI * 2 - Math.PI / 2;
  return {
    x: centerX + Math.cos(angle) * radius,
    y: centerY + Math.sin(angle) * radius,
  };
}

const KNOWN_AGENTS = [
  { id: 'classifier', label: 'Classifier', description: 'Classifie les transactions comptables' },
  { id: 'reasoning', label: 'Reasoning', description: 'Raisonnement fiscal avancé RAG' },
  { id: 'tva', label: 'TVA', description: 'Gestion TVA suisse 8.1%' },
  { id: 'cloture', label: 'Clôture', description: 'Clôture continue CO 957-963' },
  { id: 'audit', label: 'Audit', description: 'Audit intégrité IA CO 958f' },
  { id: 'conseiller', label: 'Conseiller', description: 'Optimisation fiscale proactive' },
  { id: 'fiscal-pp-vs', label: 'PP VS', description: 'Déclaration PP canton Valais' },
  { id: 'fiscal-pp-ge', label: 'PP GE', description: 'Déclaration PP canton Genève' },
  { id: 'fiscal-pp-vd', label: 'PP VD', description: 'Déclaration PP canton Vaud' },
  { id: 'fiscal-pp-fr', label: 'PP FR', description: 'Déclaration PP canton Fribourg' },
  { id: 'fiscal-pm', label: 'PM', description: 'Déclaration personnes morales' },
];

export function useCanvasData() {
  const year = new Date().getFullYear();

  const agentsQuery = useQuery({
    queryKey: ['agents'],
    queryFn: lexa.listAgents,
    staleTime: 60_000,
    retry: false,
  });

  const documentsQuery = useQuery({
    queryKey: ['documents'],
    queryFn: lexa.listDocuments,
    staleTime: 30_000,
    retry: false,
  });

  const taxpayerQuery = useQuery({
    queryKey: ['taxpayer-draft', year],
    queryFn: () => lexa.getTaxpayerDraft(year),
    staleTime: 30_000,
    retry: false,
  });

  const companyQuery = useQuery({
    queryKey: ['company-draft', year],
    queryFn: () => lexa.getCompanyDraft(year, 'VS'),
    staleTime: 30_000,
    retry: false,
  });

  const auditQuery = useQuery({
    queryKey: ['audit-trail', year],
    queryFn: () => lexa.getAuditTrail(year),
    staleTime: 60_000,
    retry: false,
  });

  const ledgerQuery = useQuery({
    queryKey: ['ledger', 10],
    queryFn: () => lexa.ledgerList(10),
    staleTime: 30_000,
    retry: false,
  });

  const nodes = useMemo<Node[]>(() => {
    const result: Node[] = [];

    // ── Agent nodes ──
    // Utilise la liste connue (fallback si API indisponible)
    const agentList = KNOWN_AGENTS;
    agentList.forEach((agent, i) => {
      const pos = agentDefaultPosition(i, agentList.length);
      result.push({
        id: `agent-${agent.id}`,
        type: 'agent',
        position: pos,
        data: {
          agentId: agent.id,
          label: agent.label,
          description: agent.description,
          model: agentsQuery.data?.agents?.find((a) => a.id === agent.id)?.model ?? 'lexa-v1',
        },
      });
    });

    // ── Document nodes ──
    const docs = (documentsQuery.data ?? []).slice(0, 5);
    docs.forEach((doc, idx) => {
      result.push({
        id: `doc-${doc.documentId}`,
        type: 'entity',
        position: { x: 80 + idx * 200, y: 640 },
        data: {
          entityType: 'document',
          label: doc.filename,
          meta: 'uploaded',
          date: doc.uploadedAt ?? '',
        },
      });
    });

    // ── Taxpayer draft node ──
    if (taxpayerQuery.data?.draft) {
      result.push({
        id: 'draft-taxpayer',
        type: 'entity',
        position: { x: 80, y: 820 },
        data: {
          entityType: 'draft-pp',
          label: `Déclaration PP ${year}`,
          meta: 'draft',
          date: '',
        },
      });
    }

    // ── Company draft node ──
    if (companyQuery.data) {
      const d = companyQuery.data;
      result.push({
        id: 'draft-company',
        type: 'entity',
        position: { x: 320, y: 820 },
        data: {
          entityType: 'draft-pm',
          label: `Déclaration PM ${year}`,
          meta: (d as { status?: string }).status ?? 'draft',
          date: '',
        },
      });
    }

    // ── Transaction nodes (depuis ledger) ──
    const entries = (ledgerQuery.data?.entries ?? []).slice(0, 6);
    const uniqueTx: Array<{ id: string; date: string; description: string; amount: number; account: string }> = [];
    const seenStreams = new Set<string>();
    for (const e of entries) {
      if (!seenStreams.has(e.streamId)) {
        seenStreams.add(e.streamId);
        uniqueTx.push({
          id: e.streamId,
          date: e.date,
          description: e.description,
          amount: e.amount,
          account: e.account,
        });
      }
      if (uniqueTx.length >= 5) break;
    }

    uniqueTx.forEach((tx, i) => {
      result.push({
        id: `tx-${tx.id}`,
        type: 'transaction',
        position: { x: 900 + i * 220, y: 700 },
        data: {
          date: tx.date,
          description: tx.description,
          amount: tx.amount,
          account: tx.account,
          currency: 'CHF',
        },
      });
    });

    return result;
  }, [agentsQuery.data, documentsQuery.data, taxpayerQuery.data, companyQuery.data, ledgerQuery.data, year]);

  const edges = useMemo<Edge[]>(() => {
    const result: Edge[] = [];

    // Classifier → transactions récentes
    nodes
      .filter((n) => n.type === 'transaction')
      .forEach((txNode) => {
        result.push({
          id: `e-classifier-${txNode.id}`,
          source: 'agent-classifier',
          target: txNode.id,
          type: 'canvas',
          animated: false,
          style: { stroke: 'rgb(68 64 60)', strokeWidth: 1.5 },
          data: { kind: 'classification' },
        });
      });

    // Fiscal PP VS → taxpayer draft
    if (nodes.find((n) => n.id === 'draft-taxpayer')) {
      result.push({
        id: 'e-fiscal-pp-taxpayer',
        source: 'agent-fiscal-pp-vs',
        target: 'draft-taxpayer',
        type: 'canvas',
        animated: false,
        style: { stroke: 'rgb(68 64 60)', strokeWidth: 1.5 },
        data: { kind: 'declaration' },
      });
    }

    // Fiscal PM → company draft
    if (nodes.find((n) => n.id === 'draft-company')) {
      result.push({
        id: 'e-fiscal-pm-company',
        source: 'agent-fiscal-pm',
        target: 'draft-company',
        type: 'canvas',
        animated: false,
        style: { stroke: 'rgb(68 64 60)', strokeWidth: 1.5 },
        data: { kind: 'declaration' },
      });
    }

    // Cloture → documents
    nodes
      .filter((n) => n.type === 'entity' && (n.data as { entityType: string }).entityType === 'document')
      .slice(0, 3)
      .forEach((docNode) => {
        result.push({
          id: `e-cloture-${docNode.id}`,
          source: 'agent-cloture',
          target: docNode.id,
          type: 'canvas',
          animated: false,
          style: { stroke: 'rgb(68 64 60)', strokeWidth: 1.5 },
          data: { kind: 'document' },
        });
      });

    // Audit → reasoning
    result.push({
      id: 'e-audit-reasoning',
      source: 'agent-audit',
      target: 'agent-reasoning',
      type: 'canvas',
      animated: false,
      style: { stroke: 'rgb(68 64 60)', strokeWidth: 1, strokeDasharray: '4 4' },
      data: { kind: 'internal' },
    });

    return result;
  }, [nodes]);

  const auditEvents = auditQuery.data?.events ?? [];

  const isLoading =
    agentsQuery.isLoading &&
    documentsQuery.isLoading &&
    ledgerQuery.isLoading;

  return { nodes, edges, auditEvents, isLoading };
}
