import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { FileText, Building2, FileClock } from 'lucide-react';

export interface EntityNodeData extends Record<string, unknown> {
  entityType: 'document' | 'draft-pp' | 'draft-pm';
  label: string;
  meta?: string;
  date?: string;
  ocrStatus?: string;
}

const ENTITY_CONFIG: Record<EntityNodeData['entityType'], {
  icon: React.ElementType;
  color: string;
  bg: string;
  borderColor: string;
}> = {
  document: { icon: FileText, color: 'text-blue-400', bg: 'bg-blue-500/10', borderColor: 'border-blue-500/20' },
  'draft-pp': { icon: FileClock, color: 'text-violet-400', bg: 'bg-violet-500/10', borderColor: 'border-violet-500/20' },
  'draft-pm': { icon: Building2, color: 'text-orange-400', bg: 'bg-orange-500/10', borderColor: 'border-orange-500/20' },
};

const STATUS_LABELS: Record<string, string> = {
  uploaded: 'uploadé',
  processing: 'OCR en cours',
  done: 'traité',
  error: 'erreur',
  draft: 'brouillon',
  submitted: 'soumis',
};

export const EntityNode = memo(function EntityNode({ data, selected }: NodeProps) {
  const d = data as EntityNodeData;
  const cfg = ENTITY_CONFIG[d.entityType] ?? ENTITY_CONFIG.document;
  const Icon = cfg.icon;
  const statusLabel = STATUS_LABELS[d.meta ?? ''] ?? d.meta ?? '';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className={`
        relative min-w-[160px] max-w-[200px] rounded-xl border px-3 py-2.5 transition-all
        ${selected
          ? `${cfg.borderColor.replace('/20', '/60')} bg-stone-800`
          : `border-stone-700/50 bg-stone-900/80 hover:border-stone-600 hover:bg-stone-800/60`
        }
      `}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1.5 !h-1.5 !bg-stone-700 !border-0 !opacity-60"
      />

      <div className="flex items-start gap-2">
        <div className={`p-1.5 rounded-lg ${cfg.bg} border ${cfg.borderColor} flex-shrink-0 mt-0.5`}>
          <Icon className={`w-3 h-3 ${cfg.color}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-stone-200 truncate leading-tight">{d.label}</div>
          {statusLabel && (
            <div className={`text-2xs mt-0.5 font-mono ${
              d.meta === 'done' || d.meta === 'submitted' ? 'text-emerald-400/70' :
              d.meta === 'error' ? 'text-red-400/70' :
              d.meta === 'processing' ? 'text-amber-400/70' :
              'text-stone-500'
            }`}>
              {statusLabel}
            </div>
          )}
          {d.date && (
            <div className="text-2xs text-stone-600 mt-0.5 font-mono">
              {new Date(d.date).toLocaleDateString('fr-CH', { day: '2-digit', month: 'short' })}
            </div>
          )}
        </div>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1.5 !h-1.5 !bg-stone-700 !border-0 !opacity-60"
      />
    </motion.div>
  );
});
