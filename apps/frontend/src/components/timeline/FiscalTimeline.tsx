import { useMemo } from 'react';
import { usePeriodStore } from '@/stores/periodStore';

interface Props {
  year?: number;
  /** Date cible sélectionnée (ISO) — défaut = aujourd'hui */
  selected?: Date;
  onSelect?: (d: Date) => void;
}

const MONTHS_FR = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];

/**
 * Bandeau fiscal 60px en bas du workspace.
 * 3 zones : passé consolidé (success), présent (warning), futur prédit (subtle pointillé).
 */
export function FiscalTimeline({ year, selected }: Props) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const cursor = selected ?? now;
  const period = usePeriodStore((s) => s.period);
  const openModal = usePeriodStore((s) => s.openModal);

  const { progress, months, periodRange } = useMemo(() => {
    const start = new Date(y, 0, 1).getTime();
    const end = new Date(y + 1, 0, 1).getTime();
    const nowT = now.getTime();
    const cursorT = cursor.getTime();
    const progressPct = Math.max(0, Math.min(1, (nowT - start) / (end - start)));
    const cursorPct = Math.max(0, Math.min(1, (cursorT - start) / (end - start)));
    const monthsArr = MONTHS_FR.map((label, i) => {
      const mStart = new Date(y, i, 1).getTime();
      const mPct = (mStart - start) / (end - start);
      return { label, pct: mPct, index: i };
    });
    // Période active highlight range
    const pStart = new Date(period.start).getTime();
    const pEnd = new Date(period.end).getTime();
    const pStartPct = Math.max(0, Math.min(1, (pStart - start) / (end - start)));
    const pEndPct = Math.max(0, Math.min(1, (pEnd - start) / (end - start)));
    return {
      progress: { now: progressPct, cursor: cursorPct },
      months: monthsArr,
      periodRange: { start: pStartPct, end: pEndPct },
    };
  }, [y, cursor, now, period]);

  return (
    <div className="h-[60px] bg-surface border-t border-border px-4 md:px-6 flex items-center gap-2 md:gap-4 select-none overflow-x-hidden flex-shrink-0">
      <div className="flex items-baseline gap-2">
        <span className="text-2xs uppercase tracking-wider text-muted">Période</span>
        <span className="text-sm font-semibold text-ink truncate max-w-[200px]" title={period.label}>
          {period.label}
        </span>
      </div>
      <button
        type="button"
        onClick={openModal}
        className="flex-1 relative h-8 cursor-pointer group hover:opacity-95 transition-opacity text-left"
        aria-label="Changer la période"
      >
        {/* Track — gris foncé */}
        <div className="absolute inset-y-3 left-0 right-0 bg-stone-800 rounded-full" />
        {/* Range de la période sélectionnée — vert */}
        <div
          className="absolute inset-y-3 bg-emerald-500/30 border-y border-emerald-500/60 rounded"
          style={{
            left: `${periodRange.start * 100}%`,
            width: `${(periodRange.end - periodRange.start) * 100}%`,
          }}
        />
        {/* Curseur aujourd'hui — trait fin gris clair */}
        <div
          className="absolute top-2 bottom-2 w-px bg-stone-400"
          style={{ left: `${progress.now * 100}%` }}
        />
        {/* Curseur sélectionné */}
        <div
          className="absolute top-1 bottom-1 w-1 bg-accent rounded-full shadow-glow-accent transition-all"
          style={{ left: `calc(${progress.cursor * 100}% - 2px)` }}
        />
        {/* Micro-label "aujourd'hui" — seulement si curseur = aujourd'hui */}
        {cursor.toDateString() === now.toDateString() && (
          <div
            className="absolute -top-4 text-2xs text-stone-400 font-medium pointer-events-none whitespace-nowrap"
            style={{ left: `calc(${progress.cursor * 100}% - 18px)` }}
          >
            aujourd'hui
          </div>
        )}
        {/* Labels mois */}
        <div className="absolute inset-x-0 top-0 h-3 flex">
          {months.map((m) => (
            <div
              key={m.index}
              className="flex-1 text-2xs text-subtle text-center leading-3 pointer-events-none"
            >
              {m.label}
            </div>
          ))}
        </div>
      </button>
      <div className="hidden lg:flex items-center gap-1.5 text-2xs text-subtle flex-shrink-0 font-mono">
        <span>{y}</span>
        <span className="text-muted">·</span>
        <span>clic pour changer</span>
      </div>
    </div>
  );
}
