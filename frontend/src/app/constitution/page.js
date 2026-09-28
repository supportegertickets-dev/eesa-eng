'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { HiDocumentDownload, HiPrinter, HiScale, HiSearch, HiX } from 'react-icons/hi';
import { constitutionFileUrl, getConstitution, getConstitutionVersion } from '@/lib/api';
import { sectionAnchor, sectionHeading } from '@/lib/constitution';
import { formatDate } from '@/lib/dates';
import ConstitutionDocument from '@/components/constitution/ConstitutionDocument';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/ui/Skeleton';

export default function ConstitutionPage() {
  // useSearchParams must sit inside a Suspense boundary.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Constitution />
    </Suspense>
  );
}

function PageSkeleton() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
      <Skeleton className="h-10 w-72 mb-8" />
      <SkeletonText lines={8} />
    </div>
  );
}

function Constitution() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const requestedVersion = searchParams.get('version');

  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState('');

  const load = useCallback(async () => {
    setError(null);
    try {
      const current = await getConstitution();
      if (requestedVersion && requestedVersion !== current.constitution?._id) {
        const { constitution } = await getConstitutionVersion(requestedVersion);
        setData({ ...current, constitution, viewingOld: true });
      } else {
        setData({ ...current, viewingOld: false });
      }
    } catch (err) {
      setError(err);
    }
  }, [requestedVersion]);

  useEffect(() => { load(); }, [load]);

  const doc = data?.constitution;
  const sections = useMemo(() => doc?.sections || [], [doc]);
  const term = query.trim();

  const matches = useMemo(() => {
    if (!term) return sections;
    const lower = term.toLowerCase();
    return sections.filter((section) => `${sectionHeading(section)}\n${section.body}`.toLowerCase().includes(lower));
  }, [sections, term]);

  // Highlight the article being read in the contents list.
  useEffect(() => {
    if (!sections.length) return undefined;
    // Until the reader scrolls, the first article is the one in view.
    setActive((current) => current || sectionAnchor(sections[0], 0));
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-140px 0px -60% 0px' });
    sections.forEach((section, index) => {
      const element = document.getElementById(sectionAnchor(section, index));
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, [sections, matches]);

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : load} title={error.status === 404 ? 'That version could not be found' : undefined} />
      </div>
    );
  }
  if (!data) return <LoadingRegion label="Loading the constitution"><PageSkeleton /></LoadingRegion>;

  if (!doc) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <EmptyState icon={HiScale} title="The constitution is on its way" description="The association's constitution will be published here soon." />
      </div>
    );
  }

  const indexOf = (section) => sections.indexOf(section);
  const otherVersions = (data.versions || []).filter((version) => version._id !== doc._id);

  const contents = (
    <ol className="space-y-0.5 text-sm">
      {matches.map((section) => {
        const anchor = sectionAnchor(section, indexOf(section));
        return (
          <li key={anchor}>
            <a
              href={`#${anchor}`}
              aria-current={active === anchor ? 'location' : undefined}
              className={`block rounded-md px-3 py-1.5 transition-colors ${active === anchor ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300 font-medium' : 'text-muted-fg hover:text-strong hover:bg-muted'}`}
            >
              {sectionHeading(section)}
            </a>
          </li>
        );
      })}
    </ol>
  );

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-14 sm:py-16 print:bg-none print:text-black print:py-4">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-accent-400 font-semibold uppercase tracking-wide text-sm print:hidden">Governance</p>
          <h1 className="font-heading text-3xl sm:text-4xl lg:text-5xl font-bold mt-2 max-w-4xl">{doc.title}</h1>
          <p className="mt-4 text-white/85 print:text-black">
            Version {doc.version}
            {doc.adoptedOn && <> · Adopted {formatDate(doc.adoptedOn)}</>}
            {doc.publishedAt && <span className="print:hidden"> · Published here {formatDate(doc.publishedAt)}</span>}
          </p>
          <div className="mt-6 flex flex-wrap gap-2 print:hidden">
            {doc.file?.url && (
              <a href={constitutionFileUrl(doc._id, { download: true })} className="btn-accent">
                <HiDocumentDownload className="w-4 h-4" aria-hidden="true" /> Download the original
              </a>
            )}
            <button type="button" onClick={() => window.print()} className="btn border border-white/40 text-white hover:bg-white/10">
              <HiPrinter className="w-4 h-4" aria-hidden="true" /> Print
            </button>
          </div>
        </div>
      </section>

      {data.viewingOld && (
        <div className="bg-warning-soft border-b border-warning/30 print:hidden">
          <p className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 text-sm text-body">
            You are reading version {doc.version}, which has been replaced.{' '}
            <Link href={pathname} className="font-semibold underline">Read the current constitution</Link>
          </p>
        </div>
      )}

      <section className="py-10 bg-canvas print:py-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 lg:grid lg:grid-cols-[17rem_1fr] lg:gap-10">
          <aside className="print:hidden mb-8 lg:mb-0">
            <div className="lg:sticky lg:top-24 space-y-4">
              <div className="relative">
                <label htmlFor="constitution-search" className="sr-only">Search the constitution</label>
                <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                {/* Plain text rather than type=search, whose built-in clear button would duplicate ours. */}
                <input
                  id="constitution-search"
                  type="text"
                  inputMode="search"
                  enterKeyHint="search"
                  autoComplete="off"
                  className="input-field pl-9 pr-9 py-2"
                  placeholder="Search, e.g. quorum"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                {query && (
                  <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-body" onClick={() => setQuery('')} aria-label="Clear search">
                    <HiX className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {term && (
                <p className="text-sm text-muted-fg" role="status">
                  {matches.length ? `${matches.length} of ${sections.length} articles mention “${term}”.` : `No article mentions “${term}”.`}
                </p>
              )}

              <nav aria-label="Contents" className="hidden lg:block max-h-[calc(100vh-14rem)] overflow-y-auto pr-1">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle px-3 mb-2">Contents</h2>
                {contents}
              </nav>
              <details className="lg:hidden card p-0">
                <summary className="px-4 py-3 font-medium text-strong cursor-pointer">Contents ({matches.length})</summary>
                <nav aria-label="Contents" className="px-1 pb-3">{contents}</nav>
              </details>

              {otherVersions.length > 0 && (
                <div className="hidden lg:block pt-4 border-t border-line">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-subtle px-3 mb-2">Other versions</h2>
                  <ul className="text-sm">
                    {otherVersions.map((version) => (
                      <li key={version._id}>
                        <Link
                          href={version.isCurrent ? pathname : `${pathname}?version=${version._id}`}
                          className="block rounded-md px-3 py-1.5 text-muted-fg hover:text-strong hover:bg-muted"
                        >
                          Version {version.version}{version.isCurrent ? ' (current)' : ''}
                          {version.adoptedOn && <span className="text-faint"> · {formatDate(version.adoptedOn)}</span>}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>

          <div className="min-w-0 max-w-3xl">
            {doc.summary && !term && (
              <p className="mb-8 text-lg text-muted-fg leading-relaxed">{doc.summary}</p>
            )}
            {matches.length ? (
              <ConstitutionDocument sections={matches} query={term} indexOf={indexOf} />
            ) : (
              <EmptyState icon={HiSearch} title="No matches" description="Try a different word, or clear the search to read the whole constitution." action="Clear search" onAction={() => setQuery('')} />
            )}

            {otherVersions.length > 0 && (
              <div className="lg:hidden mt-12 pt-6 border-t border-line print:hidden">
                <label htmlFor="version-select" className="form-label">Other versions</label>
                <select
                  id="version-select"
                  className="input-field"
                  value=""
                  onChange={(e) => e.target.value && router.push(e.target.value)}
                >
                  <option value="">Choose a version…</option>
                  {otherVersions.map((version) => (
                    <option key={version._id} value={version.isCurrent ? pathname : `${pathname}?version=${version._id}`}>
                      Version {version.version}{version.isCurrent ? ' (current)' : ''}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
