import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import {
  Brain,
  Calculator,
  FileText,
  Building2,
  BookOpen,
  Shield,
  Sparkles,
  MessageSquare,
  ScrollText,
} from 'lucide-react';

export interface AgentNodeData extends Record<string, unknown> {
  agentId: string;
  label: string;
  description: string;
  model?: string;
  state?: 'idle' | 'thinking' | 'ready' | 'error';
  lastRunAt?: string;
  responsesToday?: number;
  onChatOpen?: (agentId: string) => void;
}

const AGENT_ICONS: Record<string, React.ElementType> = {
  classifier: Brain,
  reasoning: MessageSquare,
  tva: Calculator,
  'fiscal-pp-vs': FileText,
  'fiscal-pp-ge': FileText,
  'fiscal-pp-vd': FileText,
  'fiscal-pp-fr': FileText,
  'fiscal-pp-ne': FileText,
  'fiscal-pp-ju': FileText,
  'fiscal-pp-bj': FileText,
  'fiscal-pm': Building2,
  cloture: BookOpen,
  audit: Shield,
  conseiller: Sparkles,
};

const STATE_CONFIG = {
  idle: { dot: 'bg-stone-500', label: 'idle', pulse: false },
  thinking: { dot: 'bg-amber-400', label: 'actif', pulse: true },
  ready: { dot: 'bg-emerald-400', label: 'prêt', pulse: false },
  error: { dot: 'bg-red-500', label: 'erreur', pulse: false },
};

const CHAT_CAPABLE = ['classifier', 'reasoning', 'tva', 'cloture', 'audit', 'conseiller'];

export const AgentNode = memo(function AgentNode({ data, selected }: NodeProps) {
  const d = data as AgentNodeData;
  const Icon = AGENT_ICONS[d.agentId] ?? ScrollText;
  const state = d.state ?? 'idle';
  const stateConfig = STATE_CONFIG[state];
  const isThinking = state === 'thinking';
  const canChat = CHAT_CAPABLE.includes(d.agentId);

  const handleClick = () => {
    if (canChat && d.onChatOpen) {
      d.onChatOpen(d.agentId);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.25, ease: 'easeOut' }}
      onClick={handleClick}
      title={d.description}
      className={`
        relative min-w-[180px] rounded-xl border px-3.5 py-3 transition-all select-none
        ${canChat ? 'cursor-pointer' : 'cursor-default'}
        ${selected
          ? 'border-stone-400 shadow-lg shadow-stone-900/60 bg-stone-800'
          : isThinking
            ? 'border-amber-500/50 bg-stone-900/90'
            : 'border-stone-700 bg-stone-900 hover:border-stone-500 hover:bg-stone-800/80'
        }
      `}
    >
      {/* Thinking glow */}
      {isThinking && (
        <motion.div
          className="absolute inset-0 rounded-xl border border-amber-400/30"
          animate={{ opacity: [0.3, 0.7, 0.3] }}
          transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-stone-700 !border-0 !opacity-60"
      />

      {/* Header */}
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`p-1.5 rounded-lg ${isThinking ? 'bg-amber-500/10' : 'bg-stone-800'} border border-stone-700/50`}>
          <Icon className={`w-3.5 h-3.5 ${isThinking ? 'text-amber-400' : 'text-stone-300'}`} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-semibold text-stone-100 truncate font-mono">{d.label}</div>
          {d.model && (
            <div className="text-2xs text-stone-500 truncate font-mono">{d.model}</div>
          )}
        </div>
      </div>

      {/* Description */}
      <div className="text-2xs text-stone-500 leading-relaxed mb-2.5 line-clamp-2">{d.description}</div>

      {/* Footer : state badge + chat hint */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {stateConfig.pulse ? (
            <motion.div
              className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot}`}
              animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
            />
          ) : (
            <div className={`w-1.5 h-1.5 rounded-full ${stateConfig.dot}`} />
          )}
          <span className={`text-2xs font-medium font-mono ${
            state === 'thinking' ? 'text-amber-400' :
            state === 'ready' ? 'text-emerald-400' :
            state === 'error' ? 'text-red-400' :
            'text-stone-500'
          }`}>{stateConfig.label}</span>
        </div>
        {canChat && (
          <span className="text-2xs text-stone-600 hover:text-stone-400 transition-colors">
            Interroger →
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-stone-700 !border-0 !opacity-60"
      />
    </motion.div>
  );
});
