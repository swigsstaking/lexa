import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';

export interface AccountNodeData extends Record<string, unknown> {
  code: string;
  label: string;
  balance: number;
  debit: number;
  credit: number;
  category: 'actif' | 'passif' | 'charge' | 'produit' | 'neutre';
  recent?: boolean;
}

const CATEGORY_ACCENT: Record<AccountNodeData['category'], string> = {
  actif: 'text-success',
  passif: 'text-warning',
  charge: 'text-danger',
  produit: 'text-accent',
  neutre: 'text-muted',
};

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export function AccountNode({ data, selected }: NodeProps) {
  const d = data as AccountNodeData;
  const accentCls = CATEGORY_ACCENT[d.category];
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{
        opacity: 1,
        scale: 1,
      }}
      transition={{ duration: 0.3 }}
      className={`relative min-w-[220px] rounded-xl border bg-surface px-4 py-3 transition-all cursor-pointer hover:shadow-md ${
        selected
          ? 'border-accent shadow-glow-accent'
          : d.recent
            ? 'border-accent/50 hover:border-accent'
            : 'border-border hover:border-accent/60'
      }`}
    >
      <Handle
        type="target"
        position={Position.Left}
        id="l"
        className="!w-2 !h-2 !bg-border-strong !border-0"
      />
      <Handle
        type="source"
        position={Position.Left}
        id="l-src"
        className="!w-2 !h-2 !bg-border-strong !border-0 !opacity-0"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-2xs font-mono uppercase tracking-wider text-muted">{d.code}</div>
          <div className="text-sm font-medium text-ink truncate max-w-[180px]">{d.label}</div>
        </div>
        <span className={`text-2xs font-mono uppercase ${accentCls}`}>
          {d.category[0]?.toUpperCase()}
        </span>
      </div>
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between">
        <span className="text-2xs text-subtle uppercase tracking-wider">Solde</span>
        <span
          className={`mono-num text-sm font-semibold ${
            d.balance < 0 ? 'text-danger' : 'text-ink'
          }`}
        >
          {fmtChf(d.balance)}
        </span>
      </div>
      {d.recent && (
        <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-accent animate-pulse-subtle" />
      )}
      <Handle
        type="source"
        position={Position.Right}
        id="r"
        className="!w-2 !h-2 !bg-border-strong !border-0"
      />
      <Handle
        type="target"
        position={Position.Right}
        id="r-tgt"
        className="!w-2 !h-2 !bg-border-strong !border-0 !opacity-0"
      />
    </motion.div>
  );
}
