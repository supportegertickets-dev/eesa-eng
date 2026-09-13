'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiSearch, HiUserRemove, HiUsers } from 'react-icons/hi';
import { getUsers, updateUserRole, setUserStatus } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { ALL_ROLES, DEPARTMENTS, roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { Skeleton } from '@/components/ui/Skeleton';

const PAGE_SIZE = 20;

export default function MembersPage() {
  const { user: currentUser, isAdmin, isFullAdmin } = useAuth();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [department, setDepartment] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [pendingDeactivate, setPendingDeactivate] = useState(null);
  const [busy, setBusy] = useState(false);

  // Debounce typing so the directory is not re-queried on every keystroke.
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (department) params.set('department', department);
      if (search) params.set('search', search);
      const data = await getUsers(`?${params}`);
      setUsers(data.users || []);
      setTotal(data.total || 0);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, department, search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleRoleChange = async (member, role) => {
    try {
      const result = await updateUserRole(member._id, role);
      toast.success(result?.message || `${member.firstName} is now ${roleLabel(role)}.`);
      // Update in place rather than refetching, so the grid does not flash.
      setUsers((list) => list.map((u) => (u._id === member._id ? { ...u, role } : u)));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const confirmDeactivate = async () => {
    if (!pendingDeactivate) return;
    setBusy(true);
    try {
      const result = await setUserStatus(pendingDeactivate._id, false);
      toast.success(result?.message || 'Account deactivated.');
      setUsers((list) => list.filter((u) => u._id !== pendingDeactivate._id));
      setTotal((count) => Math.max(0, count - 1));
      setPendingDeactivate(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chipClass = (active) =>
    `px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
      active ? 'bg-primary-500 text-white' : 'bg-muted text-muted-fg hover:bg-muted-strong'
    }`;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Members directory</h1>
          <p className="text-muted-fg mt-1">
            {loading ? 'Loading members…' : `${total} active member${total === 1 ? '' : 's'}`}
          </p>
        </div>

        <label className="relative w-full sm:w-72">
          <span className="sr-only">Search members by name or username</span>
          <HiSearch className="w-5 h-5 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="search"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name or username"
            className="input-field pl-10"
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Filter by department">
        <button type="button" aria-pressed={!department} onClick={() => { setDepartment(''); setPage(1); }} className={chipClass(!department)}>
          All
        </button>
        {DEPARTMENTS.filter((d) => d !== 'Other').map((dept) => (
          <button
            key={dept}
            type="button"
            aria-pressed={department === dept}
            onClick={() => { setDepartment(dept); setPage(1); }}
            className={chipClass(department === dept)}
          >
            {dept.replace(' Engineering', '')}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={loadUsers} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card flex flex-col items-center gap-3">
              <Skeleton className="w-16 h-16 rounded-full" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : users.length === 0 ? (
        <EmptyState
          icon={HiUsers}
          title="No members found"
          description={search || department ? 'Try a different name or clear the department filter.' : 'Members will appear here once they register.'}
        />
      ) : (
        <>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {users.map((member) => {
              const fullName = [member.firstName, member.lastName].filter(Boolean).join(' ');
              const isSelf = member._id === currentUser?._id;
              // Only a full admin may change roles, and only a full admin may
              // act on another admin; the API enforces the same rules.
              const canEditRole = isFullAdmin && !isSelf;
              const canDeactivate = isAdmin && !isSelf && (member.role !== 'admin' || isFullAdmin);

              return (
                <li key={member._id} className="card text-center relative flex flex-col items-center">
                  {canDeactivate && (
                    <button
                      type="button"
                      onClick={() => setPendingDeactivate(member)}
                      className="absolute top-3 right-3 p-1.5 rounded-lg text-faint hover:text-danger hover:bg-danger-soft transition-colors"
                      aria-label={`Deactivate ${fullName}`}
                      title="Deactivate account"
                    >
                      <HiUserRemove className="w-4 h-4" aria-hidden="true" />
                    </button>
                  )}

                  <Avatar src={member.avatar} name={fullName} size="lg" className="mb-3" />
                  <h2 className="font-semibold text-strong">{fullName}</h2>
                  {member.username && <p className="text-xs text-subtle">@{member.username}</p>}
                  <p className="text-xs text-subtle mt-1">{member.department}</p>
                  <p className="text-xs text-faint">
                    {member.academicStatus === 'alumni' ? 'Alumni' : `Year ${member.yearOfStudy}`}
                  </p>

                  {canEditRole ? (
                    <label className="mt-3 w-full">
                      <span className="sr-only">Role for {fullName}</span>
                      <select
                        value={member.role}
                        onChange={(e) => handleRoleChange(member, e.target.value)}
                        className="input-field py-1.5 text-xs"
                      >
                        {ALL_ROLES.map((role) => (
                          <option key={role} value={role}>{roleLabel(role)}</option>
                        ))}
                      </select>
                    </label>
                  ) : member.role !== 'member' && (
                    <span className="badge-brand mt-3">{roleLabel(member.role)}</span>
                  )}

                  {member.bio && <p className="text-xs text-subtle mt-3 line-clamp-2">{member.bio}</p>}
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <nav className="flex justify-center items-center gap-4 mt-8" aria-label="Pagination">
              <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="btn-outline btn-sm">
                Previous
              </button>
              <span className="text-muted-fg text-sm">Page {page} of {totalPages}</span>
              <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="btn-outline btn-sm">
                Next
              </button>
            </nav>
          )}
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDeactivate)}
        title={`Deactivate ${pendingDeactivate?.firstName || 'this member'}?`}
        description="They will be signed out immediately and will not be able to sign in until an administrator restores the account."
        confirmLabel="Deactivate"
        busy={busy}
        onConfirm={confirmDeactivate}
        onCancel={() => setPendingDeactivate(null)}
      />
    </div>
  );
}
