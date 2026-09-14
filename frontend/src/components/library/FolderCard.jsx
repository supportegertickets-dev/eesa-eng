import Link from 'next/link';
import { HiChevronRight, HiFolder } from 'react-icons/hi';

export function FolderGrid({ children }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">{children}</div>;
}

/** A folder in the library tree. Empty folders are shown muted but stay reachable. */
export default function FolderCard({ href, title, subtitle, count = 0, muted = false }) {
  return (
    <Link
      href={href}
      className="group card !p-4 flex items-center gap-3.5 transition-shadow hover:shadow-raised"
    >
      <span
        className={`w-11 h-11 rounded-lg flex items-center justify-center shrink-0
          ${muted ? 'bg-muted text-faint' : 'bg-accent-500/15 text-accent-600 dark:text-accent-400'}`}
        aria-hidden="true"
      >
        <HiFolder className="w-6 h-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-strong truncate">{title}</span>
        {subtitle && <span className="block text-sm text-muted-fg truncate">{subtitle}</span>}
      </span>
      <span className="text-xs text-subtle whitespace-nowrap tabular-nums">
        {count} {count === 1 ? 'file' : 'files'}
      </span>
      <HiChevronRight className="w-5 h-5 text-faint group-hover:text-body transition-colors shrink-0" aria-hidden="true" />
    </Link>
  );
}
