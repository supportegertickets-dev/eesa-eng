'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiPhotograph, HiSearch, HiX } from 'react-icons/hi';
import { getAlbums } from '@/lib/api';
import { GALLERY_CATEGORIES, SORT_OPTIONS, categoryLabel } from '@/lib/gallery';
import AlbumCard from '@/components/gallery/AlbumCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const PAGE_SIZE = 24;
const CATEGORY_OPTIONS = [{ id: '', label: 'All' }, ...GALLERY_CATEGORIES.map((id) => ({ id, label: categoryLabel(id) }))];
const SORT_IDS = SORT_OPTIONS.map((option) => option.id);

const gridClass = (compact) => `grid grid-cols-1 min-[480px]:grid-cols-2 gap-4 sm:gap-6 ${
  compact ? 'lg:grid-cols-3 2xl:grid-cols-4' : 'lg:grid-cols-3 xl:grid-cols-4'
}`;

function AlbumGridSkeleton({ compact }) {
  return (
    <div className={gridClass(compact)} aria-hidden="true">
      {Array.from({ length: 8 }).map((_, index) => (
        <div key={index} className="rounded-xl overflow-hidden border border-line bg-surface">
          <Skeleton className="aspect-[4/3] w-full rounded-none" />
          <div className="p-4 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Searchable, filterable album grid that loads more as the member scrolls.
 *
 * The search, category and sort live in the address bar, so a filtered view
 * can be shared and survives Back.
 *
 * @param {(album: object) => string} hrefFor where each album card links to
 * @param {boolean} includeEmpty list albums with no photos (leaders only; the API ignores it for others)
 */
export default function AlbumBrowser({
  hrefFor,
  includeEmpty = false,
  compact = false,
  emptyDescription = 'Albums will appear here as soon as photos are added.',
  emptyAction,
  onEmptyAction,
}) {
  const [ready, setReady] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [sort, setSort] = useState('newest');

  const [albums, setAlbums] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [autoLoad, setAutoLoad] = useState(true);
  const [error, setError] = useState(null);

  const requestId = useRef(0);
  const sentinelRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get('q') || '';
    setSearchInput(q);
    setSearch(q);
    if (GALLERY_CATEGORIES.includes(params.get('category'))) setCategory(params.get('category'));
    if (SORT_IDS.includes(params.get('sort'))) setSort(params.get('sort'));
    setReady(true);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    if (!ready) return;
    const params = new URLSearchParams(window.location.search);
    const put = (key, value) => (value ? params.set(key, value) : params.delete(key));
    put('q', search);
    put('category', category);
    put('sort', sort === 'newest' ? '' : sort);
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [ready, search, category, sort]);

  const load = useCallback(async (nextPage) => {
    const id = ++requestId.current;
    if (nextPage === 1) setLoading(true);
    else setLoadingMore(true);

    try {
      const params = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE), sort });
      if (search) params.set('search', search);
      if (category) params.set('category', category);
      if (includeEmpty) params.set('includeEmpty', 'true');

      const data = await getAlbums(`?${params}`);
      if (id !== requestId.current) return;

      setAlbums((list) => (nextPage === 1
        ? data.albums
        : [...list, ...data.albums.filter((album) => !list.some((existing) => existing._id === album._id))]));
      setPage(data.page);
      setTotalPages(data.totalPages);
      setTotal(data.total);
      setAutoLoad(true);
      setError(null);
    } catch (err) {
      if (id !== requestId.current) return;
      if (nextPage === 1) {
        setError(err);
      } else {
        // Stop loading on scroll, or a failing request would repeat endlessly.
        setAutoLoad(false);
        toast.error(err.message);
      }
    } finally {
      if (id === requestId.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [search, category, sort, includeEmpty]);

  useEffect(() => {
    if (ready) load(1);
  }, [ready, load]);

  const hasMore = page < totalPages;

  // Fetch the next page shortly before the member reaches the end of the grid.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore || !autoLoad || loading || loadingMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) load(page + 1);
    }, { rootMargin: '600px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, autoLoad, loading, loadingMore, load, page]);

  const filtered = Boolean(search || category);
  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setCategory('');
  };

  let results;
  if (error) {
    results = <ErrorState error={error} onRetry={() => load(1)} />;
  } else if (loading && !albums.length) {
    results = <LoadingRegion label="Loading albums"><AlbumGridSkeleton compact={compact} /></LoadingRegion>;
  } else if (!albums.length) {
    results = filtered ? (
      <EmptyState icon={HiSearch} title="No albums match" description="Try another search or category." action="Clear filters" onAction={clearFilters} />
    ) : (
      <EmptyState icon={HiPhotograph} title="No albums yet" description={emptyDescription} action={emptyAction} onAction={onEmptyAction} />
    );
  } else {
    results = (
      <div aria-busy={loading} className={`transition-opacity ${loading ? 'opacity-60' : ''}`}>
        <p className="text-sm text-subtle mb-4" aria-live="polite">
          {total} album{total === 1 ? '' : 's'}{filtered ? ' found' : ''}
        </p>
        <ul className={gridClass(compact)}>
          {albums.map((album, index) => (
            <li key={album._id}>
              <AlbumCard album={album} href={hrefFor(album)} priority={index < 4} />
            </li>
          ))}
        </ul>
        {hasMore && (
          <div ref={sentinelRef} className="flex justify-center mt-8">
            <button type="button" onClick={() => load(page + 1)} disabled={loadingMore} className="btn-outline">
              {loadingMore ? 'Loading…' : 'Load more albums'}
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-col gap-3 mb-6">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-faint pointer-events-none" aria-hidden="true" />
            <input
              type="text"
              inputMode="search"
              enterKeyHint="search"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Search albums"
              aria-label="Search albums"
              className="input-field pl-10 pr-10"
            />
            {searchInput && (
              <button
                type="button"
                onClick={() => setSearchInput('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-subtle hover:text-strong"
                aria-label="Clear search"
              >
                <HiX className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-muted-fg shrink-0">
            <span className="whitespace-nowrap">Sort by</span>
            <select value={sort} onChange={(event) => setSort(event.target.value)} className="input-field w-auto">
              {SORT_OPTIONS.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <FilterChips label="Filter albums by category" options={CATEGORY_OPTIONS} value={category} onChange={setCategory} />
      </div>

      {results}
    </div>
  );
}
