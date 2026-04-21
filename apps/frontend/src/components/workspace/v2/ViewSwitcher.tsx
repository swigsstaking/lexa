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
        display: 'flex',
        gap: 2,
        padding: 3,
        background: 'var(--chrome-bg)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid var(--chrome-line)',
        borderRadius: 10,
        overflowX: 'auto',
        flexShrink: 0,
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
              background: isActive ? 'var(--chrome-bg-2)' : 'transparent',
              color: isActive ? 'var(--chrome-ink-1)' : 'var(--chrome-ink-3)',
              transition: 'background 120ms, color 120ms',
              flexShrink: 0,
              minHeight: 44,
              whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
