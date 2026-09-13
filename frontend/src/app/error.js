'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { HiExclamationCircle, HiRefresh, HiHome } from 'react-icons/hi';

/**
 * Route-level error boundary.
 *
 * Without this file, any render error anywhere in the app showed Next.js's
 * unstyled default error screen in development and a blank page in production,
 * with no way back other than the browser's back button.
 */
export default function Error({ error, reset }) {
  useEffect(() => {
    // Kept for the browser console and any error reporter wired up later; the
    // message itself is never shown, since it can contain internal detail.
    console.error('Application error:', error);
  }, [error]);

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <span className="w-16 h-16 rounded-full bg-danger-soft flex items-center justify-center mx-auto mb-5">
          <HiExclamationCircle className="w-8 h-8 text-danger" aria-hidden="true" />
        </span>

        <h1 className="font-heading text-2xl font-bold text-strong">Something went wrong</h1>
        <p className="mt-2 text-muted-fg">
          This page ran into an unexpected problem. Trying again usually clears it.
        </p>

        {error?.digest && (
          <p className="mt-3 text-xs text-subtle">
            Reference: <code className="font-mono">{error.digest}</code>
          </p>
        )}

        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <button type="button" onClick={reset} className="btn-primary">
            <HiRefresh className="w-4 h-4" aria-hidden="true" />
            Try again
          </button>
          <Link href="/" className="btn-outline">
            <HiHome className="w-4 h-4" aria-hidden="true" />
            Go to home
          </Link>
        </div>
      </div>
    </div>
  );
}
