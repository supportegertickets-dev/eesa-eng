'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HiClipboardCheck, HiCollection, HiFolderOpen, HiUpload, HiCloudUpload } from 'react-icons/hi';
import { useAuth } from '@/lib/AuthContext';
import { useLibrary } from '@/components/library/LibraryProvider';

const ROOT = '/portal/library';

export default function LibraryHeader() {
  const pathname = usePathname();
  const { isAdmin } = useAuth();
  const { openUpload, pendingCount } = useLibrary();

  const tabs = [
    { href: ROOT, label: 'Browse', icon: HiFolderOpen },
    { href: `${ROOT}/uploads`, label: 'My uploads', icon: HiUpload },
    ...(isAdmin ? [
      { href: `${ROOT}/review`, label: 'Review', icon: HiClipboardCheck, badge: pendingCount },
      { href: `${ROOT}/units`, label: 'Units', icon: HiCollection },
    ] : []),
  ];

  const isCurrent = (href) => (href === ROOT ? pathname === ROOT : pathname.startsWith(href));

  return (
    <div className="mb-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="page-title">Library</h1>
          <p className="text-muted-fg mt-1">Notes, past papers and more, filed by year, semester and unit.</p>
        </div>
        <button type="button" onClick={() => openUpload()} className="btn-primary self-start sm:self-auto">
          <HiCloudUpload className="w-5 h-5" aria-hidden="true" /> Upload files
        </button>
      </div>

      <nav className="mt-5 flex gap-1 border-b border-line overflow-x-auto" aria-label="Library sections">
        {tabs.map((tab) => {
          const current = isCurrent(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={current ? 'page' : undefined}
              className={`inline-flex items-center gap-2 px-3 sm:px-4 py-2.5 -mb-px border-b-2 text-sm font-medium whitespace-nowrap transition-colors
                ${current ? 'border-primary-500 text-primary-500 dark:text-primary-300' : 'border-transparent text-subtle hover:text-body'}`}
            >
              <tab.icon className="w-4 h-4" aria-hidden="true" />
              {tab.label}
              {tab.badge > 0 && (
                <span className="badge-warning">
                  {tab.badge > 99 ? '99+' : tab.badge}
                  <span className="sr-only"> waiting</span>
                </span>
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
