import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Building2, LayoutDashboard, MessageSquare, BookOpen, LogOut } from 'lucide-react';
import { useCompanyStore } from '@/stores/companyStore';

const navItems = [
  { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/ledger', label: 'Grand livre', icon: BookOpen },
  { to: '/chat', label: 'Agents IA', icon: MessageSquare },
];

export function AppShell() {
  const company = useCompanyStore((s) => s.company);
  const clear = useCompanyStore((s) => s.clear);
  const navigate = useNavigate();

  const handleLogout = () => {
    clear();
    navigate('/');
  };

  return (
    <div className="min-h-screen flex">
      <aside className="w-64 bg-lexa-surface border-r border-lexa-border flex flex-col">
        <div className="p-6 border-b border-lexa-border">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-lexa-primary text-white grid place-items-center font-display font-bold">
              L
            </div>
            <div>
              <div className="font-display text-lg leading-none">Lexa</div>
              <div className="text-xs text-lexa-muted mt-1">Compta IA suisse</div>
            </div>
          </div>
        </div>

        <div className="p-4 border-b border-lexa-border">
          <div className="flex items-start gap-2">
            <Building2 className="w-4 h-4 text-lexa-muted mt-0.5 flex-shrink-0" />
            <div className="min-w-0">
              <div className="text-sm font-medium truncate">{company?.name ?? '—'}</div>
              <div className="text-xs text-lexa-muted truncate">
                {company?.uid ?? company?.legalFormLabel ?? ''}
              </div>
              {company?.canton && (
                <span className="chip mt-2">canton {company.canton}</span>
              )}
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  isActive
                    ? 'bg-lexa-primary/10 text-lexa-primary font-medium'
                    : 'text-lexa-ink hover:bg-lexa-bg'
                }`
              }
            >
              <Icon className="w-4 h-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="p-3 border-t border-lexa-border">
          <button onClick={handleLogout} className="btn-ghost w-full justify-start">
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
}
