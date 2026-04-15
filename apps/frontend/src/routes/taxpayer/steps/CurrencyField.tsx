interface Props {
  id: string;
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  hint?: string;
  max?: number;
}

export function CurrencyField({ id, label, value, onChange, hint, max }: Props) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={id}
          type="number"
          min="0"
          max={max}
          step="1"
          className="input mono-num !pr-14"
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') {
              onChange(undefined);
            } else {
              onChange(Number(v));
            }
          }}
          placeholder="0"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-2xs text-subtle pointer-events-none">
          CHF
        </span>
      </div>
      {hint && <p className="text-2xs text-subtle mt-1">{hint}</p>}
    </div>
  );
}
