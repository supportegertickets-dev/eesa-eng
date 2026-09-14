import Link from 'next/link';
import { HiChevronRight } from 'react-icons/hi';

/** Folder path. The last item is the current folder and is not a link. */
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="mb-4">
      <ol className="flex flex-wrap items-center gap-1 text-sm">
        {items.map((item, index) => {
          const last = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex items-center gap-1 min-w-0">
              {index > 0 && <HiChevronRight className="w-4 h-4 text-faint shrink-0" aria-hidden="true" />}
              {last || !item.href ? (
                <span aria-current={last ? 'page' : undefined} className="font-medium text-strong truncate max-w-[16rem]">
                  {item.label}
                </span>
              ) : (
                <Link href={item.href} className="text-subtle hover:text-primary-500 dark:hover:text-primary-300 truncate max-w-[12rem] transition-colors">
                  {item.label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
