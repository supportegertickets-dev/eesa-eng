'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HiCog, HiSearch, HiUsers } from 'react-icons/hi';
import { getUsers } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { fullName, memberHref, studyLabel } from '@/lib/members';
import { DEPARTMENTS, roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import { Skeleton } from '@/components/ui/Skeleton';

const PAGE_SIZE = 20;

const DEPARTMENT_OPTIONS = [
  { id: '', label: 'All' },
  ...DEPARTMENTS.filter((dept) => dept !== 'Other').map((dept) => ({ id: dept, label: dept.replace(' Engineering', '') })),
];

/**
 * The members directory, the same for everyone. Account management lives on
 * its own page so this one stays a read-only way to find and get to know people.
 */
export default function MembersPage() {
  const { isAdmin } = useAuth();

  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [department, setDepartment] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');

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

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Members directory</h1>
          <p className="text-muted-fg mt-1">
            {loading ? 'Loading members…' : `${total} active member${total === 1 ? '' : 's'}`}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
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
          {isAdmin && (
            <Link href="/portal/admin/members" className="btn-outline whitespace-nowrap">
              <HiCog className="w-4 h-4" aria-hidden="true" /> Manage members
            </Link>
          )}
        </div>
      </div>

      <div className="mb-6">
        <FilterChips
          label="Filter by department"
          options={DEPARTMENT_OPTIONS}
          value={department}
          onChange={(value) => { setDepartment(value); setPage(1); }}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={loadUsers} />
      ) : loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" aria-busy="true">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card flex flex-col items-center gap-3">
              <Skeleton className="w-14 h-14 rounded-full" />
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
              const name = fullName(member);
              return (
                <li key={member._id}>
                  <Link
                    href={memberHref(member._id)}
                    className="card-interactive h-full flex flex-col items-center text-center hover:border-primary-300 dark:hover:border-primary-500/40
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    <Avatar src={member.avatar} name={name} size="lg" className="mb-3" />
                    <h2 className="font-semibold text-strong">{name}</h2>
                    {member.username && <p className="text-xs text-subtle">@{member.username}</p>}
                    <p className="text-xs text-subtle mt-1">{member.department}</p>
                    <p className="text-xs text-faint">{studyLabel(member)}</p>
                    {member.role !== 'member' && <span className="badge-brand mt-3">{roleLabel(member.role)}</span>}
                    {member.bio && <p className="text-xs text-subtle mt-3 line-clamp-2">{member.bio}</p>}
                  </Link>
                </li>
              );
            })}
          </ul>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} className="mt-8" />
        </>
      )}

      <p className="text-xs text-faint text-center mt-8">
        Email addresses, phone numbers and registration numbers are only visible to administrators.
      </p>
    </div>
  );
}
