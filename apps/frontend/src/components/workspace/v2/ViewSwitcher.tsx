interface SwitcherOption {
  key: string;
  label: string;
}

interface ViewSwitcherProps {
  options: SwitcherOption[];
  active: string;
  onChange: (key: string) => void;
}

/**
 * Pill switcher réutilisable — style discret thème dark stone Lexa.
 */
export function ViewSwitcher({ options, active, onChange }: ViewSwitcherProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        background: 'rgb(var(--elevated))',
        border: '1px solid rgb(var(--border))',
        borderRadius: 10,
      }}
    >
      {options.map((o) => {
        const isActive = o.key === active;
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            style={{
              padding: '5px 10px',
              borderRadius: 7,
              border: 0,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 500,
              background: isActive ? 'rgb(var(--surface))' : 'transparent',
              color: isActive ? 'rgb(var(--ink))' : 'rgb(var(--muted))',
              transition: 'background 120ms, color 120ms',
              boxShadow: isActive ? '0 1px 3px rgb(0 0 0 / 0.3)' : 'none',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
