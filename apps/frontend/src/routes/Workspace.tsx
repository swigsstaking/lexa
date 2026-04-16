import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  BookOpen,
  Building2,
  Calculator,
  Command,
  FileSignature,
  FileText,
  LogOut,
  Sparkles,
  Briefcase,
  Shield,
  Lightbulb,
  Users,
  ChevronDown,
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
  const queryClient = useQueryClient();
  const company = useActiveCompany();
  const clear = useCompaniesStore((s) => s.clear);
  const authLogout = useAuthStore((s) => s.logout);
  const setToken = useAuthStore((s) => s.setToken);
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const setChatOpen = useChatStore((s) => s.setOpen);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(new Date());
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const switcherRef = useRef<HTMLDivElement>(null);

  // S32 : Charger les clients fiduciaires (si membership multiple)
  const { data: fiduClients } = useQuery({
    queryKey: ['fiduciary-clients'],
    queryFn: lexa.listFiduciaryClients,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  const hasMultipleClients = fiduClients && fiduClients.length > 1;

  // Fermer le dropdown si click dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (switcherRef.current && !switcherRef.current.contains(e.target as Node)) {
        setSwitcherOpen(false);
      }
    };
    if (switcherOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [switcherOpen]);

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === activeTenantId || switchingTenant) return;
    setSwitchingTenant(true);
    setSwitcherOpen(false);
    try {
      const { token, activeTenantId: newTenantId } = await lexa.switchTenant(tenantId);
      setToken(token, newTenantId);
      // Invalider toutes les queries pour re-fetch avec le nouveau tenant
      await queryClient.invalidateQueries();
      // Reload page pour vider tout le state React qui dépend du tenant
      window.location.reload();
    } catch (err) {
      console.error('[Workspace] switch-tenant failed:', err);
    } finally {
      setSwitchingTenant(false);
    }
  };

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
          {/* S32 : Switcher tenant fiduciaire — visible seulement si multi-clients */}
          {hasMultipleClients && (
            <div className="relative" ref={switcherRef}>
              <button
                onClick={() => setSwitcherOpen((o) => !o)}
                disabled={switchingTenant}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-elevated border border-accent/40 text-accent hover:bg-accent/10 transition-colors text-xs"
                title="Changer de client"
              >
                <Users className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">
                  {fiduClients?.find((c) => c.tenantId === activeTenantId)?.tenantName ?? 'Client'}
                </span>
                <ChevronDown className="w-3 h-3 opacity-60" />
              </button>
              {switcherOpen && (
                <div className="absolute right-0 top-full mt-1 w-52 rounded-lg border border-border bg-surface shadow-lg z-50 py-1">
                  <div className="px-3 py-1.5 text-2xs text-muted uppercase tracking-wide border-b border-border mb-1">
                    Clients fiduciaires
                  </div>
                  {fiduClients?.map((client) => (
                    <button
                      key={client.tenantId}
                      onClick={() => handleSwitchTenant(client.tenantId)}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-elevated flex items-center justify-between ${
                        client.tenantId === activeTenantId ? 'text-accent font-medium' : 'text-ink'
                      }`}
                    >
                      <span className="truncate">{client.tenantName ?? client.tenantId.slice(0, 8)}</span>
                      <span className="text-2xs text-muted ml-2 flex-shrink-0">{client.role}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
            onClick={() => {
              const canton = company?.canton ?? 'VS';
              const year = new Date().getFullYear();
              const taxpayerPath =
                canton === 'GE'
                  ? `/taxpayer/ge/${year}`
                  : canton === 'VD'
                    ? `/taxpayer/vd/${year}`
                    : canton === 'FR'
                      ? `/taxpayer/fr/${year}`
                      : `/taxpayer/${year}`;
              navigate(taxpayerPath);
            }}
            className="btn-ghost !px-3 !py-1.5"
            title="Déclaration fiscale PP"
          >
            <FileSignature className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Déclaration PP</span>
          </button>

          <button
            onClick={() => {
              const canton = company?.canton ?? 'VS';
              const year = new Date().getFullYear();
              const pmPath = `/pm/${canton.toLowerCase()}/${year}`;
              navigate(pmPath);
            }}
            className="btn-ghost !px-3 !py-1.5"
            title="Déclaration fiscale PM (Sàrl/SA)"
          >
            <Briefcase className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Déclaration PM</span>
          </button>

          <button
            onClick={() => navigate(`/close/${new Date().getFullYear()}`)}
            className="btn-ghost !px-3 !py-1.5"
            title="Clôture continue CO 957-963"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Clôture</span>
          </button>

          <button
            onClick={() => navigate('/documents')}
            className="btn-ghost !px-3 !py-1.5"
            title="Documents OCR"
          >
            <FileText className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Documents</span>
          </button>

          <button
            onClick={() => navigate(`/audit/${new Date().getFullYear()}`)}
            className="btn-ghost !px-3 !py-1.5"
            title="Audit intégrité IA — CO 958f"
          >
            <Shield className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Audit</span>
          </button>

          <button
            onClick={() => navigate(`/conseiller/${new Date().getFullYear()}`)}
            className="btn-ghost !px-3 !py-1.5"
            title="Conseiller fiscal — optimisation proactive"
          >
            <Lightbulb className="w-3.5 h-3.5" />
            <span className="text-xs hidden md:inline">Conseiller</span>
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
