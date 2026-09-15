'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiDownload, HiSearch, HiUserRemove, HiUsers, HiViewGrid } from 'react-icons/hi';
import { exportAdminMembers, getAdminMemberSummary, getAdminMembers, setUserStatus } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, formatDateTime, relativeTime } from '@/lib/dates';
import { MEMBERSHIP_FILTERS, adminMemberHref, fullName, membershipState, saveBlob, studyLabel } from '@/lib/members';
import { ALL_ROLES, DEPARTMENTS, roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

const PAGE_SIZE = 25;

// Filters live in the URL, so Back from a profile returns to the same view and
// a filtered list can be shared with another administrator.
const FILTER_KEYS = ['search', 'active', 'membership', 'role', 'department', 'year', 'sort'];

const ACCOUNT_OPTIONS = [
  { value: '', label: 'Active accounts' },
  { value: 'false', label: 'Deactivated' },
  { value: 'all', label: 'All accounts' },
];
const ROLE_OPTIONS = [{ value: '', label: 'Any role' }, ...ALL_ROLES.map((role) => ({ value: role, label: roleLabel(role) }))];
const DEPARTMENT_OPTIONS = [{ value: '', label: 'Any department' }, ...DEPARTMENTS.map((dept) => ({ value: dept, label: dept }))];
const YEAR_OPTIONS = [
  { value: '', label: 'Any year' },
  ...[1, 2, 3, 4, 5].map((year) => ({ value: String(year), label: `Year ${year}` })),
  { value: 'alumni', label: 'Alumni' },
];
const SORT_OPTIONS = [
  { value: '', label: 'Newest first' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'lastLogin', label: 'Recently signed in' },
];

const SUMMARY_TILES = [
  { key: 'active', label: 'Active members', view: {} },
  { key: 'paid', label: 'Paid membership', view: { membership: 'current' } },
  { key: 'joinedLast30Days', label: 'Joined in the last 30 days', view: { active: 'all' } },
  { key: 'deactivated', label: 'Deactivated', view: { active: 'false' } },
];

export default function AdminMembersPage() {
  // useSearchParams must sit inside a Suspense boundary.
  return (
    <Suspense fallback={<SkeletonList count={6} />}>
      <AdminMembers />
    </Suspense>
  );
}

function AdminMembers() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user: currentUser, isAdmin, isFullAdmin } = useAuth();

  const filters = useMemo(() => {
    const values = Object.fromEntries(FILTER_KEYS.map((key) => [key, searchParams.get(key) || '']));
    values.page = Math.max(1, Number(searchParams.get('page')) || 1);
    return values;
  }, [searchParams]);

  const [searchInput, setSearchInput] = useState(filters.search);
  const [data, setData] = useState({ users: [], total: 0, totalPages: 1 });
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  const replaceQuery = useCallback((params) => {
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [router, pathname]);

  const updateFilters = useCallback((changes) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (value) next.set(key, String(value));
      else next.delete(key);
    });
    // Changing what is shown starts again from the first page.
    if (!('page' in changes) || next.get('page') === '1') next.delete('page');
    replaceQuery(next);
  }, [searchParams, replaceQuery]);

  /** Replace every filter at once, for the summary tiles and "Clear filters". */
  const showView = useCallback((view) => {
    setSearchInput('');
    replaceQuery(new URLSearchParams(view));
  }, [replaceQuery]);

  // Debounce typing so the list is not re-queried on every keystroke.
  useEffect(() => {
    const term = searchInput.trim();
    if (term === filters.search) return undefined;
    const timer = setTimeout(() => updateFilters({ search: term }), 350);
    return () => clearTimeout(timer);
  }, [searchInput, filters.search, updateFilters]);

  // The year menu folds Alumni in beside the year numbers; the API keeps them apart.
  const apiQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (filters.search) params.set('search', filters.search);
    if (filters.active !== 'all') params.set('active', filters.active === 'false' ? 'false' : 'true');
    ['membership', 'role', 'department', 'sort'].forEach((key) => {
      if (filters[key]) params.set(key, filters[key]);
    });
    if (filters.year === 'alumni') {
      params.set('status', 'alumni');
    } else if (filters.year) {
      params.set('status', 'student');
      params.set('year', filters.year);
    }
    return params.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams(apiQuery);
      params.set('page', String(filters.page));
      params.set('limit', String(PAGE_SIZE));
      setData(await getAdminMembers(`?${params}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [apiQuery, filters.page]);

  const loadSummary = useCallback(async () => {
    try {
      setSummary(await getAdminMemberSummary());
    } catch {
      // The counts are a convenience; the table works without them.
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);
  useEffect(() => { if (isAdmin) loadSummary(); }, [isAdmin, loadSummary]);

  if (!isAdmin) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Admin and Chairperson only.</p>
      </div>
    );
  }

  const hasFilters = FILTER_KEYS.some((key) => filters[key]);

  const handleExport = async () => {
    setExporting(true);
    try {
      const blob = await exportAdminMembers(apiQuery ? `?${apiQuery}` : '');
      saveBlob(blob, `eesa-members-${new Date().toISOString().slice(0, 10)}.csv`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setExporting(false);
    }
  };

  const applyStatus = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await setUserStatus(pending._id, !pending.isActive);
      toast.success(result?.message || 'Account updated.');
      setPending(null);
      load();
      loadSummary();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const filterSelect = (key, label, options) => (
    <label className="min-w-0">
      <span className="sr-only">{label}</span>
      <select
        value={filters[key]}
        onChange={(event) => updateFilters({ [key]: event.target.value })}
        className="input-field py-2 text-sm"
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <p className="text-primary-600 dark:text-primary-300 text-sm font-semibold uppercase tracking-wide">Administration</p>
          <h1 className="page-title mt-1">Manage members</h1>
          <p className="text-muted-fg mt-1">Find any member, check their membership and open their full profile.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/portal/members" className="btn-ghost">
            <HiViewGrid className="w-4 h-4" aria-hidden="true" /> Directory
          </Link>
          <button type="button" onClick={handleExport} disabled={exporting} className="btn-outline">
            <HiDownload className="w-4 h-4" aria-hidden="true" /> {exporting ? 'Exporting…' : 'Export CSV'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {SUMMARY_TILES.map((tile) => (
          <button
            key={tile.key}
            type="button"
            onClick={() => showView(tile.view)}
            className="card p-4 text-left hover:border-primary-300 dark:hover:border-primary-500/40 transition-colors"
          >
            <p className="text-2xl font-heading font-bold text-strong tabular-nums">{summary ? summary[tile.key] : '–'}</p>
            <p className="text-xs text-subtle mt-1">{tile.label}</p>
          </button>
        ))}
      </div>

      <div className="card p-4 mb-4 space-y-3">
        <label className="relative block">
          <span className="sr-only">Search members</span>
          <HiSearch className="w-5 h-5 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search by name, email, username or registration number"
            className="input-field pl-10"
          />
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2">
          {filterSelect('active', 'Account status', ACCOUNT_OPTIONS)}
          {filterSelect('membership', 'Membership', MEMBERSHIP_FILTERS)}
          {filterSelect('role', 'Role', ROLE_OPTIONS)}
          {filterSelect('department', 'Department', DEPARTMENT_OPTIONS)}
          {filterSelect('year', 'Year of study', YEAR_OPTIONS)}
          {filterSelect('sort', 'Sort order', SORT_OPTIONS)}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mb-3 min-h-8">
        <p className="text-sm text-muted-fg" aria-live="polite">
          {loading ? 'Loading members…' : `${data.total} member${data.total === 1 ? '' : 's'}`}
        </p>
        {hasFilters && (
          <button type="button" onClick={() => showView({})} className="btn-ghost btn-sm">Clear filters</button>
        )}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <LoadingRegion label="Loading members"><SkeletonList count={6} /></LoadingRegion>
      ) : data.users.length === 0 ? (
        <EmptyState
          icon={HiUsers}
          title="No members match"
          description={hasFilters ? 'Try a different search or loosen the filters.' : 'Members will appear here once they register.'}
          action={hasFilters ? 'Clear filters' : undefined}
          onAction={() => showView({})}
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Member</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Reg. no.</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">Department</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium">Membership</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden xl:table-cell">Last sign-in</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Account</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((member) => {
                  const name = fullName(member);
                  const membership = membershipState(member);
                  const isSelf = member._id === currentUser?._id;
                  // Mirrors the API: only a full admin may act on another admin's account.
                  const canAct = !isSelf && (member.role !== 'admin' || isFullAdmin);

                  return (
                    <tr key={member._id} className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar src={member.avatar} name={name} size="sm" />
                          <div className="min-w-0">
                            <Link
                              href={adminMemberHref(member._id)}
                              className="block font-medium text-strong hover:text-primary-600 dark:hover:text-primary-300 truncate"
                            >
                              {name}
                            </Link>
                            <p className="text-xs text-subtle truncate">{member.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-body whitespace-nowrap">
                        {member.regNumber || <span className="text-faint">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        <p className="text-body">{member.department}</p>
                        <p className="text-xs text-subtle">{studyLabel(member)}</p>
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {member.role === 'member'
                          ? <span className="text-subtle">Member</span>
                          : <span className="badge-brand whitespace-nowrap">{roleLabel(member.role)}</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={membership.badge}>{membership.label}</span>
                        {membership.id !== 'none' && member.membershipExpiry && (
                          <p className="text-xs text-subtle mt-1 whitespace-nowrap">
                            {membership.id === 'expired' ? 'Ended' : 'Until'} {formatDate(member.membershipExpiry)}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden xl:table-cell text-subtle whitespace-nowrap">
                        {member.lastLoginAt
                          ? <time dateTime={member.lastLoginAt} title={formatDateTime(member.lastLoginAt)}>{relativeTime(member.lastLoginAt)}</time>
                          : 'Never'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={member.isActive ? 'badge-success' : 'badge-danger'}>
                          {member.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAct && (member.isActive ? (
                          <button
                            type="button"
                            onClick={() => setPending(member)}
                            className="p-1.5 rounded-lg text-faint hover:text-danger hover:bg-danger-soft transition-colors"
                            aria-label={`Deactivate ${name}`}
                            title="Deactivate account"
                          >
                            <HiUserRemove className="w-4 h-4" aria-hidden="true" />
                          </button>
                        ) : (
                          <button type="button" onClick={() => setPending(member)} className="btn-outline btn-sm">
                            Restore
                          </button>
                        ))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {data.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-line">
              <Pagination page={filters.page} totalPages={data.totalPages} onChange={(page) => updateFilters({ page })} />
            </div>
          )}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(pending)}
        destructive={Boolean(pending?.isActive)}
        title={pending?.isActive ? `Deactivate ${pending?.firstName}?` : `Restore ${pending?.firstName}'s account?`}
        description={pending?.isActive
          ? 'They will be signed out immediately and cannot sign in until the account is restored.'
          : 'They will be able to sign in again straight away with their existing password.'}
        confirmLabel={pending?.isActive ? 'Deactivate' : 'Restore account'}
        busy={busy}
        onConfirm={applyStatus}
        onCancel={() => setPending(null)}
      />
    </div>
  );
}
