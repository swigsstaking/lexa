import { BaseEdge, EdgeLabelRenderer, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface TransactionEdgeData extends Record<string, unknown> {
  amount: number;
  currency: string;
  tvaCode?: string;
  description?: string;
  occurredAt?: string;
}

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

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

  return (
    <>
      <BaseEdge
        path={path}
        style={{
          stroke: selected ? 'rgb(var(--accent))' : 'rgb(var(--border-strong))',
          strokeWidth: selected ? 2 : 1.5,
          strokeDasharray: '6 6',
          strokeDashoffset: 0,
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
            className="card-elevated px-2 py-1 flex items-center gap-1.5 text-2xs"
          >
            <span className="mono-num text-ink font-medium">
              {fmtChf(d.amount)} {d.currency}
            </span>
            {d.tvaCode && <span className="chip !py-0 !px-1 text-subtle">{d.tvaCode}</span>}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
