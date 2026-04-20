import { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface NavItem {
  label: string;
  onClick: () => void;
  icon?: LucideIcon;
  active?: boolean;
  title?: string;
}

interface NavDropdownProps {
  label: string;
  icon?: LucideIcon;
  items: NavItem[];
  /** Badge count — small red dot if > 0 */
  badge?: number;
}

export function NavDropdown({ label, icon: Icon, items, badge }: NavDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Fermer si click dehors
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Accessibilité clavier
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') setOpen(false);
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen((o) => !o);
    }
  };

  const handleItemKeyDown = (e: React.KeyboardEvent, onClick: () => void) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
      setOpen(false);
    }
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="true"
        aria-expanded={open}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors hover:opacity-80 relative"
        style={{ color: 'var(--chrome-ink-2)' }}
      >
        {Icon && <Icon className="w-3.5 h-3.5" />}
        <span className="hidden md:inline">{label}</span>
        <ChevronDown
          className={`w-3 h-3 opacity-60 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
        {badge && badge > 0 ? (
          <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-accent" />
        ) : null}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-1 min-w-[180px] rounded-lg z-50 py-1 shadow-lg"
          style={{ background: 'var(--chrome-bg-2)', border: '1px solid var(--chrome-line)' }}
        >
          {items.map((item, i) => {
            const ItemIcon = item.icon;
            return (
              <button
                key={i}
                role="menuitem"
                tabIndex={0}
                title={item.title}
                onClick={() => {
                  item.onClick();
                  setOpen(false);
                }}
                onKeyDown={(e) => handleItemKeyDown(e, item.onClick)}
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
        </div>
      )}
    </div>
  );
}
