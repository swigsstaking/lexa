import { useEffect, useState } from 'react';
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
  Network,
  Sparkles,
  Briefcase,
  Shield,
  Lightbulb,
  Users,
  Settings,
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
  const [switchingTenant, setSwitchingTenant] = useState(false);

  // S32 : Charger les clients fiduciaires (si membership multiple)
  const { data: fiduClients } = useQuery({
    queryKey: ['fiduciary-clients'],
    queryFn: lexa.listFiduciaryClients,
    staleTime: 5 * 60 * 1000,
    retry: false,
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
      label: 'Documents',
      onClick: () => navigate('/documents'),
      icon: FileText,
      title: 'Documents OCR',
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
    {
      label: 'Mode expert',
      onClick: () => setLedgerOpen(true),
      icon: Calculator,
      title: 'Grand livre expert (⌘⇧L)',
    },
  ];

  // Dropdown Paramètres — inclut switcher fiduciaire si multi-clients
  const parametresItems = [
    ...(hasMultipleClients && fiduClients
      ? fiduClients.map((client) => ({
          label: client.tenantName ?? client.tenantId.slice(0, 8),
          onClick: () => handleSwitchTenant(client.tenantId),
          icon: Users,
          active: client.tenantId === activeTenantId,
          title: `Passer au client ${client.tenantName ?? client.tenantId}`,
        }))
      : []),
    {
      label: 'Déconnexion',
      onClick: handleLogout,
      icon: LogOut,
      title: 'Se déconnecter',
    },
  ];

  // ── Groupes pour mobile ─────────────────────────────────────────────────
  const mobileGroups = [
    { label: 'Déclarations', items: declarationsItems },
    { label: 'Comptabilité', items: comptaItems },
    { label: 'IA', items: iaItems },
    { label: 'Paramètres', items: parametresItems },
  ];

  return (
    <div className="h-screen w-screen flex flex-col bg-bg text-ink">
      {/* Top bar */}
      <header className="h-12 flex items-center justify-between px-4 border-b border-border bg-surface flex-shrink-0">
        {/* ── Gauche : logo + société ── */}
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
            {hasMultipleClients && activeTenantName && (
              <span className="text-xs text-stone-400 ml-1 hidden sm:inline">
                Client :{' '}
                <span className="font-medium text-stone-100">{activeTenantName}</span>
              </span>
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

          {/* ── Bouton Canvas spatial ── */}
          <button
            onClick={() => navigate('/canvas')}
            title="Vue canvas spatial — agents &amp; entités IA"
            className="hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-stone-700 bg-stone-900 text-stone-400 hover:text-stone-200 hover:border-stone-500 hover:bg-stone-800 transition-colors text-xs font-mono"
          >
            <Network className="w-3.5 h-3.5" />
            <span className="hidden lg:inline">Canvas IA</span>
          </button>

          {/* ── Nav desktop (md+) : 4 dropdowns ── */}
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
            <NavDropdown
              label="IA"
              icon={Sparkles}
              items={iaItems}
            />
            <NavDropdown
              label="Paramètres"
              icon={Settings}
              items={parametresItems}
              badge={hasMultipleClients ? fiduClients?.length : undefined}
            />
          </nav>

          {/* ── Mobile burger (<md) ── */}
          <MobileMenu groups={mobileGroups} />
        </div>
      </header>

      {/* Canvas hero */}
      <main className="flex-1 relative min-h-0 overflow-hidden">
        {/* Dashboard mobile — accès rapide aux fonctions clés */}
        <div className="md:hidden h-full overflow-y-auto">
          <div className="p-4 pb-6 flex flex-col gap-4">
            {/* En-tête */}
            <div className="pt-2">
              <h1 className="text-base font-semibold text-ink">Tableau de bord</h1>
              <p className="text-xs text-muted mt-0.5">Exercice {year} · {company?.name ?? '—'}</p>
            </div>

            {/* Déclarations */}
            <section>
              <h2 className="text-2xs uppercase tracking-wider text-subtle mb-2">Déclarations</h2>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => navigate(taxpayerPath)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface border border-border text-left hover:border-border-strong hover:bg-elevated transition-colors"
                >
                  <FileSignature className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Déclaration PP {canton && `(${canton})`}</p>
                    <p className="text-2xs text-muted">Personne physique · {year}</p>
                  </div>
                  <span className="ml-auto text-muted text-sm">→</span>
                </button>
                <button
                  onClick={() => navigate(pmPath)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface border border-border text-left hover:border-border-strong hover:bg-elevated transition-colors"
                >
                  <Briefcase className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Déclaration PM {canton && `(${canton})`}</p>
                    <p className="text-2xs text-muted">Personne morale · {year}</p>
                  </div>
                  <span className="ml-auto text-muted text-sm">→</span>
                </button>
              </div>
            </section>

            {/* Comptabilité */}
            <section>
              <h2 className="text-2xs uppercase tracking-wider text-subtle mb-2">Comptabilité</h2>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => navigate('/documents')}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface border border-border text-left hover:border-border-strong hover:bg-elevated transition-colors"
                >
                  <FileText className="w-4 h-4 text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Documents OCR</p>
                    <p className="text-2xs text-muted">Certificats de salaire, factures</p>
                  </div>
                  <span className="ml-auto text-muted text-sm">→</span>
                </button>
                <button
                  onClick={() => navigate(`/close/${year}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface border border-border text-left hover:border-border-strong hover:bg-elevated transition-colors"
                >
                  <BookOpen className="w-4 h-4 text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Clôture continue</p>
                    <p className="text-2xs text-muted">CO art. 957–963</p>
                  </div>
                  <span className="ml-auto text-muted text-sm">→</span>
                </button>
              </div>
            </section>

            {/* IA */}
            <section>
              <h2 className="text-2xs uppercase tracking-wider text-subtle mb-2">Intelligence artificielle</h2>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => setChatOpen(true)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-accent/10 border border-accent/30 text-left hover:bg-accent/15 transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-accent flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Chat IA fiscal</p>
                    <p className="text-2xs text-muted">Interrogez Lexa en langage naturel</p>
                  </div>
                  <span className="ml-auto text-accent text-sm">→</span>
                </button>
                <button
                  onClick={() => navigate(`/conseiller/${year}`)}
                  className="flex items-center gap-3 w-full px-4 py-3 rounded-xl bg-surface border border-border text-left hover:border-border-strong hover:bg-elevated transition-colors"
                >
                  <Lightbulb className="w-4 h-4 text-muted flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-ink">Conseiller fiscal</p>
                    <p className="text-2xs text-muted">Optimisation proactive</p>
                  </div>
                  <span className="ml-auto text-muted text-sm">→</span>
                </button>
              </div>
            </section>
          </div>
        </div>

        {/* Layout desktop — sidebar gauche + canvas */}
        <div className="hidden md:flex h-full">
          {/* Sidebar actions — colonne gauche fixe */}
          <aside className="w-56 flex-shrink-0 flex flex-col gap-1 p-3 border-r border-border bg-surface overflow-y-auto">
            {/* Statut agents */}
            <div className="flex items-center gap-2 px-2 py-2 mb-1">
              <Activity className="w-3.5 h-3.5 text-accent" />
              <span className="text-2xs uppercase tracking-wider text-muted">Agents actifs</span>
              <div className="flex gap-1 ml-auto">
                <span className="w-1.5 h-1.5 rounded-full bg-success" title="classifier" />
                <span className="w-1.5 h-1.5 rounded-full bg-success" title="reasoning" />
                <span className="w-1.5 h-1.5 rounded-full bg-success" title="tva" />
              </div>
            </div>

            <div className="h-px bg-border mb-1" />

            {/* Section Déclarations */}
            <p className="text-2xs uppercase tracking-wider text-subtle px-2 py-1">Déclarations</p>
            <button
              onClick={() => navigate(taxpayerPath)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors group"
            >
              <FileSignature className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span className="truncate">PP {canton && `· ${canton}`}</span>
            </button>
            <button
              onClick={() => navigate(pmPath)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors group"
            >
              <Briefcase className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <span className="truncate">PM {canton && `· ${canton}`}</span>
            </button>

            <div className="h-px bg-border my-1" />

            {/* Section Comptabilité */}
            <p className="text-2xs uppercase tracking-wider text-subtle px-2 py-1">Comptabilité</p>
            <button
              onClick={() => navigate('/documents')}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors"
            >
              <FileText className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <span className="truncate">Documents OCR</span>
            </button>
            <button
              onClick={() => navigate(`/close/${year}`)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors"
            >
              <BookOpen className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <span className="truncate">Clôture</span>
            </button>
            <button
              onClick={() => navigate(`/audit/${year}`)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors"
            >
              <Shield className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <span className="truncate">Audit</span>
            </button>

            <div className="h-px bg-border my-1" />

            {/* Section IA */}
            <p className="text-2xs uppercase tracking-wider text-subtle px-2 py-1">IA</p>
            <button
              onClick={() => setChatOpen(true)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-accent hover:bg-accent/10 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 flex-shrink-0" />
              <span className="truncate">Chat IA · ⌘K</span>
            </button>
            <button
              onClick={() => navigate(`/conseiller/${year}`)}
              className="flex items-center gap-2.5 w-full px-2.5 py-2 rounded-lg text-left text-sm text-ink hover:bg-elevated transition-colors"
            >
              <Lightbulb className="w-3.5 h-3.5 text-muted flex-shrink-0" />
              <span className="truncate">Conseiller</span>
            </button>
          </aside>

          {/* Canvas zone — prend le reste */}
          <div className="flex-1 relative min-w-0">
            <LedgerCanvas />
            {/* Hint Cmd+K */}
            <div className="absolute top-3 right-4 card-elevated px-3 py-2 flex items-center gap-2 pointer-events-none z-10">
              <Command className="w-3.5 h-3.5 text-muted" />
              <span className="text-2xs text-muted">Cmd+K pour interroger l'IA</span>
            </div>
          </div>
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
