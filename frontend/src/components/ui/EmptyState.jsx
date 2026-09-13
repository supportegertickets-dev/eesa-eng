import Link from 'next/link';

/**
 * Placeholder shown when a list has no rows.
 *
 * Several pages rendered an empty container with no explanation, so a member
 * could not tell whether the data was still loading, had failed, or genuinely
 * did not exist yet. An empty state names which of those it is and offers the
 * action that would fill it.
 */
export default function EmptyState({ icon: Icon, title, description, action, actionHref, onAction }) {
  return (
    <div className="card flex flex-col items-center justify-center text-center py-12 px-6">
      {Icon && (
        <span className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-4">
          <Icon className="w-7 h-7 text-faint" aria-hidden="true" />
        </span>
      )}
      <h3 className="font-heading text-lg font-semibold text-strong">{title}</h3>
      {description && <p className="mt-1.5 text-sm text-muted-fg max-w-sm">{description}</p>}

      {action && actionHref && (
        <Link href={actionHref} className="btn-primary mt-5">{action}</Link>
      )}
      {action && !actionHref && onAction && (
        <button type="button" onClick={onAction} className="btn-primary mt-5">{action}</button>
      )}
    </div>
  );
}
