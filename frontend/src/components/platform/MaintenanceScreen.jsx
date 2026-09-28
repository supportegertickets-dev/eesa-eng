'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HiCog, HiRefresh } from 'react-icons/hi';
import { formatDateTime, relativeTime } from '@/lib/dates';

// While the site is closed, look again every minute so it opens by itself.
const RECHECK_MS = 60 * 1000;

/**
 * Shown in place of the whole site while it is in maintenance mode, to
 * everyone except the superadmin. The sign-in link stays, so the superadmin
 * can get in.
 */
export default function MaintenanceScreen({ status, onRetry }) {
  useEffect(() => {
    const interval = setInterval(() => onRetry?.(), RECHECK_MS);
    return () => clearInterval(interval);
  }, [onRetry]);

  const back = status?.expectedBackAt ? new Date(status.expectedBackAt) : null;

  return (
    <main id="main-content" className="min-h-screen flex items-center justify-center bg-canvas px-4 py-12">
      <div className="max-w-lg w-full text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="EESA" width={64} height={64} className="w-16 h-16 rounded-full object-cover mx-auto mb-6 shadow-card" />

        <div className="card" role="status">
          <span className="w-14 h-14 mx-auto rounded-full bg-warning-soft flex items-center justify-center">
            <HiCog className="w-7 h-7 text-warning" aria-hidden="true" />
          </span>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-strong mt-5">We&apos;ll be back soon</h1>
          <p className="text-muted-fg mt-3 whitespace-pre-line">{status?.message}</p>

          {back && (
            <p className="text-sm text-body mt-4">
              {back > new Date()
                ? <>Expected back <strong className="text-strong">{formatDateTime(back)}</strong> ({relativeTime(back)}).</>
                : 'We expect to be back any moment now.'}
            </p>
          )}

          <button type="button" onClick={() => onRetry?.()} className="btn-primary mt-6 inline-flex items-center gap-2">
            <HiRefresh className="w-4 h-4" aria-hidden="true" /> Check again
          </button>
          <p className="text-xs text-faint mt-4">This page checks again by itself every minute.</p>
        </div>

        <Link href="/login" className="inline-block mt-6 text-xs text-subtle hover:text-body hover:underline">
          Platform administrator? Sign in
        </Link>
      </div>
    </main>
  );
}
