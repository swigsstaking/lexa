import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';

export interface ClassNodeData extends Record<string, unknown> {
  kafClass: string;
  label: string;
  aggregatedBalance: number;
  accountCount: number;
  expanded: boolean;
}

/** Couleur accent par classe Käfer (cohérente avec AccountNode categories) */
const CLASS_ACCENT: Record<string, { border: string; badge: string; dot: string }> = {
  '1': { border: 'border-success/60 hover:border-success',    badge: 'text-success',  dot: 'bg-success' },
  '2': { border: 'border-warning/60 hover:border-warning',    badge: 'text-warning',  dot: 'bg-warning' },
  '3': { border: 'border-accent/60  hover:border-accent',     badge: 'text-accent',   dot: 'bg-accent' },
  '4': { border: 'border-danger/50  hover:border-danger',     badge: 'text-danger',   dot: 'bg-danger' },
  '5': { border: 'border-danger/50  hover:border-danger',     badge: 'text-danger',   dot: 'bg-danger' },
  '6': { border: 'border-danger/40  hover:border-danger/70',  badge: 'text-danger',   dot: 'bg-danger' },
  '7': { border: 'border-muted/60   hover:border-accent/60',  badge: 'text-muted',    dot: 'bg-muted' },
  '8': { border: 'border-muted/60   hover:border-accent/60',  badge: 'text-muted',    dot: 'bg-muted' },
  '9': { border: 'border-subtle/60  hover:border-muted',      badge: 'text-subtle',   dot: 'bg-subtle' },
};

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function ClassNode({ data }: NodeProps) {
  const d = data as ClassNodeData;
  const accent = CLASS_ACCENT[d.kafClass] ?? CLASS_ACCENT['7'];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25 }}
      className={`relative min-w-[240px] rounded-2xl border-2 bg-surface px-5 py-4 transition-all cursor-pointer hover:shadow-md ${accent.border}`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="l"
        className="!w-2.5 !h-2.5 !bg-border-strong !border-0"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="l-src"
        className="!w-2.5 !h-2.5 !bg-border-strong !border-0 !opacity-0"
      />

      {/* En-tête classe */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs font-mono uppercase tracking-wider text-muted">
            Classe {d.kafClass}
          </div>
          <div className="text-sm font-semibold text-ink truncate max-w-[180px]">
            {d.label}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className={`text-2xs font-mono uppercase font-semibold ${accent.badge}`}>
            {d.kafClass}xxx
          </span>
          <span className="text-2xs text-subtle">
            {d.accountCount} compte{d.accountCount > 1 ? 's' : ''}
          </span>
        </div>
      </div>

      {/* Solde agrégé */}
      <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
        <span className="text-2xs text-subtle uppercase tracking-wider">Solde agrégé</span>
        <span
          className={`mono-num text-sm font-semibold ${
            d.aggregatedBalance < 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {fmtChf(d.aggregatedBalance)}
        </span>
      </div>

      {/* Indicateur expand */}
      <div className="mt-2 flex items-center justify-center gap-1.5 text-2xs text-subtle">
        <span className={`w-1.5 h-1.5 rounded-full ${accent.dot} opacity-60`} />
        <span>{d.expanded ? 'Cliquer pour grouper' : 'Cliquer pour développer'}</span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        id="r"
        className="!w-2.5 !h-2.5 !bg-border-strong !border-0"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="r-tgt"
        className="!w-2.5 !h-2.5 !bg-border-strong !border-0 !opacity-0"
      />
    </motion.div>
  );
}
