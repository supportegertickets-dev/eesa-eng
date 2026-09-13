'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiSearch, HiUsers } from 'react-icons/hi';
import { getAdminMembers, setUserStatus } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';

const FILTERS = [
  { value: 'false', label: 'Deactivated' },
  { value: 'true', label: 'Active' },
  { value: '', label: 'All' },
];

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Never';

/**
 * Account administration.
 *
 * Deactivated members disappear from the directory, and until now there was no
 * screen that could bring one back: restoring an account meant editing the
 * database by hand. This lists accounts by status and lets an administrator
 * deactivate or restore them.
 */
export default function AccountsPanel() {
  const { user: currentUser, isFullAdmin } = useAuth();

  const [status, setStatus] = useState('false');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ users: [], total: 0, totalPages: 1 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => { setSearch(searchInput.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (status) params.set('active', status);
      if (search) params.set('search', search);
      setData(await getAdminMembers(`?${params}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, status, search]);

  useEffect(() => { load(); }, [load]);

  const applyStatus = async () => {
    if (!pending) return;
    setBusy(true);
    try {
      const result = await setUserStatus(pending._id, !pending.isActive);
      toast.success(result?.message || 'Account updated.');
      setPending(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chip = (active) =>
    `px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
      active ? 'bg-primary-500 text-white' : 'bg-muted text-muted-fg hover:bg-muted-strong'
    }`;

  return (
    <div className="space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex gap-2" role="group" aria-label="Account status">
          {FILTERS.map((f) => (
            <button key={f.label} type="button" aria-pressed={status === f.value}
              onClick={() => { setStatus(f.value); setPage(1); }} className={chip(status === f.value)}>
              {f.label}
            </button>
          ))}
        </div>

        <label className="relative w-full sm:w-80">
          <span className="sr-only">Search accounts</span>
          <HiSearch className="w-5 h-5 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input type="search" value={searchInput} onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Name, email, username or reg. number" className="input-field pl-10" />
        </label>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <SkeletonList count={5} />
      ) : data.users.length === 0 ? (
        <EmptyState
          icon={HiUsers}
          title={status === 'false' ? 'No deactivated accounts' : 'No accounts found'}
          description={search ? 'Try a different search term.' : 'Accounts matching this filter will appear here.'}
        />
      ) : (
        <div className="card p-0 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-left text-subtle">
                <tr>
                  <th scope="col" className="px-4 py-3 font-medium">Member</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden md:table-cell">Role</th>
                  <th scope="col" className="px-4 py-3 font-medium hidden lg:table-cell">Last sign-in</th>
                  <th scope="col" className="px-4 py-3 font-medium">Status</th>
                  <th scope="col" className="px-4 py-3 font-medium text-right"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.users.map((account) => {
                  const name = [account.firstName, account.lastName].filter(Boolean).join(' ');
                  const isSelf = account._id === currentUser?._id;
                  const canAct = !isSelf && (account.role !== 'admin' || isFullAdmin);
                  return (
                    <tr key={account._id}>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <Avatar src={account.avatar} name={name} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium text-strong truncate">{name}</p>
                            <p className="text-xs text-subtle truncate">{account.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-body">{roleLabel(account.role)}</td>
                      <td className="px-4 py-3 hidden lg:table-cell text-subtle">{formatDate(account.lastLoginAt)}</td>
                      <td className="px-4 py-3">
                        <span className={account.isActive ? 'badge-success' : 'badge-danger'}>
                          {account.isActive ? 'Active' : 'Deactivated'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {canAct && (
                          <button type="button" onClick={() => setPending(account)}
                            className={account.isActive ? 'btn-ghost btn-sm text-danger' : 'btn-outline btn-sm'}>
                            {account.isActive ? 'Deactivate' : 'Restore'}
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
            <nav className="flex justify-between items-center px-4 py-3 border-t border-line text-sm" aria-label="Pagination">
              <span className="text-subtle">{data.total} accounts</span>
              <div className="flex items-center gap-3">
                <button type="button" className="btn-ghost btn-sm" disabled={page === 1} onClick={() => setPage((p) => p - 1)}>Previous</button>
                <span className="text-muted-fg">Page {page} of {data.totalPages}</span>
                <button type="button" className="btn-ghost btn-sm" disabled={page === data.totalPages} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </nav>
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
