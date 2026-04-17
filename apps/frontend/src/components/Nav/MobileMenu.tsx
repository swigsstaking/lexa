import { useState } from 'react';
import { Menu, X, ChevronDown } from 'lucide-react';
import type { NavItem } from './NavDropdown';

export interface MobileGroup {
  label: string;
  items: NavItem[];
}

interface MobileMenuProps {
  groups: MobileGroup[];
  /** Actions rapides toujours visibles (logout etc.) */
  quickActions?: NavItem[];
}

export function MobileMenu({ groups, quickActions }: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  const handleItem = (onClick: () => void) => {
    onClick();
    setOpen(false);
    setExpandedGroup(null);
  };

  return (
    <div className="md:hidden relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label={open ? 'Fermer le menu' : 'Ouvrir le menu'}
        aria-expanded={open}
        className="btn-ghost !px-2 !py-1.5 min-h-[44px] min-w-[44px]"
      >
        {open ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
      </button>

      {open && (
        <div className="fixed inset-x-0 top-12 bg-surface border-b border-border shadow-lg z-50 overflow-y-auto max-h-[calc(100vh-48px)]">
          {groups.map((group) => {
            const isExpanded = expandedGroup === group.label;
            return (
              <div key={group.label} className="border-b border-border last:border-0">
                <button
                  onClick={() => setExpandedGroup(isExpanded ? null : group.label)}
                  className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-ink hover:bg-elevated transition-colors min-h-[44px]"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={`w-4 h-4 opacity-60 transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                  />
                </button>
                {isExpanded && (
                  <div className="bg-elevated pb-1">
                    {group.items.map((item, i) => {
                      const Icon = item.icon;
                      return (
                        <button
                          key={i}
                          onClick={() => handleItem(item.onClick)}
                          className={`w-full text-left px-6 py-2.5 text-sm flex items-center gap-2.5 hover:bg-surface transition-colors min-h-[44px] ${
                            item.active ? 'text-accent font-medium' : 'text-ink'
                          }`}
                        >
                          {Icon && <Icon className="w-3.5 h-3.5 flex-shrink-0 text-muted" />}
                          <span>{item.label}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {quickActions && quickActions.length > 0 && (
            <div className="px-4 py-2 flex items-center gap-2 flex-wrap">
              {quickActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    onClick={() => handleItem(action.onClick)}
                    title={action.title}
                    className="btn-ghost !px-3 !py-2 text-sm min-h-[44px]"
                  >
                    {Icon && <Icon className="w-3.5 h-3.5" />}
                    <span>{action.label}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
