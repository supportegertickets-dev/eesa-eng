'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiCloudUpload, HiCollection, HiDocumentText, HiFolder, HiFolderOpen, HiSearch } from 'react-icons/hi';
import { getResource, getResources } from '@/lib/api';
import {
  RESOURCE_TYPES, TYPE_LABELS, buildFolderTree, libraryHref, placementLabel, plural, unitHref,
} from '@/lib/library';
import { useLibrary } from '@/components/library/LibraryProvider';
import Breadcrumbs from '@/components/library/Breadcrumbs';
import FolderCard, { FolderGrid } from '@/components/library/FolderCard';
import ResourceCollection from '@/components/library/ResourceCollection';
import ResourceViewer from '@/components/library/ResourceViewer';
import usePagedResources from '@/components/library/usePagedResources';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { chipClassName, chipCountClassName } from '@/components/ui/FilterChips';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'popular', label: 'Most opened' },
  { id: 'title', label: 'Title A–Z' },
];

/**
 * The library as folders: Year › Semester › Unit › Type.
 *
 * The open folder is kept in the URL (?year=4&semester=2&unit=EEEN 481&type=notes),
 * so Back, refresh and shared links all land in the same place. ?file=<id>
 * opens a file directly, for links from notifications.
 */
export default function LibraryBrowser() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { units, unitsLoading, unitsError, reloadUnits } = useLibrary();

  const year = Number(searchParams.get('year')) || null;
  const semester = Number(searchParams.get('semester')) || null;
  const unitCode = searchParams.get('unit') || '';
  const type = RESOURCE_TYPES.includes(searchParams.get('type')) ? searchParams.get('type') : '';
  const other = searchParams.get('other') === '1';
  const query = searchParams.get('q') || '';
  const sort = SORTS.some((option) => option.id === searchParams.get('sort')) ? searchParams.get('sort') : 'newest';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const fileId = searchParams.get('file');

  const tree = useMemo(() => buildFolderTree(units), [units]);
  const unit = unitCode ? units.find((candidate) => candidate.code === unitCode) || null : null;

  const setParams = useCallback((changes, { replace = false } = {}) => {
    const href = libraryHref({ ...Object.fromEntries(searchParams.entries()), ...changes });
    if (replace) router.replace(href, { scroll: false });
    else router.push(href, { scroll: false });
  }, [router, searchParams]);

  const [linked, setLinked] = useState(null);
  useEffect(() => {
    if (!fileId) {
      setLinked(null);
      return undefined;
    }
    let cancelled = false;
    getResource(fileId)
      .then((resource) => { if (!cancelled) setLinked(resource); })
      .catch((error) => { if (!cancelled) toast.error(error.message); });
    return () => { cancelled = true; };
  }, [fileId]);

  const crumbs = [{ label: 'Library', href: libraryHref() }];
  if (query) {
    crumbs.push({ label: `Results for “${query}”` });
  } else if (unitCode) {
    if (unit?.year) {
      crumbs.push(
        { label: `Year ${unit.year}`, href: libraryHref({ year: unit.year }) },
        { label: `Semester ${unit.semester}`, href: libraryHref({ year: unit.year, semester: unit.semester }) }
      );
    } else if (unit) {
      crumbs.push({ label: 'Other units', href: libraryHref({ other: 1 }) });
    }
    crumbs.push({ label: unitCode, href: type ? unitHref(unit || { code: unitCode }) : undefined });
    if (type) crumbs.push({ label: TYPE_LABELS[type] });
  } else if (other) {
    crumbs.push({ label: 'Other units' });
  } else if (year) {
    crumbs.push({ label: `Year ${year}`, href: semester ? libraryHref({ year }) : undefined });
    if (semester) crumbs.push({ label: `Semester ${semester}` });
  }

  let content;
  if (query) {
    content = <SearchResults query={query} sort={sort} page={page} onPage={(next) => setParams({ page: next > 1 ? next : '' })} />;
  } else if (unitCode) {
    if (unitsLoading) content = <FolderSkeleton count={1} />;
    else if (unitsError) content = <ErrorState error={unitsError} onRetry={reloadUnits} />;
    else if (unit) content = <UnitFolder unit={unit} type={type} sort={sort} page={page} setParams={setParams} />;
    else {
      content = (
        <EmptyState
          icon={HiFolder}
          title="This unit is not in the library"
          description="It may have been renamed or merged into another unit."
          action="Back to the library"
          actionHref={libraryHref()}
        />
      );
    }
  } else if (unitsError) {
    content = <ErrorState error={unitsError} onRetry={reloadUnits} />;
  } else if (unitsLoading) {
    content = <FolderSkeleton />;
  } else if (other) {
    content = <UnitFolders units={tree.other.units} />;
  } else if (year && semester) {
    content = <UnitFolders units={tree.years[year - 1]?.semesters[semester - 1]?.units || []} />;
  } else if (year && tree.years[year - 1]) {
    content = (
      <FolderGrid>
        {tree.years[year - 1].semesters.map((entry) => (
          <FolderCard
            key={entry.semester}
            href={libraryHref({ year, semester: entry.semester })}
            title={`Semester ${entry.semester}`}
            subtitle={plural(entry.units.length, 'unit')}
            count={entry.total}
            muted={!entry.units.length}
          />
        ))}
      </FolderGrid>
    );
  } else {
    content = <RootFolders tree={tree} />;
  }

  return (
    <div>
      <SearchBar key={query} initial={query} onSearch={(value) => router.push(libraryHref(value ? { q: value } : {}))} />
      {crumbs.length > 1 && <Breadcrumbs items={crumbs} />}
      {content}
      {linked && <ResourceViewer resource={linked} onClose={() => setParams({ file: '' }, { replace: true })} />}
    </div>
  );
}

function SearchBar({ initial, onSearch }) {
  const [value, setValue] = useState(initial);
  return (
    <form
      role="search"
      className="relative mb-5"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(value.trim());
      }}
    >
      <HiSearch className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-faint pointer-events-none" aria-hidden="true" />
      <input
        type="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        maxLength={80}
        placeholder="Search by title, unit code or unit name"
        aria-label="Search the library"
        className="input-field pl-11 pr-24"
      />
      <button type="submit" className="btn-primary btn-sm absolute right-1.5 top-1/2 -translate-y-1/2">Search</button>
    </form>
  );
}

function FolderSkeleton({ count = 6 }) {
  return (
    <LoadingRegion label="Loading folders">
      <FolderGrid>
        {Array.from({ length: count }, (_, index) => <Skeleton key={index} className="h-[74px] rounded-xl" />)}
      </FolderGrid>
    </LoadingRegion>
  );
}

function RootFolders({ tree }) {
  return (
    <>
      <FolderGrid>
        {tree.years.map((entry) => (
          <FolderCard
            key={entry.year}
            href={libraryHref({ year: entry.year })}
            title={`Year ${entry.year}`}
            subtitle={plural(entry.unitCount, 'unit')}
            count={entry.total}
            muted={!entry.unitCount}
          />
        ))}
        {tree.other.units.length > 0 && (
          <FolderCard
            href={libraryHref({ other: 1 })}
            title="Other units"
            subtitle="Service and elective units"
            count={tree.other.total}
          />
        )}
      </FolderGrid>
      <RecentFiles />
    </>
  );
}

function RecentFiles() {
  const { version, openUpload } = useLibrary();
  const list = usePagedResources(getResources, { sort: 'newest', limit: 5 }, version);

  return (
    <section className="mt-10" aria-labelledby="recent-files">
      <h2 id="recent-files" className="font-heading text-lg font-semibold text-strong mb-3">Recently added</h2>
      <ResourceCollection
        list={list}
        showLocation
        hidePagination
        emptyState={(
          <EmptyState
            icon={HiCollection}
            title="The library is empty"
            description="Be the first to share notes or past papers for your units."
            action="Upload files"
            onAction={() => openUpload()}
          />
        )}
      />
    </section>
  );
}

function UnitFolders({ units }) {
  const { openUpload } = useLibrary();

  if (!units.length) {
    return (
      <EmptyState
        icon={HiFolder}
        title="No units here yet"
        description="Units appear once a reviewer adds them, or when someone uploads a file for a new unit."
        action="Upload files"
        onAction={() => openUpload()}
      />
    );
  }

  return (
    <FolderGrid>
      {units.map((entry) => (
        <FolderCard
          key={entry._id}
          href={unitHref(entry)}
          title={entry.code}
          subtitle={entry.name || 'Name not set'}
          count={entry.files?.total || 0}
          muted={!entry.files?.total}
        />
      ))}
    </FolderGrid>
  );
}

function UnitFolder({ unit, type, sort, page, setParams }) {
  const { version, openUpload } = useLibrary();
  const list = usePagedResources(getResources, { unit: unit._id, type, sort, page, limit: 20 }, version);

  const byType = unit.files?.byType || {};
  const chips = [
    { id: '', label: 'All files', count: unit.files?.total || 0 },
    ...RESOURCE_TYPES.filter((entry) => byType[entry]).map((entry) => ({ id: entry, label: TYPE_LABELS[entry], count: byType[entry] })),
  ];
  // An empty type can still be reached from an old link.
  if (type && !byType[type]) chips.push({ id: type, label: TYPE_LABELS[type], count: 0 });

  return (
    <>
      <div className="card !p-5 mb-5 flex flex-col sm:flex-row sm:items-center gap-4">
        <span className="w-12 h-12 rounded-xl bg-accent-500/15 text-accent-600 dark:text-accent-400 flex items-center justify-center shrink-0" aria-hidden="true">
          <HiFolderOpen className="w-7 h-7" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-heading text-xl font-semibold text-strong">{unit.code}</h2>
          <p className="text-body">{unit.name || 'Unit name not set yet'}</p>
          <p className="text-xs text-subtle mt-1">{placementLabel(unit)} · {plural(unit.files?.total || 0, 'file')}</p>
        </div>
        <button type="button" onClick={() => openUpload({ unit })} className="btn-outline btn-sm self-start sm:self-center">
          <HiCloudUpload className="w-4 h-4" aria-hidden="true" /> Upload to {unit.code}
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-4">
        <nav aria-label="Document types" className="flex gap-2 overflow-x-auto pb-1 -mb-1 flex-1">
          {chips.map((chip) => (
            <Link
              key={chip.id || 'all'}
              href={unitHref(unit, { type: chip.id, sort: sort === 'newest' ? '' : sort })}
              scroll={false}
              aria-current={chip.id === type ? 'page' : undefined}
              className={chipClassName(chip.id === type)}
            >
              {chip.label}
              <span className={chipCountClassName(chip.id === type)}>{chip.count}</span>
            </Link>
          ))}
        </nav>
        <label className="flex items-center gap-2 text-sm text-subtle shrink-0">
          <span className="sr-only sm:not-sr-only">Sort</span>
          <select
            value={sort}
            onChange={(event) => setParams({ sort: event.target.value === 'newest' ? '' : event.target.value, page: '' }, { replace: true })}
            className="input-field w-auto py-1.5"
          >
            {SORTS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
          </select>
        </label>
      </div>

      <ResourceCollection
        list={list}
        onPageChange={(next) => {
          setParams({ page: next > 1 ? next : '' });
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        emptyState={(
          <EmptyState
            icon={HiDocumentText}
            title={type ? `No ${TYPE_LABELS[type].toLowerCase()} for ${unit.code} yet` : `No files in ${unit.code} yet`}
            description="Have notes or past papers for this unit? Share them with your classmates."
            action="Upload files"
            onAction={() => openUpload({ unit })}
          />
        )}
      />
    </>
  );
}

function SearchResults({ query, sort, page, onPage }) {
  const { version } = useLibrary();
  const list = usePagedResources(getResources, { search: query, sort, page, limit: 20 }, version);

  return (
    <>
      {!list.loading && (
        <p className="text-sm text-subtle mb-3" aria-live="polite">{plural(list.total, 'file')} found</p>
      )}
      <ResourceCollection
        list={list}
        showLocation
        onPageChange={onPage}
        emptyState={(
          <EmptyState
            icon={HiSearch}
            title="No files match your search"
            description="Try a unit code such as EEEN 481, part of a unit name, or fewer words."
          />
        )}
      />
    </>
  );
}
