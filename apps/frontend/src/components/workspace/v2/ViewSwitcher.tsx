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
 * Pill switcher — style prototype : floating surface semi-transparent avec blur.
 */
export function ViewSwitcher({ options, active, onChange }: ViewSwitcherProps) {
  return (
    <div
      style={{
        display: 'inline-flex',
        gap: 2,
        padding: 3,
        background: 'rgba(255,255,255,0.8)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--line-1)',
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
              background: isActive ? 'var(--ink-1)' : 'transparent',
              color: isActive ? '#FAFAF7' : 'var(--ink-2)',
              transition: 'background 120ms, color 120ms',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
