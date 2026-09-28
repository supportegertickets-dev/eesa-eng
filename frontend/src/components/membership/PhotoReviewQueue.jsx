'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheck, HiX, HiIdentification } from 'react-icons/hi';
import { getPassportPhotos, reviewPassportPhoto } from '@/lib/api';
import { formatDate, relativeTime } from '@/lib/dates';
import { cloudinaryImage } from '@/lib/images';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonGrid } from '@/components/ui/Skeleton';

const FILTERS = [
  { id: 'pending', label: 'Waiting' },
  { id: 'approved', label: 'Approved' },
  { id: 'rejected', label: 'Not approved' },
];

// One tap for the reasons that come up most, so members get consistent advice.
const QUICK_REASONS = [
  'Your face is not clearly visible.',
  'The background is not plain.',
  'The photo is blurred or too dark.',
  'This is not a passport-style photo.',
  'Other people are in the photo.',
];

/** Administrators approve or reject passport photos before they go on cards. */
export default function PhotoReviewQueue({ onCountChange }) {
  const [status, setStatus] = useState('pending');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ photos: [], totalPages: 1, total: 0, pending: null });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await getPassportPhotos(`?status=${status}&page=${page}&limit=12`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { load(); }, [load]);

  // Keeps the tab badge in step with the queue.
  useEffect(() => { if (data.pending != null) onCountChange?.(data.pending); }, [data.pending, onCountChange]);

  const decide = async (photo, decision, why) => {
    setBusyId(photo._id);
    try {
      await reviewPassportPhoto(photo._id, decision === 'approved' ? { status: 'approved' } : { status: 'rejected', reason: why });
      toast.success(decision === 'approved' ? `Approved. ${photo.user?.firstName}'s card is ready.` : 'Photo returned to the member with your reason.');
      setRejecting(null);
      setReason('');
      // Take it off the queue without a reload, so the next photo moves up.
      setData((current) => ({
        ...current,
        photos: current.photos.filter((p) => p._id !== photo._id),
        total: Math.max(0, current.total - 1),
        pending: Math.max(0, current.pending - 1),
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const chips = FILTERS.map((filter) => (filter.id === 'pending' ? { ...filter, count: data.pending } : filter));

  return (
    <div>
      <div className="mb-4">
        <FilterChips label="Show photos" options={chips} value={status} onChange={(id) => { setStatus(id); setPage(1); }} />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <LoadingRegion label="Loading photos"><SkeletonGrid count={3} /></LoadingRegion>
      ) : data.photos.length === 0 ? (
        <EmptyState
          icon={HiIdentification}
          title={status === 'pending' ? 'No photos waiting' : 'Nothing here yet'}
          description={status === 'pending' ? 'Passport photos members send for their cards will appear here.' : undefined}
        />
      ) : (
        <>
          <ul className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {data.photos.map((photo) => {
              const member = photo.user || {};
              const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || 'Deleted member';
              return (
                <li key={photo._id} className="card p-4 flex gap-4">
                  <a href={photo.url} target="_blank" rel="noopener noreferrer" className="shrink-0" aria-label={`Open ${name}'s photo full size`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={cloudinaryImage(photo.url, { width: 210, height: 270 })}
                      alt={`Passport photo submitted by ${name}`}
                      className="w-28 aspect-[7/9] object-cover rounded-lg bg-muted border border-line"
                    />
                  </a>

                  <div className="min-w-0 flex-1 flex flex-col">
                    <div className="flex items-center gap-2">
                      <Avatar src={member.avatar} name={name} size="sm" />
                      <p className="font-semibold text-strong truncate">{name}</p>
                    </div>
                    <p className="text-xs text-subtle mt-1 truncate">{member.regNumber || 'No registration number'}</p>
                    <p className="text-xs text-subtle truncate">{member.department}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {photo.membershipCurrent
                        ? <span className="badge-success">Paid up</span>
                        : <span className="badge-warning">Not paid up</span>}
                      {member.memberNumber && <span className="badge-neutral font-mono">{member.memberNumber}</span>}
                    </div>
                    <p className="text-xs text-faint mt-2">
                      {status === 'pending'
                        ? `Sent ${relativeTime(photo.createdAt)}`
                        : `${status === 'approved' ? 'Approved' : 'Returned'} ${formatDate(photo.reviewedAt)}${photo.reviewedBy ? ` by ${photo.reviewedBy.firstName}` : ''}`}
                    </p>
                    {photo.rejectionReason && <p className="text-xs text-danger mt-1">{photo.rejectionReason}</p>}

                    {status === 'pending' && (
                      <div className="mt-auto pt-3 flex flex-wrap gap-2">
                        <button type="button" className="btn-primary btn-sm" disabled={busyId === photo._id} onClick={() => decide(photo, 'approved')}>
                          <HiCheck className="w-4 h-4" aria-hidden="true" /> Approve
                        </button>
                        <button type="button" className="btn-ghost btn-sm text-danger" disabled={busyId === photo._id} onClick={() => { setRejecting(photo); setReason(''); }}>
                          <HiX className="w-4 h-4" aria-hidden="true" /> Reject
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <Modal
        open={Boolean(rejecting)}
        title="Return this photo"
        description="The member sees your reason and can upload a better photo."
        onClose={() => setRejecting(null)}
        busy={Boolean(busyId)}
        size="sm"
        footer={(
          <>
            <button type="button" className="btn-ghost" onClick={() => setRejecting(null)} disabled={Boolean(busyId)}>Cancel</button>
            <button
              type="button"
              className="btn-danger"
              disabled={!reason.trim() || Boolean(busyId)}
              onClick={() => decide(rejecting, 'rejected', reason.trim())}
            >
              {busyId ? 'Sending…' : 'Return photo'}
            </button>
          </>
        )}
      >
        <div className="flex flex-wrap gap-2 mb-3">
          {QUICK_REASONS.map((text) => (
            <button key={text} type="button" className="badge-neutral hover:bg-muted-strong" onClick={() => setReason(text)}>
              {text}
            </button>
          ))}
        </div>
        <label htmlFor="reject-reason" className="form-label">Reason</label>
        <textarea
          id="reject-reason"
          className="input-field"
          rows={3}
          maxLength={300}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
