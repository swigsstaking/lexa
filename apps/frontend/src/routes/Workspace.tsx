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
  Loader2,
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
import { NavDropdown } from '@/components/Nav/NavDropdown';
import { MobileMenu } from '@/components/Nav/MobileMenu';
import { StartActionCards } from '@/components/onboarding/StartActionCards';
import { MobileLedgerList } from '@/components/workspace/MobileLedgerList';

export function Workspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const company = useActiveCompany();
  const clear = useCompaniesStore((s) => s.clear);
  const authLogout = useAuthStore((s) => s.logout);
  const setToken = useAuthStore((s) => s.setToken);
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const token = useAuthStore((s) => s.token);
  const setChatOpen = useChatStore((s) => s.setOpen);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(new Date());
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const clientMenuRef = useRef<HTMLDivElement>(null);

  // S32 : Charger les clients fiduciaires (si membership multiple)
  // enabled: !!token évite un 401 transitoire si Zustand n'a pas encore hydraté
  const { data: fiduClients } = useQuery({
    queryKey: ['fiduciary-clients'],
    queryFn: lexa.listFiduciaryClients,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!token,
  });

  const hasMultipleClients = fiduClients && fiduClients.length > 1;
  const activeTenantName = hasMultipleClients
    ? (fiduClients?.find((c) => c.tenantId === activeTenantId)?.tenantName ?? null)
    : null;

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === activeTenantId || switchingTenant) return;
    setSwitchingTenant(true);
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

  const { data: ledgerData, isLoading: ledgerLoading } = useQuery({
    queryKey: ['ledger', 1],
    queryFn: () => lexa.ledgerList(1),
    staleTime: 10 * 1000,
  });
  const hasEntries = ledgerLoading || (ledgerData?.entries?.length ?? 0) > 0;

  // Bloc B — Processing status polling (stops when pending === 0)
  const { data: processingStatus } = useQuery({
    queryKey: ['ledger-processing-status'],
    queryFn: lexa.ledgerProcessingStatus,
    refetchInterval: (query) => {
      const data = query.state.data;
      return data && data.pending === 0 ? false : 3000;
    },
    staleTime: 2000,
  });
  const isProcessing = (processingStatus?.pending ?? 0) > 0;
  const hasIngestedButNoEntries = !hasEntries && !ledgerLoading && (processingStatus?.ingested ?? 0) > 0;

  // BUG3 fix: quand le processing passe à pending=0, invalider le ledger
  // pour forcer un refetch et afficher les entries nouvellement classifiées.
  const prevPendingRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    const pending = processingStatus?.pending;
    if (prevPendingRef.current !== undefined && prevPendingRef.current > 0 && pending === 0) {
      // Transition pending>0 → 0 : les classifications sont terminées, refetch le ledger
      queryClient.invalidateQueries({ queryKey: ['ledger'] });
    }
    prevPendingRef.current = pending;
  }, [processingStatus?.pending, queryClient]);

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

  // Fermer le menu client si click dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (clientMenuRef.current && !clientMenuRef.current.contains(e.target as Node)) {
        setClientMenuOpen(false);
      }
    };
    if (clientMenuOpen) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [clientMenuOpen]);

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

  // ── Logique canton-aware (PP + PM) ──────────────────────────────────────
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

  const pmPath = `/pm/${canton.toLowerCase()}/${year}`;

  // ── Items des 4 dropdowns ───────────────────────────────────────────────

  const declarationsItems = [
    {
      label: `Déclaration PP${canton ? ` (${canton})` : ''}`,
      onClick: () => navigate(taxpayerPath),
      icon: FileSignature,
      title: 'Déclaration fiscale personne physique',
    },
    {
      label: `Déclaration PM${canton ? ` (${canton})` : ''}`,
      onClick: () => navigate(pmPath),
      icon: Briefcase,
      title: 'Déclaration fiscale PM (Sàrl/SA)',
    },
  ];

  const comptaItems = [
    {
      label: 'Clôture continue',
      onClick: () => navigate(`/close/${year}`),
      icon: BookOpen,
      title: 'Clôture continue CO 957-963',
    },
    {
      label: 'Audit',
      onClick: () => navigate(`/audit/${year}`),
      icon: Shield,
      title: 'Audit intégrité IA — CO 958f',
    },
  ];

  const iaItems = [
    {
      label: 'Chat IA',
      onClick: () => setChatOpen(true),
      icon: Sparkles,
      title: 'Ouvrir le chat IA (⌘K)',
    },
    {
      label: 'Conseiller fiscal',
      onClick: () => navigate(`/conseiller/${year}`),
      icon: Lightbulb,
      title: 'Conseiller fiscal — optimisation proactive',
    },
  ];

  // Items fiduciaire pour le menu switcher client (multi-clients)
  const fiduItems = hasMultipleClients && fiduClients
    ? fiduClients.map((client) => ({
        label: client.tenantName ?? client.tenantId.slice(0, 8),
        onClick: () => { handleSwitchTenant(client.tenantId); setClientMenuOpen(false); },
        icon: Users,
        active: client.tenantId === activeTenantId,
        title: `Passer au client ${client.tenantName ?? client.tenantId}`,
      }))
    : [];

  // ── Groupes pour mobile ─────────────────────────────────────────────────
  const mobileGroups = [
    { label: 'Déclarations', items: declarationsItems },
    { label: 'Comptabilité', items: comptaItems },
    { label: 'IA', items: iaItems },
  ];

  const mobileQuickActions = [
    {
      label: 'Grand livre',
      onClick: () => setLedgerOpen(true),
      icon: Calculator,
      title: 'Grand livre expert (⌘⇧L)',
    },
    {
      label: 'Documents',
      onClick: () => navigate('/documents'),
      icon: FileText,
      title: 'Documents OCR',
    },
    {
      label: 'Déconnexion',
      onClick: handleLogout,
      icon: LogOut,
      title: 'Se déconnecter',
    },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface flex-shrink-0">
        {/* ── Gauche : logo + société ── */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Logo — navigue toujours vers / */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
            title={t('app.name')}
          >
            <div className="w-6 h-6 rounded-md bg-accent text-accent-fg grid place-items-center font-semibold text-xs">
              L
            </div>
            <span className="text-sm font-semibold">{t('app.name')}</span>
          </button>

          <span className="w-px h-5 bg-border" />

          <div className="flex items-center gap-2 min-w-0">
            <Building2 className="w-3.5 h-3.5 text-muted flex-shrink-0" />
            <span className="text-sm text-ink truncate">{company?.name ?? t('common.empty')}</span>
            {company?.uid && (
              <span className="text-2xs text-subtle mono-num">{company.uid}</span>
            )}
            {company?.canton && <span className="chip">{company.canton}</span>}

            {/* Badge "Client : Nom" — cliquable si multi-clients pour switcher */}
            {hasMultipleClients && activeTenantName && (
              <div className="relative hidden sm:block" ref={clientMenuRef}>
                <button
                  type="button"
                  onClick={() => setClientMenuOpen((o) => !o)}
                  className="flex items-center gap-1 text-xs text-stone-400 ml-1 hover:text-stone-200 transition-colors cursor-pointer"
                  title="Changer de client"
                >
                  <span>
                    Client :{' '}
                    <span className="font-medium text-stone-100">{activeTenantName}</span>
                  </span>
                  <ChevronDown
                    className={`w-3 h-3 transition-transform duration-150 ${clientMenuOpen ? 'rotate-180' : ''}`}
                  />
                </button>

                {/* Dropdown switcher */}
                {clientMenuOpen && (
                  <div
                    role="menu"
                    className="absolute left-0 top-full mt-1 min-w-[200px] rounded-lg border border-border bg-surface shadow-lg z-50 py-1"
                  >
                    {fiduItems.map((item, i) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={i}
                          role="menuitem"
                          title={item.title}
                          onClick={item.onClick}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 hover:bg-elevated transition-colors ${
                            item.active ? 'text-accent font-medium' : 'text-ink'
                          }`}
                        >
                          {ItemIcon && <ItemIcon className="w-3.5 h-3.5 flex-shrink-0 text-muted" />}
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Droite : nav desktop + actions ── */}
        <div className="flex items-center gap-2">
          {/* Indicateur services */}
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
            <span className="text-2xs text-muted hidden sm:inline">
              {servicesState === 'up'
                ? t('workspace.services_up')
                : servicesState === 'down'
                  ? t('workspace.services_down')
                  : t('workspace.services_checking')}
            </span>
            {health.data && (
              <span className="text-2xs text-subtle mono-num ml-1 hidden sm:inline">
                {health.data.services.qdrantPoints}
              </span>
            )}
          </div>

          {/* ── Nav desktop (md+) : dropdowns + boutons directs ── */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Navigation principale">
            <NavDropdown
              label="Déclarations"
              icon={FileSignature}
              items={declarationsItems}
            />
            <NavDropdown
              label="Comptabilité"
              icon={BookOpen}
              items={comptaItems}
            />
            {/* Documents — bouton direct (Feature 2) */}
            <button
              type="button"
              onClick={() => navigate('/documents')}
              title="Documents OCR"
              className="btn-ghost !px-3 !py-1.5"
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="text-xs hidden md:inline">Documents</span>
            </button>
            <NavDropdown
              label="IA"
              icon={Sparkles}
              items={iaItems}
            />
            {/* Grand livre — bouton direct (pas de dropdown) */}
            <button
              type="button"
              onClick={() => setLedgerOpen(true)}
              title="Grand livre expert (⌘⇧L)"
              className="btn-ghost !px-3 !py-1.5"
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="text-xs hidden md:inline">Grand livre</span>
            </button>
          </nav>

          {/* Bouton logout — icône tout à droite */}
          <button
            type="button"
            onClick={handleLogout}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="hidden md:flex btn-ghost !px-2 !py-1.5 text-muted hover:text-danger transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* ── Mobile burger (<md) ── */}
          <MobileMenu groups={mobileGroups} quickActions={mobileQuickActions} />
        </div>
      </header>

      {/* Canvas hero */}
      <main className="flex-1 relative min-h-0 overflow-hidden">
        {/* Mobile : vraie vue grand livre liste groupée par classe Kafer */}
        {hasEntries && (
          <div className="md:hidden absolute inset-0 flex flex-col overflow-hidden">
            <MobileLedgerList hasEntries={hasEntries} />
          </div>
        )}

        {/* LedgerCanvas — desktop seulement */}
        <div className="hidden md:block absolute inset-0">
          <LedgerCanvas />
        </div>

        {/* Empty state / Processing state — visible sur mobile ET desktop */}
        {!hasEntries && !health.isLoading && (
          <div className="absolute inset-0 grid place-items-center pointer-events-none z-20">
            <div className="card-elevated p-8 max-w-2xl pointer-events-auto text-center mx-4">
              {hasIngestedButNoEntries ? (
                /* Bloc B — état "processing" : transactions importées mais pas encore dans le ledger */
                <>
                  <Loader2 className="w-8 h-8 text-accent mx-auto mb-4 animate-spin" />
                  <h2 className="text-xl font-semibold text-ink mb-2">
                    L'IA classifie vos premières transactions
                  </h2>
                  <p className="text-sm text-muted mb-2">
                    {processingStatus?.classified ?? 0}/{processingStatus?.ingested ?? 0} classifiées · Le grand livre va apparaître progressivement
                  </p>
                  {(processingStatus?.estimatedSecondsRemaining ?? 0) > 0 && (
                    <p className="text-xs text-subtle">
                      ~{Math.ceil((processingStatus?.estimatedSecondsRemaining ?? 0) / 60)} min restantes
                    </p>
                  )}
                </>
              ) : (
                /* État "vide" normal : aucune transaction importée */
                <>
                  <Sparkles className="w-8 h-8 text-accent mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-ink mb-2">{t('workspace.empty.title')}</h2>
                  <p className="text-sm text-muted mb-6">{t('workspace.empty.subtitle')}</p>
                  <StartActionCards />
                </>
              )}
            </div>
          </div>
        )}

        {/* Floating agents indicator — desktop seulement */}
        <div className="hidden md:flex absolute top-3 left-4 card-elevated px-3 py-2 items-center gap-2 pointer-events-none z-10">
          <Activity className="w-3.5 h-3.5 text-accent" />
          <span className="text-2xs uppercase tracking-wider text-muted">Agents</span>
          <div className="flex gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="classifier" />
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="reasoning" />
            <span className="w-1.5 h-1.5 rounded-full bg-success" title="tva" />
          </div>
        </div>

        {/* Hint Cmd+K — desktop seulement, pas sur mobile */}
        <div className="hidden md:flex absolute top-3 right-4 card-elevated px-3 py-2 items-center gap-2 pointer-events-none z-10">
          <Command className="w-3.5 h-3.5 text-muted" />
          <span className="text-2xs text-muted">Cmd+K pour interroger l'IA</span>
        </div>

        {/* Bloc B — Toast sticky "IA classifie…" — visible quand pending > 0 et des entrées existent déjà */}
        {isProcessing && hasEntries && (
          <div className="absolute bottom-20 right-6 card-elevated p-4 max-w-sm z-30">
            <div className="flex items-center gap-3">
              <Loader2 className="w-5 h-5 text-accent animate-spin flex-shrink-0" />
              <div>
                <div className="text-sm font-semibold text-ink">L'IA classifie vos transactions</div>
                <div className="text-xs text-muted mt-1">
                  {processingStatus?.classified}/{processingStatus?.ingested} classifiées
                  {(processingStatus?.estimatedSecondsRemaining ?? 0) > 0 && (
                    <> · ~{Math.ceil((processingStatus?.estimatedSecondsRemaining ?? 0) / 60)} min restantes</>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Timeline fiscal */}
      <FiscalTimeline selected={cursorDate} onSelect={setCursorDate} />

      {/* Overlays */}
      <ChatOverlay />
      <LedgerModal open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
    </div>
  );
}
