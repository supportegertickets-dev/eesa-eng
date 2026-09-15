'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  HiArrowLeft, HiBell, HiBookOpen, HiCalendar, HiCash, HiClipboardList, HiEye,
  HiPencil, HiPhotograph, HiShieldCheck, HiUserAdd, HiUserRemove,
} from 'react-icons/hi';
import { getAdminMember, setUserStatus } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, formatDateTime, relativeTime } from '@/lib/dates';
import { TYPE_LABELS } from '@/lib/library';
import {
  PROJECT_STATUS_LABELS, STATUS_BADGES, formatAmount, fullName, memberHref, membershipState,
} from '@/lib/members';
import EditMemberDialog from '@/components/members/EditMemberDialog';
import MemberHeader from '@/components/members/MemberHeader';
import MembershipDialog from '@/components/members/MembershipDialog';
import NotifyMemberDialog from '@/components/members/NotifyMemberDialog';
import RoleDialog from '@/components/members/RoleDialog';
import ActionMenu from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton, SkeletonList } from '@/components/ui/Skeleton';

const ELECTION_STATUS = { upcoming: 'Upcoming', active: 'Voting open', completed: 'Completed' };
const EVENT_STATUS = { upcoming: 'Upcoming', ongoing: 'Ongoing', completed: 'Completed', cancelled: 'Cancelled' };

const linkClass = 'text-primary-600 dark:text-primary-300 hover:underline';
const itemLinkClass = 'font-medium text-strong hover:text-primary-600 dark:hover:text-primary-300 break-words';

const backLink = (
  <Link href="/portal/admin/members" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong mb-4">
    <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> Manage members
  </Link>
);

const paymentMethodLabel = (payment) => (payment.paymentMethod === 'mpesa'
  ? ['M-Pesa', payment.mpesaReceiptNumber]
  : ['Manual', payment.reference]
).filter(Boolean).join(' · ');

function Section({ title, icon: Icon, action, children }) {
  return (
    <section className="card">
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading text-lg font-semibold text-strong flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary-500 dark:text-primary-300" aria-hidden="true" />}
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function InfoRow({ label, children }) {
  return (
    <div className="py-2.5 flex items-start justify-between gap-4">
      <dt className="text-subtle shrink-0">{label}</dt>
      <dd className="text-body text-right min-w-0 break-words">{children}</dd>
    </div>
  );
}

const Muted = ({ children }) => <span className="text-faint">{children}</span>;

function Stat({ icon: Icon, label, value }) {
  return (
    <div className="rounded-lg bg-muted/60 px-3 py-3">
      <Icon className="w-4 h-4 text-subtle" aria-hidden="true" />
      <p className="mt-2 text-xl font-heading font-bold text-strong tabular-nums">{value}</p>
      <p className="text-xs text-subtle">{label}</p>
    </div>
  );
}

function ActivityList({ title, note, empty, items, renderItem }) {
  return (
    <div className="min-w-0">
      <h3 className="text-sm font-semibold text-strong">{title}</h3>
      {note && <p className="text-xs text-subtle mt-0.5">{note}</p>}
      {items.length
        ? <ul className="divide-y divide-line mt-1">{items.map(renderItem)}</ul>
        : <p className="text-sm text-subtle mt-2">{empty}</p>}
    </div>
  );
}

/**
 * Everything an administrator needs to know about one member, with the actions
 * to manage them. Ballots are never shown: the API does not send them.
 */
export default function AdminMemberProfilePage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user: currentUser, isAdmin, isFullAdmin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);

  // After an action the page refreshes in place rather than flashing back to skeletons.
  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setData(await getAdminMember(id));
      setError(null);
    } catch (err) {
      if (quiet) toast.error(err.message);
      else setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  const refresh = useCallback(() => load({ quiet: true }), [load]);
  const closeDialog = useCallback(() => setDialog(null), []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Admin and Chairperson only.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <LoadingRegion label="Loading member">
        {backLink}
        <div className="card flex flex-col md:flex-row md:items-center gap-5">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <SkeletonList count={3} className="mt-6" />
      </LoadingRegion>
    );
  }

  if (error) {
    const notFound = error.status === 404 || error.status === 400;
    return (
      <div>
        {backLink}
        <ErrorState
          title={notFound ? 'Member not found' : undefined}
          error={notFound ? { message: 'This link does not match any member account.' } : error}
          onRetry={notFound ? undefined : () => load()}
        />
      </div>
    );
  }

  const { user: member, payments, paymentSummary, activity, nominations } = data;
  const name = fullName(member);
  const isSelf = currentUser?._id === member._id;
  // Mirrors the API: only a full admin may act on another admin's account.
  const canManage = !isSelf && (member.role !== 'admin' || isFullAdmin);
  const membership = membershipState(member);

  const confirmStatus = async () => {
    setBusy(true);
    try {
      const result = await setUserStatus(member._id, !member.isActive);
      toast.success(result?.message || 'Account updated.');
      setDialog(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const menuActions = [
    member.isActive && { label: 'View as members see it', icon: HiEye, onClick: () => router.push(memberHref(member._id)) },
    isFullAdmin && !isSelf && { label: 'Change role', icon: HiShieldCheck, onClick: () => setDialog('role') },
    canManage && {
      label: member.isActive ? 'Deactivate account' : 'Restore account',
      icon: member.isActive ? HiUserRemove : HiUserAdd,
      danger: member.isActive,
      onClick: () => setDialog('status'),
    },
  ].filter(Boolean);

  const headerActions = (
    <>
      {!isSelf && member.isActive && (
        <button type="button" className="btn-primary btn-sm" onClick={() => setDialog('notify')}>
          <HiBell className="w-4 h-4" aria-hidden="true" /> Notify
        </button>
      )}
      {canManage && (
        <button type="button" className="btn-outline btn-sm" onClick={() => setDialog('edit')}>
          <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit details
        </button>
      )}
      {menuActions.length > 0 && <ActionMenu label={`More actions for ${name}`} actions={menuActions} />}
    </>
  );

  const badges = (
    <>
      {!member.isActive && <span className="badge-danger">Deactivated</span>}
      {member.isLocked && <span className="badge-warning">Sign-in locked</span>}
    </>
  );

  const membershipLine = {
    current: member.membershipExpiry ? `Paid until ${formatDate(member.membershipExpiry)}` : 'Paid, with no expiry recorded',
    expired: `Expired on ${formatDate(member.membershipExpiry)}`,
    none: 'No membership payment recorded',
  }[membership.id];

  const { resourceCounts } = activity;

  return (
    <div>
      {backLink}
      <MemberHeader member={member} badges={badges} actions={headerActions} />

      {isSelf && (
        <p className="card py-3 mt-4 text-sm text-muted-fg">
          This is your own account. Changes to it must be made by another administrator.
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
        <div className="space-y-6">
          <Section title="Account & contact">
            <dl className="divide-y divide-line text-sm -my-2.5">
              <InfoRow label="Email">
                <a href={`mailto:${member.email}`} className={`${linkClass} break-all`}>{member.email}</a>
              </InfoRow>
              <InfoRow label="Phone">
                {member.phone
                  ? <a href={`tel:${member.phone.replace(/\s+/g, '')}`} className={linkClass}>{member.phone}</a>
                  : <Muted>Not provided</Muted>}
              </InfoRow>
              <InfoRow label="Reg. number">{member.regNumber || <Muted>Not provided</Muted>}</InfoRow>
              <InfoRow label="Username">{member.username ? `@${member.username}` : <Muted>Not set</Muted>}</InfoRow>
              <InfoRow label="Joined">{formatDate(member.createdAt)}</InfoRow>
              <InfoRow label="Last sign-in">
                {member.lastLoginAt
                  ? <time dateTime={member.lastLoginAt} title={formatDateTime(member.lastLoginAt)}>{relativeTime(member.lastLoginAt)}</time>
                  : <Muted>Never</Muted>}
              </InfoRow>
              <InfoRow label="Password changed">
                {member.passwordChangedAt ? formatDate(member.passwordChangedAt) : <Muted>Never</Muted>}
              </InfoRow>
            </dl>
          </Section>

          <Section
            title="Membership"
            icon={HiCash}
            action={!isSelf && (
              <button type="button" className="btn-ghost btn-sm" onClick={() => setDialog('membership')}>Update</button>
            )}
          >
            <div className="flex items-center gap-2">
              <span className={membership.badge}>{membership.label}</span>
              <p className="text-sm font-medium text-strong">{membershipLine}</p>
            </div>
            <dl className="divide-y divide-line text-sm mt-3 -mb-2.5">
              <InfoRow label="Total verified">{formatAmount(paymentSummary.verifiedAmount)}</InfoRow>
              <InfoRow label="Last payment">
                {member.lastPaymentDate ? formatDate(member.lastPaymentDate) : <Muted>None</Muted>}
              </InfoRow>
              <InfoRow label="Awaiting review">
                {paymentSummary.pending
                  ? <Link href="/portal/payments" className={linkClass}>{paymentSummary.pending} pending</Link>
                  : <Muted>None</Muted>}
              </InfoRow>
            </dl>
          </Section>

          <Section title="About">
            {member.bio
              ? <p className="text-sm text-body whitespace-pre-line break-words">{member.bio}</p>
              : <p className="text-sm text-subtle">No bio yet.</p>}
          </Section>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Section
            title="Payment history"
            icon={HiCash}
            action={<Link href="/portal/payments" className={`text-sm ${linkClass}`}>All payments</Link>}
          >
            {payments.length === 0 ? (
              <p className="text-sm text-subtle">No payments submitted yet.</p>
            ) : (
              <div className="overflow-x-auto -mx-6">
                <table className="w-full text-sm">
                  <thead className="text-left text-subtle border-b border-line">
                    <tr>
                      <th scope="col" className="pl-6 pr-3 py-2 font-medium">Date</th>
                      <th scope="col" className="px-3 py-2 font-medium">Type</th>
                      <th scope="col" className="px-3 py-2 font-medium text-right">Amount</th>
                      <th scope="col" className="px-3 py-2 font-medium hidden sm:table-cell">Method</th>
                      <th scope="col" className="pl-3 pr-6 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {payments.map((payment) => (
                      <tr key={payment._id}>
                        <td className="pl-6 pr-3 py-3 whitespace-nowrap text-body">{formatDate(payment.createdAt)}</td>
                        <td className="px-3 py-3 capitalize text-body">{payment.type}</td>
                        <td className="px-3 py-3 text-right tabular-nums text-strong whitespace-nowrap">{formatAmount(payment.amount)}</td>
                        <td className="px-3 py-3 hidden sm:table-cell text-subtle">{paymentMethodLabel(payment)}</td>
                        <td className="pl-3 pr-6 py-3">
                          <span className={`${STATUS_BADGES[payment.status] || 'badge-neutral'} capitalize`}>{payment.status}</span>
                          {payment.status === 'rejected' && payment.rejectionReason && (
                            <p className="text-xs text-subtle mt-1">{payment.rejectionReason}</p>
                          )}
                          {payment.status !== 'pending' && payment.verifiedBy && (
                            <p className="text-xs text-faint mt-1 whitespace-nowrap">by {fullName(payment.verifiedBy)}</p>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {paymentSummary.count > payments.length && (
              <p className="text-xs text-subtle mt-4">Showing the latest {payments.length} of {paymentSummary.count} payments.</p>
            )}
          </Section>

          <Section title="Activity" icon={HiClipboardList}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={HiCalendar} label="Events registered" value={activity.eventCount} />
              <Stat icon={HiCalendar} label="Events organised" value={activity.organisedEventCount} />
              <Stat icon={HiBookOpen} label="Approved uploads" value={resourceCounts.approved} />
              <Stat icon={HiPhotograph} label="Photos uploaded" value={activity.photoCount} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-8 mt-6">
              <ActivityList
                title="Recent events"
                empty="Has not registered for any events."
                items={activity.events}
                renderItem={(event) => (
                  <li key={event._id} className="py-2.5">
                    <Link href={`/events/${event._id}`} className={itemLinkClass}>{event.title}</Link>
                    <p className="text-xs text-subtle">{formatDate(event.date)} · {EVENT_STATUS[event.status] || event.status}</p>
                  </li>
                )}
              />

              <ActivityList
                title="Library uploads"
                note={`${resourceCounts.approved} approved · ${resourceCounts.pending} pending · ${resourceCounts.rejected} rejected`}
                empty="Has not uploaded anything."
                items={activity.resources}
                renderItem={(resource) => (
                  <li key={resource._id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-strong break-words">{resource.title}</p>
                      <p className="text-xs text-subtle">
                        {[resource.unitCode, TYPE_LABELS[resource.category], formatDate(resource.createdAt)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={`${STATUS_BADGES[resource.status] || 'badge-neutral'} capitalize shrink-0`}>{resource.status}</span>
                  </li>
                )}
              />

              <ActivityList
                title="Projects"
                empty="Not part of any projects."
                items={activity.projects}
                renderItem={(project) => (
                  <li key={project._id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link href="/projects" className={itemLinkClass}>{project.title}</Link>
                      <p className="text-xs text-subtle">{project.isLead ? 'Team lead' : 'Team member'}</p>
                    </div>
                    <span className="badge-neutral shrink-0">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
                  </li>
                )}
              />

              <ActivityList
                title="Articles"
                empty="Has not written any articles."
                items={activity.articles}
                renderItem={(article) => (
                  <li key={article._id} className="py-2.5 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {article.isPublished
                        ? <Link href={`/news/${article._id}`} className={itemLinkClass}>{article.title}</Link>
                        : <p className="font-medium text-strong break-words">{article.title}</p>}
                      <p className="text-xs text-subtle">{formatDate(article.publishedAt || article.createdAt)}</p>
                    </div>
                    {!article.isPublished && <span className="badge-neutral shrink-0">Draft</span>}
                  </li>
                )}
              />
            </div>
          </Section>

          <Section title="Elections" icon={HiShieldCheck}>
            {nominations.length === 0 ? (
              <p className="text-sm text-subtle">Has not stood in any election.</p>
            ) : (
              <ul className="divide-y divide-line -my-2.5">
                {nominations.map((nomination) => (
                  <li key={nomination._id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium text-strong">{nomination.position}</p>
                      <p className="text-sm text-muted-fg">
                        <Link href={`/portal/elections/${nomination.election._id}`} className={linkClass}>{nomination.election.title}</Link>
                        {' · '}{ELECTION_STATUS[nomination.election.status] || nomination.election.status}
                      </p>
                      <p className="text-xs text-subtle mt-0.5">
                        {nomination.nominatedBy === 'self' ? 'Self-nominated' : 'Added by an administrator'}
                        {nomination.appliedAt && ` on ${formatDate(nomination.appliedAt)}`}
                      </p>
                      {nomination.status === 'rejected' && nomination.rejectionReason && (
                        <p className="text-xs text-danger mt-1">{nomination.rejectionReason}</p>
                      )}
                    </div>
                    <span className={`${STATUS_BADGES[nomination.status] || 'badge-neutral'} capitalize shrink-0`}>{nomination.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="text-xs text-faint mt-5">Ballots are secret, so how a member voted is never shown.</p>
          </Section>
        </div>
      </div>

      <EditMemberDialog open={dialog === 'edit'} member={member} onClose={closeDialog} onSaved={refresh} />
      <MembershipDialog open={dialog === 'membership'} member={member} onClose={closeDialog} onSaved={refresh} />
      <NotifyMemberDialog open={dialog === 'notify'} member={member} onClose={closeDialog} />
      <RoleDialog open={dialog === 'role'} member={member} onClose={closeDialog} onSaved={refresh} />
      <ConfirmDialog
        open={dialog === 'status'}
        destructive={member.isActive}
        title={member.isActive ? `Deactivate ${member.firstName}?` : `Restore ${member.firstName}'s account?`}
        description={member.isActive
          ? 'They will be signed out immediately and cannot sign in until the account is restored.'
          : 'They will be able to sign in again straight away with their existing password.'}
        confirmLabel={member.isActive ? 'Deactivate' : 'Restore account'}
        busy={busy}
        onConfirm={confirmStatus}
        onCancel={closeDialog}
      />
    </div>
  );
}
