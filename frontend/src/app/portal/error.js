'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HiExclamationCircle, HiRefresh } from 'react-icons/hi';

/**
 * Portal-specific boundary, so a failure inside one portal page does not take
 * down the surrounding navigation.
 */
export default function PortalError({ error, reset }) {
  useEffect(() => {
    console.error('Portal error:', error);
  }, [error]);

  return (
    <div className="py-12 flex items-center justify-center">
      <div className="max-w-md w-full text-center">
        <span className="w-14 h-14 rounded-full bg-danger-soft flex items-center justify-center mx-auto mb-4">
          <HiExclamationCircle className="w-7 h-7 text-danger" aria-hidden="true" />
        </span>

        <h1 className="font-heading text-xl font-bold text-strong">This page could not load</h1>
        <p className="mt-2 text-sm text-muted-fg">
          Something went wrong while loading your portal. Try again, or return to the dashboard.
        </p>

        <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            <HiRefresh className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/portal" className="btn-outline">Back to dashboard</Link>
        </div>
      </div>
    </div>
  );
}
