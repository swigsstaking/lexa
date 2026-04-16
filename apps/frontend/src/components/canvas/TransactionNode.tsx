import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { ArrowRightLeft } from 'lucide-react';

export interface TransactionNodeData extends Record<string, unknown> {
  date: string;
  description: string;
  amount: number;
  account: string;
  currency: string;
}

const fmtChf = (n: number) =>
  new Intl.NumberFormat('fr-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

export const TransactionNode = memo(function TransactionNode({ data, selected }: NodeProps) {
  const d = data as TransactionNodeData;
  const isDebit = d.amount < 0;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`
        relative min-w-[170px] max-w-[210px] rounded-xl border px-3 py-2.5 transition-all
        ${selected
          ? 'border-stone-400 bg-stone-800'
          : 'border-stone-700/40 bg-stone-900/70 hover:border-stone-600 hover:bg-stone-800/50'
        }
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1.5 !h-1.5 !bg-stone-700 !border-0 !opacity-50"
      />

      <div className="flex items-start gap-2">
        <div className="p-1 rounded-md bg-stone-800 border border-stone-700/50 flex-shrink-0 mt-0.5">
          <ArrowRightLeft className="w-2.5 h-2.5 text-stone-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-2xs text-stone-500 font-mono">
            {d.date ? new Date(d.date).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' }) : '—'}
          </div>
          <div className="text-xs text-stone-200 truncate leading-tight mt-0.5">{d.description || '—'}</div>
          <div className="flex items-center justify-between mt-1">
            <span className="text-2xs text-stone-500 font-mono">{d.account}</span>
            <span className={`text-xs font-semibold font-mono ${isDebit ? 'text-red-400' : 'text-emerald-400'}`}>
              {isDebit ? '-' : '+'}{fmtChf(Math.abs(d.amount))}
            </span>
          </div>
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1.5 !h-1.5 !bg-stone-700 !border-0 !opacity-50"
      />
    </motion.div>
  );
});
