'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HiCash, HiCheckCircle, HiClock, HiExclamationCircle, HiIdentification, HiPhotograph } from 'react-icons/hi';
import { getMembershipCard, getPassportPhotos } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, relativeTime } from '@/lib/dates';
import { cloudinaryImage } from '@/lib/images';
import MembershipCardView from '@/components/membership/MembershipCardView';
import PassportUploader from '@/components/membership/PassportUploader';
import MemberCardsPanel from '@/components/membership/MemberCardsPanel';
import PhotoReviewQueue from '@/components/membership/PhotoReviewQueue';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const ADMIN_TABS = ['card', 'members', 'review'];

export default function MembershipCardPage() {
  const { isAdmin } = useAuth();
  const [tab, setTab] = useState('card');
  const [pendingCount, setPendingCount] = useState(0);

  // ?tab=members or ?tab=review opens that section, e.g. from a notification or Manage Members.
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    if (isAdmin && ADMIN_TABS.includes(requested)) setTab(requested);
  }, [isAdmin]);

  // The tab badge, before the queue itself has been opened.
  const refreshPending = useCallback(() => {
    getPassportPhotos('?status=pending&limit=1').then((data) => setPendingCount(data.pending || 0)).catch(() => {});
  }, []);

  useEffect(() => { if (isAdmin) refreshPending(); }, [isAdmin, refreshPending]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="page-title">Membership Card</h1>
        <p className="text-muted-fg mt-1">Your official EESA card, for paid-up members. Anyone can check it by scanning its QR code.</p>
      </div>

      {isAdmin && (
        <div role="tablist" aria-label="Membership card sections" className="flex flex-wrap gap-2 mb-6">
          {[
            { id: 'card', label: 'My card' },
            { id: 'members', label: 'Members\' cards' },
            { id: 'review', label: 'Photo reviews', count: pendingCount },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-colors
                ${tab === item.id ? 'bg-primary-500 text-white' : 'bg-muted text-body hover:bg-muted-strong'}`}
            >
              {item.label}
              {item.count > 0 && (
                <span className={`text-xs font-bold px-1.5 rounded-full ${tab === item.id ? 'bg-white/20' : 'bg-danger text-white'}`}>{item.count}</span>
              )}
            </button>
          ))}
        </div>
      )}

      {isAdmin && tab === 'review' ? (
        <PhotoReviewQueue onCountChange={setPendingCount} />
      ) : isAdmin && tab === 'members' ? (
        <MemberCardsPanel onReviewPhotos={() => setTab('review')} onChanged={refreshPending} />
      ) : (
        <MyCard />
      )}
    </div>
  );
}

function MyCard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [replacing, setReplacing] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getMembershipCard());
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) {
    return (
      <LoadingRegion label="Loading your card">
        <Skeleton className="h-16 w-full mb-6 rounded-xl" />
        <Skeleton className="aspect-[1012/638] w-full max-w-xl rounded-2xl" />
      </LoadingRegion>
    );
  }

  const { membership, photo, card } = data;
  const latest = photo.latest;
  const photoWaiting = latest?.status === 'pending';
  const photoRejected = latest?.status === 'rejected';

  const steps = [
    { label: 'Pay your subscription', done: membership.current, icon: HiCash },
    { label: 'Passport photo approved', done: Boolean(photo.approvedUrl), waiting: photoWaiting && !photo.approvedUrl, icon: HiPhotograph },
    { label: 'Card ready', done: Boolean(card), icon: HiIdentification },
  ];

  const afterUpload = () => { setReplacing(false); load(); };

  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-3" aria-label="Getting your card">
        {steps.map((step, index) => (
          <li
            key={step.label}
            className={`card p-4 flex items-center gap-3 ${step.done ? 'border-success/40' : ''}`}
            aria-current={!step.done && steps.slice(0, index).every((s) => s.done) ? 'step' : undefined}
          >
            <span className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0
              ${step.done ? 'bg-success-soft text-success' : step.waiting ? 'bg-warning-soft text-warning' : 'bg-muted text-faint'}`}
            >
              {step.done ? <HiCheckCircle className="w-5 h-5" aria-hidden="true" /> : step.waiting ? <HiClock className="w-5 h-5" aria-hidden="true" /> : <step.icon className="w-5 h-5" aria-hidden="true" />}
            </span>
            <span className="text-sm">
              <span className="block text-xs text-subtle">Step {index + 1}</span>
              <span className="font-medium text-strong">{step.label}</span>
              <span className="sr-only">{step.done ? ' (done)' : step.waiting ? ' (waiting for review)' : ' (to do)'}</span>
            </span>
          </li>
        ))}
      </ol>

      {!membership.current ? (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
          <span className="w-12 h-12 rounded-full bg-warning-soft flex items-center justify-center shrink-0">
            <HiExclamationCircle className="w-6 h-6 text-warning" aria-hidden="true" />
          </span>
          <div className="flex-1">
            <h2 className="font-semibold text-strong">
              {membership.paid && membership.expiresAt ? `Your membership expired on ${formatDate(membership.expiresAt)}` : 'Pay your semester subscription first'}
            </h2>
            <p className="text-sm text-muted-fg mt-1">
              {membership.paid
                ? 'Renew your subscription and your card becomes valid again with the same member number.'
                : 'Cards are issued to paid-up members. Once your payment is verified you can upload your passport photo here.'}
            </p>
          </div>
          <Link href="/portal/payments" className="btn-primary shrink-0">
            <HiCash className="w-4 h-4" aria-hidden="true" /> {membership.paid ? 'Renew membership' : 'Pay subscription'}
          </Link>
        </div>
      ) : null}

      {card && (
        <section aria-labelledby="card-heading" className="card">
          <div className="flex flex-wrap items-baseline justify-between gap-2 mb-4">
            <h2 id="card-heading" className="font-heading text-lg font-semibold text-strong">Your card</h2>
            <p className="text-sm text-subtle">Valid until {card.validUntil ? formatDate(card.validUntil) : 'the end of this semester'}</p>
          </div>
          <MembershipCardView card={card} />
        </section>
      )}

      {membership.current && photoWaiting && (
        <div className="card flex gap-4 items-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={cloudinaryImage(latest.url, { width: 140, height: 180 })} alt="Your submitted passport photo" className="w-20 aspect-[7/9] object-cover rounded-lg border border-line" />
          <div>
            <p className="badge-warning"><HiClock className="w-3.5 h-3.5" aria-hidden="true" /> Waiting for review</p>
            <p className="text-sm text-body mt-2">
              You sent {card ? 'a new' : 'your'} photo {relativeTime(latest.submittedAt)}. An administrator will check it and you will get a notification.
            </p>
          </div>
        </div>
      )}

      {membership.current && photoRejected && (
        <div className="card border-danger/40" role="alert">
          <h2 className="font-semibold text-strong">Your photo was not approved</h2>
          <p className="text-sm text-danger mt-1">{latest.rejectionReason}</p>
          <p className="text-sm text-muted-fg mt-1">Upload a new photo below.</p>
        </div>
      )}

      {membership.current && (!photo.approvedUrl && !photoWaiting ? (
        <section className="card" aria-labelledby="upload-heading">
          <h2 id="upload-heading" className="font-heading text-lg font-semibold text-strong mb-4">Upload your passport photo</h2>
          <PassportUploader onUploaded={afterUpload} />
        </section>
      ) : card && !photoWaiting && (
        replacing ? (
          <section className="card" aria-label="Replace your card photo">
            <PassportUploader replacing onUploaded={afterUpload} />
            <button type="button" className="btn-ghost btn-sm mt-4" onClick={() => setReplacing(false)}>Cancel</button>
          </section>
        ) : (
          <button type="button" className="btn-ghost" onClick={() => setReplacing(true)}>
            <HiPhotograph className="w-4 h-4" aria-hidden="true" /> Replace my card photo
          </button>
        )
      ))}
    </div>
  );
}
