'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiCog, HiLockOpen, HiPlay, HiSearch, HiShieldCheck, HiUserAdd } from 'react-icons/hi';
import {
  getAdminMembers, getLockedAccounts, getPlatformAdmins, getPlatformJobs, runPlatformJob, unlockAccount, updateUserRole,
} from '@/lib/api';
import { formatDateTime, relativeTime } from '@/lib/dates';
import { isFullAdmin, roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';
import Section from '@/components/platform/Section';

const fullName = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ');

/** Who holds admin rights, accounts locked out, and the background jobs. */
export default function AccountsTab() {
  return (
    <div className="space-y-6">
      <AdminsSection />
      <LockedSection />
      <JobsSection />
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Admins
 * ------------------------------------------------------------------ */

const SEARCH_DELAY_MS = 300;

function AdminsSection() {
  const [admins, setAdmins] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [pending, setPending] = useState(null); // { member, role }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAdmins((await getPlatformAdmins()).admins);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2) {
      setResults([]);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ search: term, active: 'true', limit: '6' });
        const data = await getAdminMembers(`?${params}`);
        if (!cancelled) setResults(data.users.filter((user) => !isFullAdmin(user.role)));
      } catch {
        if (!cancelled) setResults([]);
      }
    }, SEARCH_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [search]);

  const confirmChange = async () => {
    setBusy(true);
    try {
      const result = await updateUserRole(pending.member._id, pending.role);
      toast.success(result?.message || 'Role changed.');
      setPending(null);
      setSearch('');
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const promoting = pending?.role === 'admin';

  return (
    <Section
      title="Admins"
      icon={HiShieldCheck}
      description="Everyone with full admin rights. Superadmins are granted and removed only on the server."
    >
      {error && <ErrorState title="Could not load the admins" error={error} onRetry={load} />}
      {!error && !admins && <SkeletonList count={2} />}

      {admins && (
        <ul className="divide-y divide-line -my-3">
          {admins.map((admin) => (
            <li key={admin._id} className="flex flex-wrap items-center gap-3 py-3">
              <Avatar src={admin.avatar} name={fullName(admin)} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-strong flex flex-wrap items-center gap-2">
                  <Link href={`/portal/admin/members/${admin._id}`} className="hover:text-primary-600 dark:hover:text-primary-300">{fullName(admin)}</Link>
                  <span className={admin.role === 'superadmin' ? 'badge-brand' : 'badge-neutral'}>{roleLabel(admin.role)}</span>
                  {!admin.isActive && <span className="badge-warning">Deactivated</span>}
                </p>
                <p className="text-xs text-muted-fg truncate">
                  {admin.email} · {admin.lastLoginAt ? `signed in ${relativeTime(admin.lastLoginAt)}` : 'never signed in'}
                </p>
              </div>
              {admin.role === 'admin' ? (
                <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setPending({ member: admin, role: 'member' })}>
                  Remove admin
                </button>
              ) : (
                <span className="text-xs text-subtle">Managed on the server</span>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 pt-5 border-t border-line">
        <label htmlFor="promote-search" className="form-label">Make someone an admin</label>
        <div className="relative">
          <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            id="promote-search"
            type="search"
            className="input-field pl-9"
            placeholder="Search by name, email or registration number"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        {results.length > 0 && (
          <ul className="mt-2 rounded-lg border border-line divide-y divide-line">
            {results.map((member) => (
              <li key={member._id} className="flex items-center gap-3 px-3 py-2">
                <Avatar src={member.avatar} name={fullName(member)} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-strong truncate">{fullName(member)}</p>
                  <p className="text-xs text-muted-fg truncate">{member.email} · {roleLabel(member.role)}</p>
                </div>
                <button type="button" className="btn-outline btn-sm" onClick={() => setPending({ member, role: 'admin' })}>
                  <HiUserAdd className="w-4 h-4" aria-hidden="true" /> Make admin
                </button>
              </li>
            ))}
          </ul>
        )}
        {search.trim().length >= 2 && !results.length && <p className="form-hint">No active member matches that, or they are already an admin.</p>}
      </div>

      <ConfirmDialog
        open={Boolean(pending)}
        title={promoting ? `Make ${pending && fullName(pending.member)} an admin?` : `Remove ${pending && fullName(pending.member)} as admin?`}
        description={promoting
          ? `They get full control of the association's side of EESA: members, roles, payments and content. ${pending?.member.role !== 'member' ? `They stop being ${roleLabel(pending?.member.role)}.` : ''}`
          : 'They become an ordinary member and lose all admin rights at once.'}
        confirmLabel={promoting ? 'Make admin' : 'Remove admin'}
        destructive={!promoting}
        busy={busy}
        onConfirm={confirmChange}
        onCancel={() => !busy && setPending(null)}
      />
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Locked accounts
 * ------------------------------------------------------------------ */

function LockedSection() {
  const [accounts, setAccounts] = useState(null);
  const [error, setError] = useState(null);
  const [unlocking, setUnlocking] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setAccounts((await getLockedAccounts()).accounts);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const unlock = async (account) => {
    setUnlocking(account._id);
    try {
      const result = await unlockAccount(account._id);
      toast.success(result.message);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setUnlocking(null);
    }
  };

  return (
    <Section
      title="Locked accounts"
      icon={HiLockOpen}
      description="Accounts locked for 15 minutes after repeated wrong passwords. Unlock one if you know it is really them."
      action={<button type="button" className="btn-ghost btn-sm" onClick={load}>Refresh</button>}
    >
      {error && <ErrorState title="Could not load locked accounts" error={error} onRetry={load} />}
      {!error && !accounts && <SkeletonList count={1} />}
      {accounts && !accounts.length && <p className="text-sm text-muted-fg">No account is locked right now.</p>}
      {accounts?.length > 0 && (
        <ul className="divide-y divide-line -my-3">
          {accounts.map((account) => (
            <li key={account._id} className="flex flex-wrap items-center gap-3 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-strong">{fullName(account)} <span className="text-xs text-subtle">({roleLabel(account.role)})</span></p>
                <p className="text-xs text-muted-fg">{account.email} · unlocks by itself {formatDateTime(account.lockedUntil)}</p>
              </div>
              <button type="button" className="btn-outline btn-sm" disabled={unlocking === account._id} onClick={() => unlock(account)}>
                {unlocking === account._id ? 'Unlocking…' : 'Unlock now'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/* ------------------------------------------------------------------ *
 * Background jobs
 * ------------------------------------------------------------------ */

function JobsSection() {
  const [jobs, setJobs] = useState([]);
  const [running, setRunning] = useState(null);

  useEffect(() => {
    getPlatformJobs().then((data) => setJobs(data.jobs)).catch(() => setJobs([]));
  }, []);

  const run = async (job) => {
    setRunning(job.key);
    try {
      const result = await runPlatformJob(job.key);
      toast.success(result.message, { duration: 6000 });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(null);
    }
  };

  return (
    <Section title="Background jobs" icon={HiCog} description="These run by themselves. Run one now if you need its result straight away.">
      <ul className="divide-y divide-line -my-3">
        {jobs.map((job) => (
          <li key={job.key} className="flex flex-wrap items-center gap-3 py-3">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-strong">{job.label}</p>
              <p className="text-sm text-muted-fg">{job.description}</p>
            </div>
            <button type="button" className="btn-outline btn-sm" disabled={Boolean(running)} onClick={() => run(job)}>
              <HiPlay className="w-4 h-4" aria-hidden="true" /> {running === job.key ? 'Running…' : 'Run now'}
            </button>
          </li>
        ))}
      </ul>
    </Section>
  );
}
