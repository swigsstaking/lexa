import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import {
  BookOpen,
  Building2,
  Calculator,
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
  Settings,
  Plus,
} from 'lucide-react';
import { lexa } from '@/api/lexa';
import { useActiveCompany, useCompaniesStore } from '@/stores/companiesStore';
import { User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { PeriodModal } from '@/components/canvas/PeriodModal';
import { usePeriodStore } from '@/stores/periodStore';
import { LedgerModal } from '@/components/ledger/LedgerModal';
import { FiscalTimeline } from '@/components/timeline/FiscalTimeline';
import { NavDropdown } from '@/components/Nav/NavDropdown';
import { MobileMenu } from '@/components/Nav/MobileMenu';
import { StartActionCards } from '@/components/onboarding/StartActionCards';
import { WorkspaceV2 } from '@/components/workspace/WorkspaceV2';

export function Workspace() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const company = useActiveCompany();
  const addCompany = useCompaniesStore((s) => s.addCompany);
  const setActive = useCompaniesStore((s) => s.setActive);
  const clear = useCompaniesStore((s) => s.clear);
  const authLogout = useAuthStore((s) => s.logout);
  const setToken = useAuthStore((s) => s.setToken);
  const activeTenantId = useAuthStore((s) => s.activeTenantId);
  const token = useAuthStore((s) => s.token);

  const [ledgerOpen, setLedgerOpen] = useState(false);
  const [cursorDate, setCursorDate] = useState<Date>(new Date());
  const [switchingTenant, setSwitchingTenant] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const clientMenuRef = useRef<HTMLDivElement>(null);

  // Tous les comptes du user (owner + fiduciary + viewer) — pour le switcher dropdown
  // enabled: !!token évite un 401 transitoire si Zustand n'a pas encore hydraté
  const { data: accountMemberships } = useQuery({
    queryKey: ['user-memberships'],
    queryFn: lexa.listMemberships,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!token,
  });

  // Clients fiduciaires uniquement (role='fiduciary') — pour la section Portefeuille fiduciaire
  const { data: fiduClients } = useQuery({
    queryKey: ['fiduciary-clients'],
    queryFn: lexa.listFiduciaryClients,
    staleTime: 5 * 60 * 1000,
    retry: 2,
    enabled: !!token,
  });

  // Un user est fiduciaire seulement s'il a au moins un client avec role='fiduciary'
  const hasFiduClients = (fiduClients?.length ?? 0) > 0;
  // Le switcher de comptes est visible dès qu'il y a plus d'un compte (owner ou fiduciary)
  const hasMultipleAccounts = (accountMemberships?.length ?? 0) > 1;

  const handleSwitchTenant = async (tenantId: string) => {
    if (tenantId === activeTenantId || switchingTenant) return;
    setSwitchingTenant(true);
    try {
      const { token: newToken, activeTenantId: newTenantId } = await lexa.switchTenant(tenantId);
      // 1. Mettre à jour le JWT et l'activeTenantId dans authStore
      setToken(newToken, newTenantId);
      // 2. Hydrater le companiesStore avec la company du nouveau tenant
      try {
        const me = await lexa.me();
        if (me.company) {
          addCompany(me.company);
          setActive(me.company.tenantId);
        }
      } catch {
        // Si lexa.me() échoue, au moins pointer l'activeCompanyId vers le bon tenant
        setActive(newTenantId);
      }
      // 3. Invalider toutes les queries pour re-fetch avec le nouveau tenant
      await queryClient.invalidateQueries();
      // 4. Fermer le dropdown (appelé par l'item onClick, mais sécurité ici aussi)
      setClientMenuOpen(false);
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

  // Hydrater le companiesStore au mount et à chaque changement de tenant.
  // On utilise activeTenantId comme dépendance pour re-fetch après un switch-tenant.
  // On ne bail plus sur `company` car le badge doit se mettre à jour après switch.
  useEffect(() => {
    if (!token || !activeTenantId) return;
    lexa.me().then((me) => {
      if (me?.company) {
        addCompany(me.company);
        setActive(me.company.tenantId);
      }
    }).catch(() => { /* silent */ });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, activeTenantId]);

  // Fermer le menu company/switcher si click dehors
  useEffect(() => {
    if (!clientMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (clientMenuRef.current && !clientMenuRef.current.contains(e.target as Node)) {
        setClientMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
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
      label: 'Conseiller fiscal',
      onClick: () => navigate(`/conseiller/${year}`),
      icon: Lightbulb,
      title: 'Conseiller fiscal — optimisation proactive',
    },
  ];

  // Items pour le switcher de comptes — utilise TOUS les memberships (owner + fiduciary)
  const accountItems = hasMultipleAccounts && accountMemberships
    ? accountMemberships.map((m) => ({
        label: m.tenantName ?? m.tenantId.slice(0, 8),
        onClick: () => { handleSwitchTenant(m.tenantId); setClientMenuOpen(false); },
        icon: Users,
        active: m.tenantId === activeTenantId,
        title: `Basculer vers ${m.tenantName ?? m.tenantId}`,
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
      {/* Top bar — always dark chrome regardless of theme */}
      <header className="h-12 flex items-center justify-between px-4 border-b flex-shrink-0" style={{ background: 'var(--chrome-bg)', borderColor: 'var(--chrome-line)', color: 'var(--chrome-ink-1)' }}>
        {/* ── Gauche : logo + société ── */}
        <div className="flex items-center gap-4 min-w-0">
          {/* Logo — navigue toujours vers / */}
          <button
            type="button"
            onClick={() => navigate('/')}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity min-h-[44px]"
            title={t('app.name')}
          >
            <div className="w-6 h-6 rounded-md bg-accent grid place-items-center font-semibold text-xs text-accent-fg">
              L
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--chrome-ink-1)' }}>{t('app.name')}</span>
          </button>

          <span className="w-px h-5" style={{ background: 'var(--chrome-line)' }} />

          {/* Badge company — toujours cliquable : switch compte (si >1) + ajouter un compte */}
          <div className="relative min-w-0" ref={clientMenuRef}>
            <button
              type="button"
              onClick={() => setClientMenuOpen((o) => !o)}
              className="flex items-center gap-2 min-w-0 transition-colors rounded-md px-2 py-1 min-h-[44px] hover:opacity-80"
              title={hasMultipleAccounts ? 'Changer de compte' : 'Gérer le compte'}
            >
              {(() => {
                // Icône différente selon type d'entité : PM (Sàrl/SA/Coopérative) = Building2, PP (RI/assoc/fondation/autre) = User
                const isPm = company?.legalForm === 'sarl' || company?.legalForm === 'sa' || company?.legalForm === 'cooperative';
                const Icon = isPm ? Building2 : User;
                return <Icon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--chrome-ink-2)' }} />;
              })()}
              <span className="text-sm truncate" style={{ color: 'var(--chrome-ink-1)' }}>{company?.name ?? t('common.empty')}</span>
              {company?.canton && <span className="chip" style={{ background: 'var(--chrome-bg-2)', borderColor: 'var(--chrome-line)', color: 'var(--chrome-ink-2)' }}>{company.canton}</span>}
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-150 ${clientMenuOpen ? 'rotate-180' : ''}`}
                style={{ color: 'var(--chrome-ink-2)' }}
              />
            </button>

            {clientMenuOpen && (
              <div
                role="menu"
                className="absolute left-0 top-full mt-1 min-w-[240px] rounded-lg z-50 py-1 shadow-lg"
              style={{ background: 'var(--chrome-bg-2)', borderColor: 'var(--chrome-line)', border: '1px solid var(--chrome-line)' }}
              >
                {hasMultipleAccounts && accountItems.length > 0 && (
                  <>
                    <div className="px-3 pt-2 pb-1 text-2xs uppercase tracking-wider" style={{ color: 'var(--chrome-ink-3)' }}>
                      Mes comptes
                    </div>
                    {accountItems.map((item, i) => {
                      const ItemIcon = item.icon;
                      return (
                        <button
                          key={i}
                          role="menuitem"
                          title={item.title}
                          onClick={item.onClick}
                          className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors hover:opacity-80 ${
                            item.active ? 'font-medium' : ''
                          }`}
                          style={{ color: item.active ? 'rgb(var(--accent))' : 'var(--chrome-ink-1)' }}
                        >
                          {ItemIcon && <ItemIcon className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--chrome-ink-3)' } as React.CSSProperties} />}
                          <span className="truncate">{item.label}</span>
                        </button>
                      );
                    })}
                    <div className="border-t border-border my-1" />
                  </>
                )}
                {hasFiduClients && (
                  <>
                    <button
                      type="button"
                      onClick={() => { setClientMenuOpen(false); navigate('/fiduciaire'); }}
                      className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors hover:opacity-80"
                      style={{ color: 'var(--chrome-ink-2)' }}
                    >
                      <Briefcase className="w-3.5 h-3.5 flex-shrink-0" />
                      <span>Portefeuille fiduciaire</span>
                    </button>
                    <div className="border-t border-border my-1" />
                  </>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setClientMenuOpen(false);
                    navigate('/onboarding/add-account');
                  }}
                  className="w-full text-left px-3 py-2 text-sm flex items-center gap-2.5 transition-colors hover:opacity-80"
                  style={{ color: 'var(--chrome-ink-2)' }}
                >
                  <Plus className="w-3.5 h-3.5 flex-shrink-0" />
                  <span>Ajouter un compte</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Droite : nav desktop + actions ── */}
        <div className="flex items-center gap-2">
          {/* Indicateur services */}
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md" style={{ background: 'var(--chrome-bg-2)', border: '1px solid var(--chrome-line)' }}>
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                servicesState === 'up'
                  ? 'bg-success'
                  : servicesState === 'down'
                    ? 'bg-danger'
                    : 'bg-muted animate-pulse'
              }`}
            />
            <span className="text-2xs hidden sm:inline" style={{ color: 'var(--chrome-ink-2)' }}>
              {servicesState === 'up'
                ? t('workspace.services_up')
                : servicesState === 'down'
                  ? t('workspace.services_down')
                  : t('workspace.services_checking')}
            </span>
            {health.data && (
              <span className="text-2xs mono-num ml-1 hidden sm:inline" style={{ color: 'var(--chrome-ink-3)' }}>
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
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--chrome-ink-2)' }}
            >
              <FileText className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Documents</span>
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
              className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80"
              style={{ color: 'var(--chrome-ink-2)' }}
            >
              <Calculator className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Grand livre</span>
            </button>
          </nav>

          {/* Bouton Paramètres (roue crantée) */}
          <button
            type="button"
            onClick={() => navigate('/settings')}
            title="Paramètres"
            aria-label="Paramètres"
            className="hidden md:flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors hover:opacity-80"
            style={{ color: 'var(--chrome-ink-2)' }}
          >
            <Settings className="w-4 h-4" />
          </button>

          {/* Bouton logout — icône tout à droite */}
          <button
            type="button"
            onClick={handleLogout}
            title="Déconnexion"
            aria-label="Déconnexion"
            className="hidden md:flex items-center justify-center rounded-lg px-2 py-1.5 transition-colors hover:opacity-70"
            style={{ color: 'var(--chrome-ink-2)' }}
          >
            <LogOut className="w-4 h-4" />
          </button>

          {/* ── Mobile burger (<md) ── */}
          <MobileMenu groups={mobileGroups} quickActions={mobileQuickActions} />
        </div>
      </header>

      {/* Canvas hero */}
      <main className="flex-1 relative min-h-0 overflow-hidden">
        {/* WorkspaceV2 — visible sur tous les breakpoints (mobile-friendly depuis V1.1) */}
        <div className="absolute inset-0">
          <WorkspaceV2 />
        </div>

        {/* Empty state / Processing state — visible sur mobile ET desktop */}
        {!hasEntries && !health.isLoading && (
          <div
            className="absolute inset-0 grid place-items-center pointer-events-none z-20"
            style={{ background: 'rgb(var(--bg))' }}
          >
            <div
              className="pointer-events-auto text-center mx-4"
              style={{
                background: 'var(--v2-surface)',
                border: '1px solid var(--line-1)',
                borderRadius: 16,
                padding: '40px 48px',
                maxWidth: 960,
                width: 'calc(100% - 32px)',
                boxShadow: '0 4px 24px rgba(26,24,20,0.08)',
              }}
            >
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
                /* État "vide" normal : aucune transaction importée — texte adapté PP vs PM */
                <>
                  <Sparkles className="w-8 h-8 text-accent mx-auto mb-4" />
                  <h2 className="text-xl font-semibold text-ink mb-2">
                    {t('workspace.empty.pp_title')}
                  </h2>
                  <p className="text-sm text-muted mb-6">
                    {t('workspace.empty.pp_subtitle')}
                  </p>
                  <StartActionCards />
                </>
              )}
            </div>
          </div>
        )}

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
      <LedgerModal open={ledgerOpen} onClose={() => setLedgerOpen(false)} />
      <WorkspacePeriodModal />
    </div>
  );
}

function WorkspacePeriodModal() {
  const period = usePeriodStore((s) => s.period);
  const modalOpen = usePeriodStore((s) => s.modalOpen);
  const closeModal = usePeriodStore((s) => s.closeModal);
  const setPeriod = usePeriodStore((s) => s.setPeriod);
  return (
    <PeriodModal
      open={modalOpen}
      onClose={closeModal}
      year={new Date().getFullYear()}
      current={period}
      onSelect={setPeriod}
    />
  );
}
