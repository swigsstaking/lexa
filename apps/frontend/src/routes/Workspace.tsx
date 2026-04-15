import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  Building2,
  Calculator,
  Command,
  FileSignature,
  LogOut,
  Sparkles,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useActiveCompany, useCompaniesStore } from '@/stores/companiesStore';
import { useAuthStore } from '@/stores/authStore';
import { useChatStore } from '@/stores/chatStore';
import { LedgerCanvas } from '@/components/canvas/LedgerCanvas';
import { ChatOverlay } from '@/components/chat/ChatOverlay';
import { LedgerModal } from '@/components/ledger/LedgerModal';
import { FiscalTimeline } from '@/components/timeline/FiscalTimeline';

export function Workspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const company = useActiveCompany();
  const clear = useCompaniesStore((s) => s.clear);
  const authLogout = useAuthStore((s) => s.logout);
  const setChatOpen = useChatStore((s) => s.setOpen);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(new Date());

  const health = useQuery({ queryKey: ['health'], queryFn: lexa.health });

  // Raccourci cmd+shift+L pour le mode expert
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.shiftKey && e.key.toLowerCase() === 'l') {
        e.preventDefault();
        setLedgerOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleLogout = () => {
    authLogout();
    clear();
    navigate('/login', { replace: true });
  };

  const servicesState: 'checking' | 'up' | 'down' = health.data
    ? health.data.services.postgres &&
      health.data.services.qdrant &&
      health.data.services.ollama &&
      health.data.services.embedder
      ? 'up'
      : 'down'
    : 'checking';

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface flex-shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center font-semibold text-xs">
              L
            </div>
            <span className="text-sm font-semibold">{t('app.name')}</span>
          </div>

          <span className="w-px h-5 bg-border" />

          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-muted flex-shrink-0" />
            <span className="text-sm text-ink truncate">{company?.name ?? t('common.empty')}</span>
            {company?.uid && (
              <span className="text-2xs text-subtle mono-num">{company.uid}</span>
            )}
            {company?.canton && <span className="chip">{company.canton}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated border border-border">
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                servicesState === 'up'
                  ? 'bg-success'
                  : servicesState === 'down'
                    ? 'bg-danger'
                    : 'bg-muted animate-pulse'
              }`}
            />
            <span className="text-2xs text-muted">
              {servicesState === 'up'
                ? t('workspace.services_up')
                : servicesState === 'down'
                  ? t('workspace.services_down')
                  : t('workspace.services_checking')}
            </span>
            {health.data && (
              <span className="text-2xs text-subtle mono-num ml-1">
                {health.data.services.qdrantPoints}
              </span>
            )}
          </div>

          <button
            onClick={() => setChatOpen(true)}
            className="btn-ghost !px-3 !py-1.5"
            title={t('workspace.shortcut_chat')}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs">{t('workspace.shortcut_chat')}</span>
            <span className="flex items-center gap-0.5 ml-1">
              <kbd className="kbd">⌘</kbd>
              <kbd className="kbd">K</kbd>
            </span>
          </button>

          <button
            onClick={() => setLedgerOpen(true)}
            className="btn-ghost !px-3 !py-1.5"
            title={t('workspace.toggle_expert')}
          >
            <Calculator className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">{t('workspace.toggle_expert')}</span>
          </button>

          <button
            onClick={() => navigate(`/taxpayer/${new Date().getFullYear()}`)}
            className="btn-ghost !px-3 !py-1.5"
            title="Déclaration fiscale PP"
          >
            <FileSignature className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Déclaration PP</span>
          </button>

          <button onClick={handleLogout} className="btn-ghost !px-2 !py-1.5" aria-label="logout">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Canvas hero */}
      <main className="flex-1 relative min-h-0">
        <LedgerCanvas />

        {/* Floating agents indicator */}
        <div className="absolute top-4 left-4 card-elevated px-3 py-2 flex items-center gap-2 pointer-events-none">
          <Activity className="w-3.5 h-3.5 text-accent" />
          <span className="text-2xs uppercase tracking-wider text-muted">Agents</span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="classifier" />
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="reasoning" />
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="tva" />
          </div>
        </div>

        <div className="absolute top-4 right-4 card-elevated px-3 py-2 flex items-center gap-2 pointer-events-none">
          <Command className="w-3.5 h-3.5 text-muted" />
          <span className="text-2xs text-muted">Cmd+K pour interroger l'IA</span>
        </div>
      </main>

      {/* Timeline fiscal */}
      <FiscalTimeline selected={cursorDate} onSelect={setCursorDate} />

      {/* Overlays */}
      <ChatOverlay />
      <LedgerModal open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}
