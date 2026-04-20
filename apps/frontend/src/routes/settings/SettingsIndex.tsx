/**
 * Page /settings — Hub des réglages tenant.
 */

import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Mail, Briefcase, ChevronRight, SunMoon } from 'lucide-react';

const sections = [
  {
    path: '/settings/appearance',
    label: 'Apparence',
    desc: 'Choisir entre le thème clair (cream) et sombre (stone).',
    icon: SunMoon,
  },
  {
    path: '/settings/email-forward',
    label: 'Email forward IMAP',
    desc: 'Adresse dédiée pour recevoir factures et pièces par email.',
    icon: Mail,
  },
  {
    path: '/settings/integrations/pro',
    label: 'Intégration Swigs Pro',
    desc: 'Activer ou désactiver la réception automatique des events depuis Swigs Pro.',
    icon: Briefcase,
  },
];

export function SettingsIndex() {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-bg text-ink">
      <header className="h-14 border-b border-border bg-surface flex items-center px-6 gap-3">
        <button
          onClick={() => navigate('/workspace')}
          className="btn-ghost !px-2 !py-1.5"
          aria-label="Retour"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold">Réglages</h1>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-3">
        {sections.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.path}
              onClick={() => navigate(s.path)}
              className="w-full card p-5 flex items-center gap-4 hover:border-accent transition-colors text-left"
            >
              <div className="w-10 h-10 rounded-lg bg-elevated grid place-items-center flex-shrink-0">
                <Icon className="w-5 h-5 text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-ink">{s.label}</div>
                <div className="text-sm text-muted mt-0.5">{s.desc}</div>
              </div>
              <ChevronRight className="w-5 h-5 text-muted flex-shrink-0" />
            </button>
          );
        })}
      </main>
    </div>
  );
}
