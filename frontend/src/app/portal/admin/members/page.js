'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiBadgeCheck, HiCheck, HiDownload, HiSearch, HiUserAdd, HiUserRemove, HiUsers, HiViewGrid } from 'react-icons/hi';
import {
  approveMembers, deleteMemberAccount, exportAdminMembers, getAdminMemberSummary, getAdminMembers, setUserStatus,
} from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, formatDateTime, relativeTime } from '@/lib/dates';
import { MEMBERSHIP_FILTERS, accountState, adminMemberHref, fullName, membershipState, saveBlob, studyLabel } from '@/lib/members';
import { ALL_ROLES, DEPARTMENTS, roleLabel } from '@/lib/roles';
import MembershipDialog from '@/components/members/MembershipDialog';
import BulkMembershipDialog from '@/components/members/BulkMembershipDialog';
import MarkUnpaidDialog from '@/components/members/MarkUnpaidDialog';
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
  { value: 'pending', label: 'Awaiting approval' },
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
  const [deleting, setDeleting] = useState(null);
  const [payingFor, setPayingFor] = useState(null);
  const [expiryFor, setExpiryFor] = useState(null);
  const [unpaying, setUnpaying] = useState(null); // members to mark not paid
  const [bulk, setBulk] = useState(null); // { scope, description } for marking many paid
  const [selected, setSelected] = useState(() => new Map()); // id -> member
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
    if (filters.active !== 'all') params.set('active', ['false', 'pending'].includes(filters.active) ? filters.active : 'true');
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
  // Ticks belong to the list they were made in; new filters start afresh.
  useEffect(() => { setSelected(new Map()); }, [apiQuery]);

  if (!isAdmin) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Admin and Chairperson only.</p>
      </div>
    );
  }

  const hasFilters = FILTER_KEYS.some((key) => filters[key]);
  // The approval queue: its ticks approve sign-ups rather than change memberships.
  const approvalView = filters.active === 'pending';

  // Nobody changes their own membership, and deactivated and superadmin
  // accounts are left alone.
  const isTickable = (member) => (approvalView
    ? member.pendingApproval
    : member._id !== currentUser?._id && member.isActive && member.role !== 'superadmin');
  const tickable = data.users.filter(isTickable);
  const allOnPageTicked = tickable.length > 0 && tickable.every((member) => selected.has(member._id));
  const toggle = (member) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(member._id)) next.delete(member._id);
    else next.set(member._id, member);
    return next;
  });
  const togglePage = () => setSelected((current) => {
    const next = new Map(current);
    tickable.forEach((member) => (allOnPageTicked ? next.delete(member._id) : next.set(member._id, member)));
    return next;
  });

  const afterMembershipChange = () => {
    setSelected(new Map());
    load();
    loadSummary();
  };

  const markSelectedPaid = () => setBulk({
    scope: { ids: [...selected.keys()] },
    description: `The ${selected.size === 1 ? 'member' : `${selected.size} members`} you ticked.`,
  });

  const markAllPaid = () => {
    // Exactly the list on screen: the same filters, without paging or sorting.
    const filter = Object.fromEntries(new URLSearchParams(apiQuery));
    delete filter.sort;
    setBulk({
      scope: { filter },
      description: hasFilters
        ? `Everyone matching the current filters (${data.total} member${data.total === 1 ? '' : 's'}).`
        : `Every active member (${data.total}). Filter the list first to mark only some, for example Not paid up.`,
    });
  };

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

  const approve = async (members) => {
    setBusy(true);
    try {
      const result = await approveMembers(members.map((member) => member._id));
      toast.success(result?.message || 'Approved.');
      afterMembershipChange();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const applyDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      const result = await deleteMemberAccount(deleting._id);
      toast.success(result?.message || 'Account deleted.');
      setDeleting(null);
      afterMembershipChange();
    } catch (err) {
      // An account with history cannot be deleted; the message says what it has.
      toast.error(err.message, { duration: 8000 });
      setDeleting(null);
    } finally {
      setBusy(false);
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

      {summary?.pending > 0 && !approvalView && (
        <div className="card p-4 mb-4 flex flex-wrap items-center gap-3 border-warning/40 bg-warning-soft" role="status">
          <HiUserAdd className="w-5 h-5 text-warning shrink-0" aria-hidden="true" />
          <p className="text-sm text-strong flex-1 min-w-0">
            <span className="font-semibold">{summary.pending} sign-up{summary.pending === 1 ? ' is' : 's are'} waiting for approval.</span>{' '}
            Check each name and registration number before letting them in.
          </p>
          <button type="button" className="btn-primary btn-sm" onClick={() => showView({ active: 'pending' })}>Review</button>
        </div>
      )}

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

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3 min-h-8">
        <p className="text-sm text-muted-fg" aria-live="polite">
          {loading ? 'Loading members…' : `${data.total} member${data.total === 1 ? '' : 's'}`}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {hasFilters && (
            <button type="button" onClick={() => showView({})} className="btn-ghost btn-sm">Clear filters</button>
          )}
          {!loading && data.total > 0 && !approvalView && (
            <button type="button" onClick={markAllPaid} className="btn-outline btn-sm">
              <HiBadgeCheck className="w-4 h-4" aria-hidden="true" /> Mark all {data.total} paid
            </button>
          )}
        </div>
      </div>

      {selected.size > 0 && (
        <div className="card p-3 mb-3 flex flex-wrap items-center gap-2 sticky top-20 z-20 shadow-overlay" role="region" aria-label="Ticked members">
          <p className="text-sm font-medium text-strong flex-1">{selected.size} ticked</p>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Map())}>Clear</button>
          {approvalView ? (
            <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => approve([...selected.values()])}>
              <HiCheck className="w-4 h-4" aria-hidden="true" /> Approve {selected.size}
            </button>
          ) : (
            <>
              <button type="button" className="btn-outline btn-sm" onClick={() => setUnpaying([...selected.values()])}>Mark not paid</button>
              <button type="button" className="btn-primary btn-sm" onClick={markSelectedPaid}>
                <HiBadgeCheck className="w-4 h-4" aria-hidden="true" /> Mark paid
              </button>
            </>
          )}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <LoadingRegion label="Loading members"><SkeletonList count={6} /></LoadingRegion>
      ) : data.users.length === 0 ? (
        <EmptyState
          icon={HiUsers}
          title={approvalView ? 'No sign-ups waiting' : 'No members match'}
          description={approvalView
            ? 'New registrations appear here until an administrator approves them.'
            : hasFilters ? 'Try a different search or loosen the filters.' : 'Members will appear here once they register.'}
          action={hasFilters ? 'Clear filters' : undefined}
          onAction={() => showView({})}
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-subtle">
                <tr>
                  <th scope="col" className="pl-4 pr-0 py-3 w-8">
                    <input
                      type="checkbox"
                      className="rounded border-line-strong"
                      checked={allOnPageTicked}
                      disabled={!tickable.length}
                      onChange={togglePage}
                      aria-label="Tick every member on this page"
                    />
                  </th>
                  <th scope="col" className="px-4 py-3 font-medium">Member</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Reg. no.</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">Department</th>
                  {/* A sign-up has no role, membership or sign-in yet; when it registered matters instead. */}
                  {approvalView ? (
                    <th scope="col" className="px-4 py-3 font-medium">Registered</th>
                  ) : (
                    <>
                      <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">Role</th>
                      <th scope="col" className="px-4 py-3 font-medium">Membership</th>
                      <th scope="col" className="px-4 py-3 font-medium hidden xl:table-cell">Last sign-in</th>
                    </>
                  )}
                  <th scope="col" className="px-4 py-3 font-medium hidden sm:table-cell">Account</th>
                  <th scope="col" className="px-4 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((member) => {
                  const name = fullName(member);
                  const membership = membershipState(member);
                  const account = accountState(member);
                  const isSelf = member._id === currentUser?._id;
                  // Mirrors the API: only a full admin may act on another admin's account,
                  // and nobody can act on a superadmin's from the website.
                  const canAct = !isSelf && member.role !== 'superadmin' && (member.role !== 'admin' || isFullAdmin);

                  return (
                    <tr key={member._id} className="hover:bg-muted/40 transition-colors">
                      <td className="pl-4 pr-0 py-3">
                        {isTickable(member) && (
                          <input
                            type="checkbox"
                            className="rounded border-line-strong"
                            checked={selected.has(member._id)}
                            onChange={() => toggle(member)}
                            aria-label={`Tick ${name}`}
                          />
                        )}
                      </td>
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
                      {approvalView ? (
                        <td className="px-4 py-3 text-subtle whitespace-nowrap">
                          <time dateTime={member.createdAt} title={formatDateTime(member.createdAt)}>{relativeTime(member.createdAt)}</time>
                        </td>
                      ) : (
                        <>
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
                            {/* A cash payment at a meeting, say. Nobody marks their own membership. */}
                            {membership.id !== 'current' && !isSelf && member.isActive && member.role !== 'superadmin' && (
                              <button
                                type="button"
                                onClick={() => setPayingFor(member)}
                                className="block mt-1 text-xs font-medium text-primary-600 dark:text-primary-300 hover:underline"
                              >
                                Mark paid<span className="sr-only"> for {name}</span>
                              </button>
                            )}
                            {/* Put right a mistake: the wrong expiry, or the wrong person marked paid. */}
                            {membership.id === 'current' && !isSelf && (
                              <span className="flex flex-wrap gap-x-3 mt-1 text-xs font-medium">
                                <button type="button" onClick={() => setExpiryFor(member)} className="text-primary-600 dark:text-primary-300 hover:underline">
                                  Change expiry<span className="sr-only"> for {name}</span>
                                </button>
                                <button type="button" onClick={() => setUnpaying([member])} className="text-subtle hover:text-danger hover:underline">
                                  Mark not paid<span className="sr-only">: {name}</span>
                                </button>
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell text-subtle whitespace-nowrap">
                            {member.lastLoginAt
                              ? <time dateTime={member.lastLoginAt} title={formatDateTime(member.lastLoginAt)}>{relativeTime(member.lastLoginAt)}</time>
                              : 'Never'}
                          </td>
                        </>
                      )}
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`${account.badge} whitespace-nowrap`}>{account.label}</span>
                        {/* Only accounts that are not in use can go; the server keeps any with history. */}
                        {canAct && account.id !== 'active' && (
                          <button
                            type="button"
                            onClick={() => setDeleting(member)}
                            className="block mt-1 text-xs font-medium text-subtle hover:text-danger hover:underline"
                          >
                            Delete<span className="sr-only"> {name}&apos;s account</span>
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAct && account.id === 'active' && (
                          <button
                            type="button"
                            onClick={() => setPending(member)}
                            className="p-1.5 rounded-lg text-faint hover:text-danger hover:bg-danger-soft transition-colors"
                            aria-label={`Deactivate ${name}`}
                            title="Deactivate account"
                          >
                            <HiUserRemove className="w-4 h-4" aria-hidden="true" />
                          </button>
                        )}
                        {canAct && account.id === 'pending' && (
                          <button type="button" onClick={() => approve([member])} disabled={busy} className="btn-primary btn-sm">
                            Approve<span className="sr-only"> {name}</span>
                          </button>
                        )}
                        {canAct && account.id === 'deactivated' && (
                          <button type="button" onClick={() => setPending(member)} className="btn-outline btn-sm">
                            Restore
                          </button>
                        )}
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

      <MembershipDialog
        open={Boolean(payingFor)}
        member={payingFor}
        onClose={() => setPayingFor(null)}
        onSaved={() => { load(); loadSummary(); }}
      />

      <MembershipDialog
        open={Boolean(expiryFor)}
        member={expiryFor}
        title="Change membership expiry"
        onClose={() => setExpiryFor(null)}
        onSaved={() => { load(); loadSummary(); }}
      />

      <MarkUnpaidDialog members={unpaying} onClose={() => setUnpaying(null)} onDone={afterMembershipChange} />

      {bulk && (
        <BulkMembershipDialog
          scope={bulk.scope}
          description={bulk.description}
          onClose={() => setBulk(null)}
          onDone={afterMembershipChange}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        destructive
        title={`Delete ${deleting ? fullName(deleting) : ''}'s account?`}
        description={deleting?.pendingApproval
          ? 'The registration is removed for good, which frees its email address and registration number. Nothing is sent to them.'
          : 'The account is removed for good. An account with payments, orders, uploads or any other history cannot be deleted and stays deactivated.'}
        confirmLabel="Delete for good"
        busy={busy}
        onConfirm={applyDelete}
        onCancel={() => setDeleting(null)}
      />

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
