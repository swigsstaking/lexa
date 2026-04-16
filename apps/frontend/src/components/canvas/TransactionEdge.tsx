import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface TransactionEdgeData extends Record<string, unknown> {
  amount: number;
  currency: string;
  count?: number;
  lastOccurredAt?: string;
  direction?: 'in' | 'out' | 'neutral';
}

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

export function TransactionEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const d = data as TransactionEdgeData | undefined;
  const direction = d?.direction ?? 'neutral';

  // Couleur du trait selon direction du flux (du point de vue banque/actif) :
  //   in  = argent entrant dans la banque (produit → actif) : vert
  //   out = argent sortant de la banque (actif → charge/passif) : orange
  //   neutral = mouvement interne entre passifs ou autres
  const strokeColor = selected
    ? 'rgb(var(--accent))'
    : direction === 'in'
      ? 'rgb(34 197 94)' // emerald-500
      : direction === 'out'
        ? 'rgb(251 146 60)' // orange-400
        : 'rgb(var(--border-strong))';

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: strokeColor,
          strokeWidth: selected ? 2.5 : 1.8,
          strokeDasharray: '6 6',
          strokeDashoffset: 0,
          opacity: selected ? 1 : 0.85,
        }}
        className="animate-flow"
      />
      {d && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="card-elevated px-2 py-1 flex items-center gap-1.5 text-2xs cursor-pointer hover:border-accent/60 transition-colors"
          >
            <span className="mono-num text-ink font-medium">
              {fmtChf(d.amount)} {d.currency}
            </span>
            {d.count && d.count > 1 && (
              <span className="chip !py-0 !px-1 text-subtle">{d.count} tx</span>
            )}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
