'use client';

import { useCallback } from 'react';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { usePlatform } from '@/lib/PlatformContext';
import MaintenanceScreen from '@/components/platform/MaintenanceScreen';

// Still reachable during maintenance, so the superadmin can sign in.
const OPEN_PATHS = new Set(['/login']);

/**
 * Replaces the whole site with the maintenance screen while the platform is
 * in maintenance mode, for everyone but the superadmin. The API refuses their
 * requests regardless; this is what they see instead of a page of errors.
 */
export default function PlatformGate({ children }) {
  const { status, refresh } = usePlatform();
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const retry = useCallback(() => refresh({ force: true }), [refresh]);

  // While the session is still loading it may turn out to be the superadmin's.
  const lockedOut = status?.mode === 'maintenance'
    && !loading
    && user?.role !== 'superadmin'
    && !OPEN_PATHS.has(pathname);

  if (lockedOut) return <MaintenanceScreen status={status} onRetry={retry} />;
  return children;
}
