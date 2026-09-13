'use client';

import { Toaster } from 'react-hot-toast';
import { useTheme } from '@/lib/ThemeContext';

/**
 * Toaster wired to the active theme.
 *
 * The toasts were hard-coded to a dark background, which looked like an error
 * banner in light mode and had no contrast against a dark page.
 */
export default function ToastHost() {
  const { isDark } = useTheme();

  return (
    <Toaster
      position="top-right"
      // Below the confirm dialog (z-60) so a toast never covers its buttons.
      containerClassName="!z-[55]"
      toastOptions={{
        duration: 4000,
        style: {
          background: isDark ? 'rgb(32 37 45)' : '#ffffff',
          color: isDark ? 'rgb(243 245 248)' : 'rgb(17 24 39)',
          border: `1px solid ${isDark ? 'rgb(45 52 62)' : 'rgb(229 231 235)'}`,
          borderRadius: '0.625rem',
          fontSize: '0.875rem',
          boxShadow: isDark
            ? '0 10px 15px -3px rgb(0 0 0 / 0.4)'
            : '0 10px 15px -3px rgb(15 23 42 / 0.12)',
        },
        success: { iconTheme: { primary: isDark ? '#4ade80' : '#15803d', secondary: isDark ? '#181c23' : '#ffffff' } },
        error: { iconTheme: { primary: isDark ? '#f87171' : '#b91c1c', secondary: isDark ? '#181c23' : '#ffffff' } },
      }}
    />
  );
}
