import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { lexa } from '@/api/lexa';
import type { Node, Edge } from '@xyflow/react';

// ── Layout 3 colonnes agents + bottom row entités ──────────────────────────
// Col 0 : Ingestion    (classifier, tva)
// Col 1 : Fiscal       (fiscal-pp-*, fiscal-pm)
// Col 2 : Control      (reasoning, cloture, audit, conseiller)
// Bottom row (y≈720) : documents | drafts | transactions (flux naturel)
//
// Toutes les edges agent → entité descendent verticalement ou en diagonale
// courte — pas de traversée de cluster d'agents comme dans le layout en arc.

type AgentMeta = { id: string; label: string; description: string };

const AGENTS_BY_COL: Record<number, AgentMeta[]> = {
  0: [
    { id: 'classifier', label: 'Classifier', description: 'Classifie les transactions comptables' },
    { id: 'tva', label: 'TVA', description: 'Gestion TVA suisse 8.1%' },
  ],
  1: [
    { id: 'fiscal-pp-vs', label: 'PP VS', description: 'Déclaration PP canton Valais' },
    { id: 'fiscal-pp-ge', label: 'PP GE', description: 'Déclaration PP canton Genève' },
    { id: 'fiscal-pp-vd', label: 'PP VD', description: 'Déclaration PP canton Vaud' },
    { id: 'fiscal-pp-fr', label: 'PP FR', description: 'Déclaration PP canton Fribourg' },
    { id: 'fiscal-pm', label: 'PM', description: 'Déclaration personnes morales' },
  ],
  2: [
    { id: 'reasoning', label: 'Reasoning', description: 'Raisonnement fiscal avancé RAG' },
    { id: 'cloture', label: 'Clôture', description: 'Clôture continue CO 957-963' },
    { id: 'audit', label: 'Audit', description: 'Audit intégrité IA CO 958f' },
    { id: 'conseiller', label: 'Conseiller', description: 'Optimisation fiscale proactive' },
  ],
};

const COL_X = [80, 480, 880];
const AGENT_ROW_H = 130;
const ENTITY_Y = 760;

/** Retourne la position (x,y) d'un agent selon sa col et son index dans la col */
function agentPos(col: number, rowIdx: number, totalInCol: number): { x: number; y: number } {
  const maxRows = 5;
  const colHeight = totalInCol * AGENT_ROW_H;
  const centerOffset = ((maxRows * AGENT_ROW_H) - colHeight) / 2;
  return { x: COL_X[col], y: 40 + centerOffset + rowIdx * AGENT_ROW_H };
}

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

    // ── Agent nodes — 3 colonnes par rôle ──
    for (const col of [0, 1, 2]) {
      const colAgents = AGENTS_BY_COL[col];
      colAgents.forEach((agent, rowIdx) => {
        result.push({
          id: `agent-${agent.id}`,
          type: 'agent',
          position: agentPos(col, rowIdx, colAgents.length),
          data: {
            agentId: agent.id,
            label: agent.label,
            description: agent.description,
            model: agentsQuery.data?.agents?.find((a) => a.id === agent.id)?.model ?? 'lexa-v1',
          },
        });
      });
    }

    // ── Bottom row : documents (gauche) + drafts (centre) + transactions (droite) ──
    // x=80 sous col 0 ingestion, x=480 sous col 1 fiscal, x=880 sous col 2 control

    // Documents sous col 0 (ingestion)
    const docs = (documentsQuery.data ?? []).slice(0, 3);
    docs.forEach((doc, idx) => {
      result.push({
        id: `doc-${doc.documentId}`,
        type: 'entity',
        position: { x: 80, y: ENTITY_Y + idx * 70 },
        data: {
          entityType: 'document',
          label: doc.filename,
          meta: 'uploaded',
          date: doc.uploadedAt ?? '',
        },
      });
    });

    // Drafts sous col 1 (fiscal)
    if (taxpayerQuery.data?.draft) {
      result.push({
        id: 'draft-taxpayer',
        type: 'entity',
        position: { x: 480, y: ENTITY_Y },
        data: {
          entityType: 'draft-pp',
          label: `Déclaration PP ${year}`,
          meta: 'draft',
          date: '',
        },
      });
    }
    if (companyQuery.data) {
      const d = companyQuery.data;
      result.push({
        id: 'draft-company',
        type: 'entity',
        position: { x: 480, y: ENTITY_Y + 90 },
        data: {
          entityType: 'draft-pm',
          label: `Déclaration PM ${year}`,
          meta: (d as { status?: string }).status ?? 'draft',
          date: '',
        },
      });
    }

    // Transactions sous col 2 (control) — les dernières 3 tx
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
      if (uniqueTx.length >= 3) break;
    }

    uniqueTx.forEach((tx, i) => {
      result.push({
        id: `tx-${tx.id}`,
        type: 'transaction',
        position: { x: 880, y: ENTITY_Y + i * 70 },
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
