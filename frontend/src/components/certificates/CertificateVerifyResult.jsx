'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { HiBadgeCheck, HiBan, HiQuestionMarkCircle } from 'react-icons/hi';
import { verifyCertificate } from '@/lib/api';
import { CERTIFICATE_TITLES, certificateDate } from '@/lib/certificates';
import VerifyForm from '@/components/membership/VerifyForm';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const OUTCOMES = {
  valid: {
    icon: HiBadgeCheck,
    tone: 'bg-success-soft text-success border-success/40',
    title: 'Genuine certificate',
    text: 'The Egerton Engineering Student Association issued this certificate. Check that the details below match it.',
  },
  revoked: {
    icon: HiBan,
    tone: 'bg-danger-soft text-danger border-danger/40',
    title: 'Certificate withdrawn',
    text: 'This certificate was revoked by the association and is no longer valid. Do not accept it.',
  },
};

const Detail = ({ label, children }) => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-subtle">{label}</dt>
    <dd className="text-body">{children}</dd>
  </div>
);

/** The public result of checking a certificate number. */
export default function CertificateVerifyResult({ number }) {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setError(null);
    verifyCertificate(number)
      .then((data) => { if (!cancelled) setResult(data); })
      .catch((err) => { if (!cancelled) setError(err); });
    return () => { cancelled = true; };
  }, [number]);

  const outcome = result && OUTCOMES[result.status];

  return (
    <section className="py-12 sm:py-16 bg-canvas min-h-[60vh]">
      <div className="max-w-xl mx-auto px-4 sm:px-6">
        <p className="text-sm text-subtle mb-2">Certificate check</p>
        <h1 className="page-title tracking-wide break-all">{number}</h1>

        <div className="mt-6" aria-live="polite">
          {!result && !error && (
            <LoadingRegion label="Checking the certificate">
              <Skeleton className="h-24 w-full rounded-xl mb-4" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </LoadingRegion>
          )}

          {error && (
            <div className="card border-line-strong flex gap-4 items-start" role="alert">
              <HiQuestionMarkCircle className="w-8 h-8 text-faint shrink-0" aria-hidden="true" />
              <div>
                <h2 className="font-semibold text-strong">{error.status === 404 ? 'No certificate found' : 'Could not check this certificate'}</h2>
                <p className="text-sm text-muted-fg mt-1">
                  {error.status === 404
                    ? 'The association has issued no certificate with this number. Check it against the certificate; one that does not verify may not be genuine.'
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

              {result.status === 'valid' && (
                <dl className="card mt-4 text-sm space-y-3">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-subtle">Awarded to</dt>
                    <dd className="font-semibold text-strong text-base">{result.recipientName}</dd>
                  </div>
                  <Detail label="Certificate">{CERTIFICATE_TITLES[result.type]}</Detail>
                  {result.type === 'leadership' ? (
                    <>
                      <Detail label="Office">{result.office}</Detail>
                      <Detail label="Term">{certificateDate(result.startDate)} to {certificateDate(result.endDate)}</Detail>
                    </>
                  ) : (
                    <Detail label="Academic year">{result.academicYear}</Detail>
                  )}
                  {result.department && <Detail label="Department">{result.department}</Detail>}
                  <Detail label="Issued">{certificateDate(result.issuedAt)}</Detail>
                </dl>
              )}
            </>
          )}
        </div>

        <div className="mt-10 pt-6 border-t border-line">
          <h2 className="text-sm font-semibold text-strong mb-3">Check another card or certificate</h2>
          <VerifyForm compact />
          <p className="form-hint mt-3">
            <Link href="/verify" className="underline hover:text-body">How verification works</Link>
          </p>
        </div>
      </div>
    </section>
  );
}
