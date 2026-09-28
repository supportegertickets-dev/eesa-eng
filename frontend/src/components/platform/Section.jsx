/** A titled card on the Platform control page. `danger` outlines it in red. */
export default function Section({ title, icon: Icon, description, action, danger = false, children }) {
  return (
    <section className={`card ${danger ? 'border-danger/40' : ''}`}>
      <div className="flex flex-wrap items-start gap-3 mb-5">
        <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${danger ? 'bg-danger-soft' : 'bg-primary-500/10'}`}>
          <Icon className={`w-5 h-5 ${danger ? 'text-danger' : 'text-primary-600 dark:text-primary-300'}`} aria-hidden="true" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="font-heading text-lg font-semibold text-strong">{title}</h2>
          {description && <p className="text-sm text-muted-fg mt-0.5">{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
