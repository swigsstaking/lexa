import { useMemo } from 'react';

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
export function FiscalTimeline({ year, selected, onSelect }: Props) {
  const now = new Date();
  const y = year ?? now.getFullYear();
  const cursor = selected ?? now;

  const { progress, months } = useMemo(() => {
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
    return { progress: { now: progressPct, cursor: cursorPct }, months: monthsArr };
  }, [y, cursor, now]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!onSelect) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pct = (e.clientX - rect.left) / rect.width;
    const start = new Date(y, 0, 1).getTime();
    const end = new Date(y + 1, 0, 1).getTime();
    const t = start + pct * (end - start);
    onSelect(new Date(t));
  };

  return (
    <div className="h-[60px] bg-surface border-t border-border px-6 flex items-center gap-4 select-none">
      <div className="flex items-baseline gap-2">
        <span className="text-2xs uppercase tracking-wider text-muted">Exercice</span>
        <span className="text-sm font-semibold text-ink mono-num">{y}</span>
      </div>
      <div
        className="flex-1 relative h-8 cursor-pointer group"
        onClick={handleClick}
        role="slider"
        aria-label="Timeline fiscale"
        aria-valuemin={0}
        aria-valuemax={365}
        aria-valuenow={Math.round(progress.cursor * 365)}
      >
        {/* Track */}
        <div className="absolute inset-y-3 left-0 right-0 bg-elevated rounded-full border border-border" />
        {/* Passé consolidé */}
        <div
          className="absolute inset-y-3 left-0 bg-success/25 rounded-l-full border-y border-l border-success/40"
          style={{ width: `${progress.now * 100}%` }}
        />
        {/* Présent (point maintenant) */}
        <div
          className="absolute top-2 bottom-2 w-0.5 bg-warning"
          style={{ left: `${progress.now * 100}%` }}
        />
        {/* Futur prédit */}
        <div
          className="absolute inset-y-3 right-0 bg-transparent rounded-r-full border-y border-r border-dashed border-subtle"
          style={{ width: `${(1 - progress.now) * 100}%`, left: `${progress.now * 100}%` }}
        />
        {/* Curseur sélectionné */}
        <div
          className="absolute top-1 bottom-1 w-1 bg-accent rounded-full shadow-glow-accent transition-all"
          style={{ left: `calc(${progress.cursor * 100}% - 2px)` }}
        />
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
      </div>
      <div className="flex items-center gap-2 text-2xs text-muted">
        <span className="w-2 h-2 rounded-full bg-success/60" />
        <span>Passé</span>
        <span className="w-2 h-2 rounded-full bg-warning ml-2" />
        <span>Présent</span>
        <span className="w-2 h-2 rounded-full border border-dashed border-subtle ml-2" />
        <span>Futur prédit</span>
      </div>
    </div>
  );
}
