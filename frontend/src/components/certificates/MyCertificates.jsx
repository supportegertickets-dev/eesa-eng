'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiAcademicCap, HiBadgeCheck, HiChevronRight, HiIdentification } from 'react-icons/hi';
import { claimMembershipCertificate, getMyCertificates } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { isOffice } from '@/lib/roles';
import { CERTIFICATE_TITLES, certificateDate, certificateSubject } from '@/lib/certificates';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';
import CertificateDialog from '@/components/certificates/CertificateDialog';

/** The member's own certificates, and the membership years they can still claim. */
export default function MyCertificates() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [claiming, setClaiming] = useState('');
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getMyCertificates());
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const claim = async (year) => {
    setClaiming(year);
    try {
      const { certificate } = await claimMembershipCertificate(year);
      toast.success(`Your membership certificate for ${year} is ready.`);
      setOpen(certificate);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setClaiming('');
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <LoadingRegion label="Loading your certificates"><SkeletonList count={3} /></LoadingRegion>;

  const { certificates, membership } = data;
  const hasMembershipCertificate = certificates.some((c) => c.type === 'membership');
  const hasLeadershipCertificate = certificates.some((c) => c.type === 'leadership');

  return (
    <div className="space-y-8">
      <section aria-labelledby="membership-certificate-heading">
        <h2 id="membership-certificate-heading" className="font-heading text-lg font-semibold text-strong mb-3">Membership certificate</h2>
        {membership.available.length > 0 && membership.ready ? (
          <ul className="space-y-2">
            {membership.available.map((year) => (
              <li key={year} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
                  <HiIdentification className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-strong">Academic year {year}</span>
                  <span className="block text-sm text-muted-fg">
                    {year === membership.currentYear ? 'You are a paid-up member this year.' : 'You paid your subscription in this year.'}
                  </span>
                </span>
                <button type="button" className="btn-primary" onClick={() => claim(year)} disabled={Boolean(claiming)}>
                  {claiming === year ? 'Preparing…' : 'Get certificate'}
                </button>
              </li>
            ))}
          </ul>
        ) : membership.available.length > 0 ? (
          <p className="card p-4 text-sm text-muted-fg">
            Membership certificates will be available once the association has added the signatures printed on them. Please check again later.
          </p>
        ) : !hasMembershipCertificate ? (
          <div className="card p-4 text-sm text-muted-fg">
            A certificate of membership is available for each academic year you pay your subscription.{' '}
            <Link href="/portal/payments" className="font-medium text-primary-600 dark:text-primary-300 hover:underline">Pay your subscription</Link>
            {' '}and it will appear here once the payment is verified.
          </div>
        ) : (
          <p className="text-sm text-muted-fg">Your membership certificates are listed below. A new one becomes available each academic year you pay.</p>
        )}
      </section>

      <section aria-labelledby="my-certificates-heading">
        <h2 id="my-certificates-heading" className="font-heading text-lg font-semibold text-strong mb-3">Your certificates</h2>
        {certificates.length === 0 ? (
          <p className="text-sm text-muted-fg">No certificates yet.</p>
        ) : (
          <ul className="space-y-2">
            {certificates.map((certificate) => (
              <li key={certificate._id}>
                <button
                  type="button"
                  onClick={() => setOpen(certificate)}
                  className="card-interactive w-full p-4 flex items-center gap-3 text-left"
                >
                  <span className="w-11 h-11 rounded-xl bg-accent-500/15 flex items-center justify-center shrink-0">
                    {certificate.type === 'leadership'
                      ? <HiAcademicCap className="w-6 h-6 text-accent-600 dark:text-accent-400" aria-hidden="true" />
                      : <HiBadgeCheck className="w-6 h-6 text-accent-600 dark:text-accent-400" aria-hidden="true" />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-strong">{CERTIFICATE_TITLES[certificate.type]}</span>
                    <span className="block text-sm text-muted-fg truncate">{certificateSubject(certificate)}</span>
                    <span className="block text-xs text-subtle mt-0.5">No. {certificate.number} · issued {certificateDate(certificate.issuedAt)}</span>
                  </span>
                  <HiChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {isOffice(user?.role) && !hasLeadershipCertificate && (
          <p className="mt-4 text-sm text-muted-fg">
            Office holders receive a certificate of leadership from the administrator at the end of their term. It will appear here and you will be notified.
          </p>
        )}
      </section>

      <CertificateDialog certificate={open} onClose={() => setOpen(null)} />
    </div>
  );
}
