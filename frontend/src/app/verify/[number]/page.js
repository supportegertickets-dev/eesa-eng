'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { HiBadgeCheck, HiClock, HiBan, HiQuestionMarkCircle } from 'react-icons/hi';
import { verifyMembership } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { cloudinaryImage } from '@/lib/images';
import VerifyForm from '@/components/membership/VerifyForm';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const OUTCOMES = {
  active: {
    icon: HiBadgeCheck,
    tone: 'bg-success-soft text-success border-success/40',
    title: 'Valid membership card',
    text: 'This member is paid up.',
  },
  expired: {
    icon: HiClock,
    tone: 'bg-warning-soft text-warning border-warning/40',
    title: 'Membership has expired',
    text: 'The card is genuine, but the subscription has not been renewed.',
  },
  revoked: {
    icon: HiBan,
    tone: 'bg-danger-soft text-danger border-danger/40',
    title: 'Card no longer valid',
    text: 'This card has been withdrawn. Do not accept it.',
  },
};

export default function VerifyResultPage() {
  const { number } = useParams();
  const memberNumber = decodeURIComponent(String(number || '')).toUpperCase();
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    verifyMembership(memberNumber)
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [memberNumber]);

  const outcome = result && OUTCOMES[result.status];

  return (
    <section className="py-12 sm:py-16 bg-canvas min-h-[60vh]">
      <div className="max-w-xl mx-auto px-4 sm:px-6">
        <p className="text-sm text-subtle mb-2">Membership card check</p>
        <h1 className="page-title tracking-wide break-all">{memberNumber}</h1>

        <div className="mt-6" aria-live="polite">
          {!result && !error && (
            <LoadingRegion label="Checking the card">
              <Skeleton className="h-24 w-full rounded-xl mb-4" />
              <Skeleton className="h-48 w-full rounded-xl" />
            </LoadingRegion>
          )}

          {error && (
            <div className="card border-line-strong flex gap-4 items-start" role="alert">
              <HiQuestionMarkCircle className="w-8 h-8 text-faint shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-strong">{error.status === 404 ? 'No card found' : 'Could not check this card'}</h2>
                <p className="text-sm text-muted-fg mt-1">
                  {error.status === 404
                    ? 'No EESA membership card has this number. Check it against the card; a card that does not verify may not be genuine.'
                    : error.message}
                </p>
              </div>
            </div>
          )}

          {outcome && (
            <>
              <div className={`rounded-xl border p-5 flex gap-4 items-start ${outcome.tone}`}>
                <outcome.icon className="w-9 h-9 shrink-0" aria-hidden="true" />
                <div>
                  <h2 className="font-heading text-lg font-bold">{outcome.title}</h2>
                  <p className="text-sm mt-0.5 opacity-90">{outcome.text}</p>
                </div>
              </div>

              {result.status !== 'revoked' && (
                <div className="card mt-4 flex gap-5 items-start">
                  {result.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={cloudinaryImage(result.photo, { width: 280, height: 360 })}
                      alt={`Photo on record for ${result.fullName}`}
                      className="w-28 sm:w-32 aspect-[7/9] object-cover rounded-lg border border-line shrink-0"
                    />
                  ) : null}
                  <dl className="text-sm space-y-2.5 min-w-0">
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-subtle">Name</dt>
                      <dd className="font-semibold text-strong text-base">{result.fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-subtle">Department</dt>
                      <dd className="text-body">{result.department}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-subtle">Study</dt>
                      <dd className="text-body">{result.academicStatus === 'alumni' ? 'Alumni' : `Year ${result.yearOfStudy}`}</dd>
                    </div>
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-subtle">{result.status === 'active' ? 'Valid until' : 'Expired on'}</dt>
                      <dd className="text-body">{result.validUntil ? formatDate(result.validUntil) : 'End of the current semester'}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-line">
          <h2 className="text-sm font-semibold text-strong mb-3">Check another card</h2>
          <VerifyForm compact />
          <p className="form-hint mt-3">
            <Link href="/verify" className="underline hover:text-body">How verification works</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
