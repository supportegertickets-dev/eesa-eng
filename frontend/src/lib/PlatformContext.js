'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getPlatformStatus, PLATFORM_EVENT } from '@/lib/api';

/**
 * The platform's state as the superadmin has set it: maintenance or read-only
 * mode, switched-off features, the site announcement and any maintenance
 * coming up. Read from GET /api/platform/status on load, every few minutes,
 * when the tab comes back into view, and at once whenever the API refuses a
 * request because of it.
 *
 * `status` is null until the first answer. Pages render normally meanwhile:
 * the API enforces the rules, and this only explains them.
 */

// A whole campus shares one address, so the poll is unhurried; refusals from
// the API trigger an immediate re-read anyway.
const POLL_MS = 3 * 60 * 1000;
// Several requests refused together should cause one re-read, not a dozen.
const MIN_GAP_MS = 3000;

const PlatformContext = createContext({ status: null, refresh: () => {} });

export function PlatformProvider({ children }) {
  const [status, setStatus] = useState(null);
  const lastFetch = useRef(0);
  const inFlight = useRef(false);

  const refresh = useCallback(async ({ force = false } = {}) => {
    if (inFlight.current) return;
    if (!force && Date.now() - lastFetch.current < MIN_GAP_MS) return;
    inFlight.current = true;
    lastFetch.current = Date.now();
    try {
      setStatus(await getPlatformStatus());
    } catch {
      // Unreachable server: keep what we knew. The pages show their own errors.
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh({ force: true });
    const interval = setInterval(() => refresh(), POLL_MS);
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    const onSignal = () => refresh();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PLATFORM_EVENT, onSignal);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PLATFORM_EVENT, onSignal);
    };
  }, [refresh]);

  const value = useMemo(() => ({ status, refresh, setStatus }), [status, refresh]);
  return <PlatformContext.Provider value={value}>{children}</PlatformContext.Provider>;
}

export const usePlatform = () => useContext(PlatformContext);

/** The switched-off feature with this key, with its message, or null. */
export const pausedFeature = (status, key) => status?.disabledFeatures?.find((feature) => feature.key === key) || null;
