import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';

/** Previous / next pager. Renders nothing when everything fits on one page. */
export default function Pagination({ page, totalPages, onChange, className = '' }) {
  if (!totalPages || totalPages <= 1) return null;

  return (
    <nav className={`flex items-center justify-between gap-3 ${className}`} aria-label="Pagination">
      <button type="button" className="btn-ghost btn-sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <HiChevronLeft className="w-4 h-4" aria-hidden="true" /> Previous
      </button>
      <span className="text-sm text-subtle tabular-nums">Page {page} of {totalPages}</span>
      <button type="button" className="btn-ghost btn-sm" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        Next <HiChevronRight className="w-4 h-4" aria-hidden="true" />
      </button>
    </nav>
  );
}
