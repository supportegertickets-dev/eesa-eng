'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api, { getProfile } from '@/lib/api';
import { LEADERSHIP_ROLES, POWER_ROLES } from '@/lib/roles';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  // Guards against several in-flight requests each firing their own sign-out
  // toast and redirect when a token expires.
  const signingOut = useRef(false);

  const clearSession = useCallback(() => {
    api.setToken(null);
    setUser(null);
  }, []);

  const logout = useCallback((options) => {
    // Called both as `logout()` and directly as an onClick handler, where the
    // first argument is a click event rather than options. Only treat a plain
    // object carrying `redirect` as configuration.
    const redirect = options && typeof options === 'object' && 'redirect' in options
      ? options.redirect
      : '/';

    clearSession();
    if (redirect) router.push(redirect);
  }, [clearSession, router]);

  /**
   * Called by the API client whenever the server rejects the session. Without
   * this, an expired token left every page showing its own error and the member
   * stuck in a portal they could not use.
   */
  const handleUnauthorized = useCallback(() => {
    if (signingOut.current) return;
    signingOut.current = true;

    const wasSignedIn = Boolean(api.getToken());
    clearSession();

    if (wasSignedIn) {
      toast.error('Your session has ended. Please sign in again.');
      const here = typeof window !== 'undefined' ? window.location.pathname : '';
      // Send the member back where they were once they sign in again.
      const next = here && here.startsWith('/portal') ? `?next=${encodeURIComponent(here)}` : '';
      router.push(`/login${next}`);
    }

    // Allow a later expiry in the same session to be handled again.
    setTimeout(() => { signingOut.current = false; }, 1000);
  }, [clearSession, router]);

  useEffect(() => {
    api.setUnauthorizedHandler(handleUnauthorized);
    return () => api.setUnauthorizedHandler(null);
  }, [handleUnauthorized]);

  useEffect(() => {
    let cancelled = false;

    const restore = async () => {
      if (!api.getToken()) {
        setLoading(false);
        return;
      }

      try {
        const profile = await getProfile();
        if (!cancelled) setUser(profile);
      } catch (error) {
        // A network failure must not discard a perfectly good token; only an
        // explicit rejection from the server should end the session.
        if (!cancelled && error.status && error.status !== 0 && error.status < 500) {
          clearSession();
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    restore();
    return () => { cancelled = true; };
  }, [clearSession]);

  const loginUser = useCallback((userData) => {
    const { token, ...profile } = userData;
    api.setToken(token);
    setUser(profile);
  }, []);

  /** Merge partial updates into the session user after a profile change. */
  const updateUser = useCallback((patch) => {
    setUser((current) => {
      if (!current) return current;
      const { token, ...rest } = patch || {};
      if (token) api.setToken(token);
      return { ...current, ...rest };
    });
  }, []);

  /** Re-read the profile from the server, e.g. after a payment is verified. */
  const refreshUser = useCallback(async () => {
    if (!api.getToken()) return null;
    try {
      const profile = await getProfile();
      setUser(profile);
      return profile;
    } catch {
      return null;
    }
  }, []);

  const value = useMemo(() => ({
    user,
    loading,
    loginUser,
    logout,
    setUser,
    updateUser,
    refreshUser,
    isAuthenticated: Boolean(user),
    isLeadership: Boolean(user && LEADERSHIP_ROLES.includes(user.role)),
    isAdmin: Boolean(user && POWER_ROLES.includes(user.role)),
    isFullAdmin: user?.role === 'admin',
  }), [user, loading, loginUser, logout, updateUser, refreshUser]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
