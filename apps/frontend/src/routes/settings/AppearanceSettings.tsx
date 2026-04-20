/**
 * Page /settings/appearance — Préférences d'apparence (thème light/dark).
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Sun, Moon } from 'lucide-react';
import { useThemeContext } from '@/hooks/ThemeContext';
import type { Theme } from '@/hooks/useTheme';

interface ThemeOption {
  value: Theme;
  label: string;
  desc: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const THEME_OPTIONS: ThemeOption[] = [
  {
    value: 'light',
    label: 'Clair',
    desc: 'Fond crème, texte sombre, accent orange Lexa.',
    Icon: Sun,
  },
  {
    value: 'dark',
    label: 'Sombre',
    desc: 'Fond stone foncé, texte clair — idéal la nuit.',
    Icon: Moon,
  },
];

export function AppearanceSettings() {
  const navigate = useNavigate();
  const { theme, setTheme } = useThemeContext();

  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="h-14 border-b border-border bg-surface flex items-center px-6 gap-3">
        <button
          onClick={() => navigate('/settings')}
          className="btn-ghost !px-2 !py-1.5"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold">Apparence</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <p className="text-sm text-muted mb-6">
          Choisissez l'apparence de l'interface. Le réglage est sauvegardé localement.
        </p>

        <div className="space-y-3">
          {THEME_OPTIONS.map((opt) => {
            const Icon = opt.Icon;
            const isActive = theme === opt.value;
            return (
              <button
                key={opt.value}
                onClick={() => setTheme(opt.value)}
                className={[
                  'w-full card p-5 flex items-center gap-4 transition-colors text-left',
                  isActive
                    ? 'border-accent bg-elevated'
                    : 'hover:border-border-strong',
                ].join(' ')}
                aria-pressed={isActive}
              >
                <div
                  className={[
                    'w-10 h-10 rounded-lg grid place-items-center flex-shrink-0',
                    isActive ? 'bg-accent/15' : 'bg-elevated',
                  ].join(' ')}
                >
                  <Icon
                    className={['w-5 h-5', isActive ? 'text-accent' : 'text-muted'].join(' ')}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className={[
                      'font-semibold',
                      isActive ? 'text-ink' : 'text-ink',
                    ].join(' ')}
                  >
                    {opt.label}
                  </div>
                  <div className="text-sm text-muted mt-0.5">{opt.desc}</div>
                </div>
                {/* Radio indicator */}
                <div
                  className={[
                    'w-5 h-5 rounded-full border-2 grid place-items-center flex-shrink-0 transition-colors',
                    isActive
                      ? 'border-accent'
                      : 'border-border-strong',
                  ].join(' ')}
                >
                  {isActive && (
                    <div className="w-2.5 h-2.5 rounded-full bg-accent" />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </div>
  );
}
