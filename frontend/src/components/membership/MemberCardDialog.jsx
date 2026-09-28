'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiCash, HiCheck, HiClock, HiExclamationCircle, HiPhotograph } from 'react-icons/hi';
import { getMemberCard, reviewPassportPhoto, uploadMemberPhoto } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, relativeTime } from '@/lib/dates';
import { cloudinaryImage } from '@/lib/images';
import MembershipDialog from '@/components/members/MembershipDialog';
import MembershipCardView from '@/components/membership/MembershipCardView';
import PassportUploader from '@/components/membership/PassportUploader';
import ErrorState from '@/components/ui/ErrorState';
import Modal from '@/components/ui/Modal';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

/**
 * An administrator's view of one member's card: mark an unpaid member as paid,
 * download or print the card, approve a photo that is waiting, or add a photo
 * for the member, which is approved at once. `onChanged` runs after anything
 * that changes the card.
 */
export default function MemberCardDialog({ userId, onClose, onChanged }) {
  const { user: currentUser } = useAuth();
  const [data, setData] = useState(null);
  const [markingPaid, setMarkingPaid] = useState(false);
  const [error, setError] = useState(null);
  const [changingPhoto, setChangingPhoto] = useState(false);
  const [approving, setApproving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getMemberCard(userId));
    } catch (err) {
      setError(err);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    setData(null);
    setChangingPhoto(false);
    load();
  }, [userId, load]);

  if (!userId) return null;

  const member = data?.member;
  const name = member ? [member.firstName, member.lastName].filter(Boolean).join(' ') : 'Member';
  const waiting = data?.photo.latest?.status === 'pending' ? data.photo.latest : null;

  const changed = (next) => {
    setData((current) => ({ ...current, ...next }));
    setChangingPhoto(false);
    onChanged?.();
  };

  const approve = async () => {
    setApproving(true);
    try {
      await reviewPassportPhoto(waiting._id, { status: 'approved' });
      toast.success(`Photo approved. ${member.firstName} has been told.`);
      await load();
      onChanged?.();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setApproving(false);
    }
  };

  return (
    <Modal open title={`${name}'s membership card`} description={member ? `${member.email}${member.regNumber ? ` · ${member.regNumber}` : ''}` : undefined} onClose={onClose} size="xl">
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingRegion label="Loading the card">
          <Skeleton className="aspect-[1012/638] w-full max-w-xl rounded-2xl" />
        </LoadingRegion>
      ) : (
        <div className="space-y-6">
          {!data.membership.current && (
            <div className="rounded-xl border border-warning/40 bg-warning-soft p-4 flex gap-3" role="status">
              <HiExclamationCircle className="w-6 h-6 text-warning shrink-0" aria-hidden="true" />
              <div className="text-sm">
                <p className="font-semibold text-strong">
                  {data.membership.paid && data.membership.expiresAt ? `Membership expired on ${formatDate(data.membership.expiresAt)}` : 'Not paid up'}
                </p>
                <p className="text-body mt-0.5">
                  Cards are only issued while the subscription is current.
                  {data.photo.approvedUrl ? ' The photo is on file, so the card appears as soon as the membership is paid.' : ' You can still add the photo now.'}
                </p>
                <div className="flex flex-wrap items-center gap-3 mt-3">
                  {/* Treasury records need a second person, so nobody marks their own membership paid. */}
                  {userId !== currentUser?._id && member?.isActive !== false && (
                    <button type="button" className="btn-primary btn-sm" onClick={() => setMarkingPaid(true)}>
                      <HiCash className="w-4 h-4" aria-hidden="true" /> Mark as paid
                    </button>
                  )}
                  <Link href={`/portal/admin/members/${userId}`} className="font-medium text-primary-600 dark:text-primary-300 hover:underline">
                    Open in Manage Members
                  </Link>
                </div>
              </div>
            </div>
          )}

          {data.card && <MembershipCardView card={data.card} />}

          {waiting && (
            <div className="rounded-xl border border-line p-4 flex flex-wrap items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryImage(waiting.url, { width: 140, height: 180 })} alt={`Photo ${name} sent for review`} className="w-20 aspect-[7/9] object-cover rounded-lg border border-line" />
              <div className="flex-1 min-w-[12rem]">
                <p className="badge-warning"><HiClock className="w-3.5 h-3.5" aria-hidden="true" /> Waiting for review</p>
                <p className="text-sm text-body mt-2">{member.firstName} sent this photo {relativeTime(waiting.submittedAt)}.</p>
              </div>
              <button type="button" className="btn-primary btn-sm" onClick={approve} disabled={approving}>
                <HiCheck className="w-4 h-4" aria-hidden="true" /> {approving ? 'Approving…' : 'Approve'}
              </button>
            </div>
          )}

          {!data.card && !waiting && data.photo.approvedUrl && !changingPhoto && (
            <div className="flex items-center gap-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryImage(data.photo.approvedUrl, { width: 140, height: 180 })} alt={`Approved photo of ${name}`} className="w-20 aspect-[7/9] object-cover rounded-lg border border-line" />
              <p className="text-sm text-muted-fg">Approved photo on file.</p>
            </div>
          )}

          {member?.isActive === false ? (
            <p className="text-sm text-danger">This account is deactivated, so its card is withdrawn.</p>
          ) : changingPhoto || (!data.photo.approvedUrl && !waiting) ? (
            <section className="rounded-xl border border-line p-4" aria-label="Add a photo">
              <PassportUploader
                upload={(form, onProgress) => uploadMemberPhoto(userId, form, onProgress)}
                heading={data.photo.approvedUrl ? `Replace ${member.firstName}'s card photo` : `Add ${member.firstName}'s passport photo`}
                note="As an administrator your photo is approved straight away, and the member is notified."
                submitLabel={data.membership.current ? 'Save and issue card' : 'Save photo'}
                successMessage={data.membership.current ? 'Photo saved. The card is ready.' : 'Photo saved.'}
                onUploaded={changed}
              />
              {changingPhoto && (
                <button type="button" className="btn-ghost btn-sm mt-3" onClick={() => setChangingPhoto(false)}>Cancel</button>
              )}
            </section>
          ) : (
            <button type="button" className="btn-ghost" onClick={() => setChangingPhoto(true)}>
              <HiPhotograph className="w-4 h-4" aria-hidden="true" /> {waiting ? 'Use a different photo instead' : 'Replace the card photo'}
            </button>
          )}
        </div>
      )}

      {member && (
        <MembershipDialog
          open={markingPaid}
          member={member}
          onClose={() => setMarkingPaid(false)}
          onSaved={() => { load(); onChanged?.(); }}
        />
      )}
    </Modal>
  );
}
