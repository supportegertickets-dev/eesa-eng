'use client';

import { useCallback, useEffect, useState } from 'react';
import { HiClipboardList, HiRefresh, HiSearch } from 'react-icons/hi';
import { getAuditLog } from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/dates';
import { roleLabel } from '@/lib/roles';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';

const CATEGORIES = [
  { id: '', label: 'Everything' },
  { id: 'platform', label: 'Platform' },
  { id: 'security', label: 'Security' },
  { id: 'members', label: 'Members' },
  { id: 'payments', label: 'Payments' },
];

const CATEGORY_BADGES = {
  platform: 'badge-brand',
  security: 'badge-danger',
  members: 'badge-info',
  payments: 'badge-success',
};

const SEARCH_DELAY_MS = 300;

/** Who did what, newest first. */
export default function AuditTab() {
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  // Wait for a pause in typing before searching.
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setPage(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const params = new URLSearchParams({ page: String(page), limit: '25' });
    if (category) params.set('category', category);
    if (query) params.set('search', query);
    try {
      setData(await getAuditLog(`?${params}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [category, query, page]);

  useEffect(() => { load(); }, [load]);

  const chooseCategory = (id) => {
    setCategory(id);
    setPage(1);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <div className="flex-1 min-w-0">
          <FilterChips options={CATEGORIES} value={category} onChange={chooseCategory} label="Filter by kind" />
        </div>
        <div className="flex gap-2">
          <div className="relative flex-1 lg:w-72">
            <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              type="search"
              className="input-field pl-9"
              placeholder="Search names, emails, actions"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              aria-label="Search the audit log"
            />
          </div>
          <button type="button" className="btn-outline" onClick={load} disabled={loading} aria-label="Refresh">
            <HiRefresh className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          </button>
        </div>
      </div>

      {error && <ErrorState title="Could not load the audit log" error={error} onRetry={load} />}
      {!error && !data && <SkeletonList count={5} />}
      {!error && data && !data.entries.length && (
        <EmptyState
          icon={HiClipboardList}
          title="Nothing recorded"
          description={query || category ? 'No entries match these filters.' : 'Sensitive actions appear here as they happen.'}
        />
      )}

      {!error && data?.entries.length > 0 && (
        <>
          <p className="text-sm text-subtle">{data.total.toLocaleString()} {data.total === 1 ? 'entry' : 'entries'}</p>
          <ol className="card p-0 divide-y divide-line">
            {data.entries.map((entry) => <AuditEntry key={entry._id} entry={entry} />)}
          </ol>
          <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}
    </div>
  );
}

function AuditEntry({ entry }) {
  const who = entry.actorName
    ? `${entry.actorName}${entry.actorRole ? ` (${roleLabel(entry.actorRole)})` : ''}`
    : 'No one signed in';
  const hasDetails = entry.details && Object.keys(entry.details).length > 0;

  return (
    <li className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-subtle">
        <span className={CATEGORY_BADGES[entry.category] || 'badge-neutral'}>{entry.category}</span>
        <time dateTime={entry.createdAt} title={formatDateTime(entry.createdAt)}>{relativeTime(entry.createdAt)}</time>
        <span>·</span>
        <span>{formatDateTime(entry.createdAt)}</span>
      </div>
      <p className="text-sm text-strong mt-1.5">{entry.summary}</p>
      <p className="text-xs text-muted-fg mt-1">
        By {who}
        {entry.ip && <> · from {entry.ip}</>}
        <span className="font-mono"> · {entry.action}</span>
      </p>
      {hasDetails && (
        <details className="mt-2 group">
          <summary className="text-xs font-medium text-primary-600 dark:text-primary-300 cursor-pointer select-none">Details</summary>
          <pre className="mt-2 text-xs bg-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words text-body">
            {JSON.stringify(entry.details, null, 2)}
          </pre>
        </details>
      )}
    </li>
  );
}
