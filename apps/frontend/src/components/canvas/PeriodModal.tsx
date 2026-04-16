import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Calendar } from 'lucide-react';

export type PeriodRange = {
  label: string;
  start: string; // YYYY-MM-DD
  end: string;
  key: string;
};

/** Presets période standard comptable */
export function buildPresets(year: number): PeriodRange[] {
  const now = new Date();
  const currentMonth = now.getMonth(); // 0-indexed
  const currentQuarter = Math.floor(currentMonth / 3);

  const pad = (n: number) => String(n).padStart(2, '0');
  const ym = (y: number, m: number) => `${y}-${pad(m + 1)}`;

  const monthStart = (y: number, m: number) => `${ym(y, m)}-01`;
  const monthEnd = (y: number, m: number) => {
    const last = new Date(y, m + 1, 0).getDate();
    return `${ym(y, m)}-${pad(last)}`;
  };

  const quarterLabels = ['T1 (Jan-Mar)', 'T2 (Avr-Juin)', 'T3 (Juil-Sept)', 'T4 (Oct-Déc)'];

  return [
    {
      key: 'all',
      label: `Année ${year}`,
      start: `${year}-01-01`,
      end: `${year}-12-31`,
    },
    {
      key: 'current-month',
      label: `Mois courant — ${now.toLocaleDateString('fr-CH', { month: 'long' })}`,
      start: monthStart(year, currentMonth),
      end: monthEnd(year, currentMonth),
    },
    {
      key: 'current-quarter',
      label: `Trimestre courant — ${quarterLabels[currentQuarter]}`,
      start: monthStart(year, currentQuarter * 3),
      end: monthEnd(year, currentQuarter * 3 + 2),
    },
    {
      key: 'q1',
      label: `Trimestre 1 — ${quarterLabels[0]}`,
      start: `${year}-01-01`,
      end: `${year}-03-31`,
    },
    {
      key: 'q2',
      label: `Trimestre 2 — ${quarterLabels[1]}`,
      start: `${year}-04-01`,
      end: `${year}-06-30`,
    },
    {
      key: 'q3',
      label: `Trimestre 3 — ${quarterLabels[2]}`,
      start: `${year}-07-01`,
      end: `${year}-09-30`,
    },
    {
      key: 'q4',
      label: `Trimestre 4 — ${quarterLabels[3]}`,
      start: `${year}-10-01`,
      end: `${year}-12-31`,
    },
  ];
}

type Props = {
  open: boolean;
  onClose: () => void;
  year: number;
  current: PeriodRange;
  onSelect: (range: PeriodRange) => void;
};

export function PeriodModal({ open, onClose, year, current, onSelect }: Props) {
  const modalRef = useRef<HTMLDivElement | null>(null);
  const [customStart, setCustomStart] = useState(current.start);
  const [customEnd, setCustomEnd] = useState(current.end);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    function onMouseDown(e: MouseEvent) {
      if (modalRef.current && !modalRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    }
    window.addEventListener('keydown', onKey);
    // Use mousedown on a delay to avoid catching the opening click
    const t = setTimeout(() => window.addEventListener('mousedown', onMouseDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
      clearTimeout(t);
    };
  }, [open, onClose]);

  const presets = buildPresets(year);

  function applyCustom() {
    if (!customStart || !customEnd) return;
    onSelect({
      key: 'custom',
      label: `${customStart} → ${customEnd}`,
      start: customStart,
      end: customEnd,
    });
    onClose();
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
        >
          <motion.div
            ref={modalRef}
            initial={{ scale: 0.96, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.96, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-md bg-surface border border-border rounded-xl shadow-2xl overflow-hidden"
          >
            <header className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted" />
                <h2 className="text-sm font-semibold text-ink">Filtrer par période</h2>
              </div>
              <button
                onClick={onClose}
                className="p-1 rounded hover:bg-elevated text-subtle hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </header>

            <div className="p-4">
              <div className="text-2xs uppercase tracking-wider text-subtle font-mono mb-2">
                Presets
              </div>
              <ul className="space-y-1 mb-5">
                {presets.map((p) => (
                  <li key={p.key}>
                    <button
                      onClick={() => {
                        onSelect(p);
                        onClose();
                      }}
                      className={`w-full text-left px-3 py-2 rounded border transition-colors text-sm ${
                        current.key === p.key
                          ? 'border-accent bg-accent/10 text-ink'
                          : 'border-border text-ink hover:border-accent/60 hover:bg-elevated'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span>{p.label}</span>
                        <span className="text-2xs font-mono text-subtle">
                          {p.start.slice(5)} → {p.end.slice(5)}
                        </span>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>

              <div className="text-2xs uppercase tracking-wider text-subtle font-mono mb-2">
                Période personnalisée
              </div>
              <div className="grid grid-cols-2 gap-2 mb-3">
                <input
                  type="date"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                  className="input text-sm"
                />
                <input
                  type="date"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                  className="input text-sm"
                />
              </div>
              <button
                onClick={applyCustom}
                disabled={!customStart || !customEnd || customStart > customEnd}
                className="btn-secondary w-full text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Appliquer la période personnalisée
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
