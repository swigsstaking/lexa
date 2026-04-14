import { Check } from 'lucide-react';

interface Props {
  steps: string[];
  current: number;
}

export function StepIndicator({ steps, current }: Props) {
  return (
    <ol className="flex items-center gap-2">
      {steps.map((label, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <li key={label} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full grid place-items-center text-xs font-medium border transition-colors ${
                done
                  ? 'bg-accent text-accent-fg border-accent'
                  : active
                    ? 'bg-surface text-accent border-accent'
                    : 'bg-surface text-muted border-border'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-xs hidden md:inline ${
                active ? 'text-ink font-medium' : 'text-muted'
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
