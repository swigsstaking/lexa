import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export interface CanvasEdgeData extends Record<string, unknown> {
  kind?: 'classification' | 'declaration' | 'document' | 'internal';
  active?: boolean;
}

const KIND_STYLE: Record<string, { stroke: string; dasharray?: string }> = {
  classification: { stroke: 'rgb(87 83 78)', dasharray: undefined },
  declaration: { stroke: 'rgb(87 83 78)', dasharray: '5 5' },
  document: { stroke: 'rgb(68 64 60)', dasharray: '4 4' },
  internal: { stroke: 'rgb(41 37 36)', dasharray: '3 6' },
};

export function CanvasEdge({
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  selected,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const d = data as CanvasEdgeData | undefined;
  const kind = d?.kind ?? 'classification';
  const style = KIND_STYLE[kind] ?? KIND_STYLE.classification;

  return (
    <BaseEdge
      path={path}
      style={{
        stroke: selected ? 'rgb(120 113 108)' : style.stroke,
        strokeWidth: selected ? 2 : 1.5,
        strokeDasharray: style.dasharray,
        opacity: selected ? 1 : 0.7,
        transition: 'stroke 0.2s, opacity 0.2s',
      }}
    />
  );
}
