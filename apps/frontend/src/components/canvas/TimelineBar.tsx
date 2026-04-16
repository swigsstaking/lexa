import { useMemo } from 'react';
import { motion } from 'framer-motion';

interface AuditEvent {
  eventId: number;
  occurredAt: string;
  type: string;
  description?: string;
  amount?: number;
  aiDecision?: { agent: string; confidence: number } | null;
}

interface Props {
  events: AuditEvent[];
  year: number;
}

const MONTHS = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const EVENT_COLOR: Record<string, string> = {
  transaction_created: 'bg-blue-400',
  transaction_classified: 'bg-emerald-400',
  document_uploaded: 'bg-violet-400',
  document_processed: 'bg-violet-300',
  taxpayer_draft_updated: 'bg-orange-400',
  company_draft_updated: 'bg-orange-300',
  declaration_submitted: 'bg-emerald-500',
  tva_calculated: 'bg-yellow-400',
  audit_run: 'bg-red-400',
};

function getEventColor(type: string): string {
  return EVENT_COLOR[type] ?? 'bg-stone-500';
}

export function TimelineBar({ events, year }: Props) {
  const eventsByMonth = useMemo(() => {
    const map: Record<number, AuditEvent[]> = {};
    for (let i = 0; i < 12; i++) map[i] = [];

    for (const e of events) {
      try {
        const d = new Date(e.occurredAt);
        if (d.getFullYear() === year) {
          const m = d.getMonth();
          map[m].push(e);
        }
      } catch {
        // skip invalid date
      }
    }
    return map;
  }, [events, year]);

  const totalEvents = events.length;

  return (
    <div className="flex-shrink-0 h-[72px] bg-stone-950/90 backdrop-blur-sm border-t border-stone-800 flex items-center px-4 gap-1 overflow-hidden">
      {/* Label année */}
      <div className="flex-shrink-0 mr-3 pr-3 border-r border-stone-800">
        <div className="text-2xs text-stone-500 font-mono uppercase tracking-wider">{year}</div>
        <div className="text-xs text-stone-300 font-mono font-semibold">{totalEvents}</div>
        <div className="text-2xs text-stone-600">events</div>
      </div>

      {/* Colonnes mois */}
      {MONTHS.map((month, i) => {
        const monthEvents = eventsByMonth[i] ?? [];
        const maxVisible = 6;
        const visible = monthEvents.slice(0, maxVisible);
        const overflow = monthEvents.length - maxVisible;
        const isCurrentMonth = new Date().getMonth() === i && new Date().getFullYear() === year;

        return (
          <div key={month} className="flex-1 flex flex-col items-center gap-1 min-w-0">
            {/* Dots events */}
            <div className="flex flex-wrap justify-center gap-0.5 h-8 items-end pb-0.5">
              {visible.map((e, j) => (
                <motion.div
                  key={e.eventId}
                  title={`${e.type}${e.description ? ` — ${e.description}` : ''}`}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: i * 0.02 + j * 0.01, duration: 0.2 }}
                  className={`w-1.5 h-1.5 rounded-full ${getEventColor(e.type)} opacity-80 hover:opacity-100 cursor-default`}
                />
              ))}
              {overflow > 0 && (
                <div className="text-2xs text-stone-600 font-mono leading-none">+{overflow}</div>
              )}
            </div>

            {/* Séparateur mois */}
            <div className={`w-px h-2 ${isCurrentMonth ? 'bg-stone-400' : 'bg-stone-700'}`} />

            {/* Label mois */}
            <div className={`text-2xs font-mono ${
              isCurrentMonth ? 'text-stone-300 font-semibold' : 'text-stone-600'
            }`}>{month}</div>
          </div>
        );
      })}

      {/* Légende — masquée sur petits viewports pour éviter débordement */}
      <div className="hidden lg:flex flex-shrink-0 ml-3 pl-3 border-l border-stone-800 flex-col gap-1">
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          <span className="text-2xs text-stone-600">tx</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-violet-400" />
          <span className="text-2xs text-stone-600">doc</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
          <span className="text-2xs text-stone-600">IA</span>
        </div>
      </div>
    </div>
  );
}
