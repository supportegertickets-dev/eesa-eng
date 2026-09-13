'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { THEME_STORAGE_KEY as STORAGE_KEY } from '@/lib/themeScript';

const ThemeContext = createContext(null);

/**
 * Resolve a stored preference of "system" to the concrete theme the OS reports.
 */
const systemTheme = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';

const applyTheme = (resolved) => {
  const root = document.documentElement;
  root.classList.toggle('dark', resolved === 'dark');
  // Keeps the browser's own UI (form controls, scrollbars) in step.
  root.style.colorScheme = resolved;
};

export function ThemeProvider({ children }) {
  // Three states, not two: "system" must keep following the OS rather than
  // freezing at whatever it happened to be on first load.
  const [preference, setPreference] = useState('system');
  const [resolved, setResolved] = useState('light');

  // Read the stored choice once on mount. The inline script in the root layout
  // has already applied the correct class, so this only syncs React's state and
  // cannot cause a flash.
  useEffect(() => {
    let stored = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY);
    } catch {
      // Private browsing or blocked storage: fall back to following the system.
    }

    const initial = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
    setPreference(initial);
    setResolved(initial === 'system' ? systemTheme() : initial);
  }, []);

  // Follow the OS while the preference is "system".
  useEffect(() => {
    if (preference !== 'system') return undefined;

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setResolved(media.matches ? 'dark' : 'light');
    onChange();

    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [preference]);

  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const choose = useCallback((next) => {
    setPreference(next);
    setResolved(next === 'system' ? systemTheme() : next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // A failed write only means the choice will not survive a reload.
    }
  }, []);

  const toggle = useCallback(() => {
    choose(resolved === 'dark' ? 'light' : 'dark');
  }, [choose, resolved]);

  const value = useMemo(
    () => ({ preference, theme: resolved, isDark: resolved === 'dark', setTheme: choose, toggle }),
    [preference, resolved, choose, toggle]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
