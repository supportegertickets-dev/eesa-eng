'use client';

import { useEffect, useRef, useState } from 'react';
import { HiSun, HiMoon, HiDesktopComputer } from 'react-icons/hi';
import { useTheme } from '@/lib/ThemeContext';

const OPTIONS = [
  { value: 'light', label: 'Light', icon: HiSun },
  { value: 'dark', label: 'Dark', icon: HiMoon },
  { value: 'system', label: 'System', icon: HiDesktopComputer },
];

/**
 * Light / dark / system switcher.
 *
 * Offers "system" as a first-class choice rather than a two-way toggle, so the
 * site can follow the device without the member having to change it twice a day.
 */
export default function ThemeToggle({ onLight = false, className = '' }) {
  const { preference, theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const containerRef = useRef(null);

  // The server cannot know the viewer's theme, so the icon is only rendered
  // after mount to avoid a hydration mismatch.
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return undefined;

    const onPointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const active = OPTIONS.find((option) => option.value === preference) || OPTIONS[2];
  const CurrentIcon = mounted ? (theme === 'dark' ? HiMoon : HiSun) : HiSun;

  const triggerStyle = onLight
    ? 'text-body hover:bg-muted'
    : 'text-white/90 hover:bg-white/15';

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`p-2 rounded-lg transition-colors ${triggerStyle}`}
        aria-label={`Theme: ${active.label}. Change theme`}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <CurrentIcon className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Theme"
          className="absolute right-0 mt-2 w-40 rounded-lg bg-surface-raised border border-line shadow-overlay py-1 z-50 animate-fade-in"
        >
          {OPTIONS.map(({ value, label, icon: Icon }) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={preference === value}
              onClick={() => { setTheme(value); setOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 text-sm transition-colors
                ${preference === value
                  ? 'text-primary-500 dark:text-primary-300 font-medium bg-primary-500/10'
                  : 'text-body hover:bg-muted'}`}
            >
              <Icon className="w-4 h-4" aria-hidden="true" />
              {label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
