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
                  ? 'bg-lexa-primary text-white border-lexa-primary'
                  : active
                    ? 'bg-lexa-surface text-lexa-primary border-lexa-primary'
                    : 'bg-lexa-surface text-lexa-muted border-lexa-border'
              }`}
            >
              {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
            </div>
            <span
              className={`text-xs hidden md:inline ${
                active ? 'text-lexa-ink font-medium' : 'text-lexa-muted'
              }`}
            >
              {label}
            </span>
            {i < steps.length - 1 && <div className="w-6 h-px bg-lexa-border" />}
          </li>
        );
      })}
    </ol>
  );
}
