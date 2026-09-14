export const chipClassName = (active) =>
  `inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap border transition-colors ${
    active ? 'bg-primary-500 border-primary-500 text-white' : 'border-line text-body hover:bg-muted'
  }`;

export const chipCountClassName = (active) => (active ? 'text-white/80' : 'text-subtle');

/**
 * A row of mutually exclusive filter buttons that scrolls sideways on phones.
 * @param {{ options: Array<{ id: string, label: string, count?: number }>, value: string, onChange: Function, label: string }} props
 */
export default function FilterChips({ options, value, onChange, label }) {
  return (
    <div role="group" aria-label={label} className="flex gap-2 overflow-x-auto pb-1 -mb-1">
      {options.map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={chipClassName(active)}
          >
            {option.label}
            {option.count != null && <span className={chipCountClassName(active)}>{option.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
