'use client';

import { useEffect, useId, useRef } from 'react';
import { HiX } from 'react-icons/hi';

const SIZES = {
  sm: 'sm:max-w-md',
  md: 'sm:max-w-lg',
  lg: 'sm:max-w-2xl',
  xl: 'sm:max-w-4xl',
};

/**
 * Dialog shell: backdrop, Escape to close, focus return and scroll lock.
 *
 * The body scrolls on its own so a long form keeps its title and actions in
 * view. On phones it rises from the bottom as a sheet.
 */
export default function Modal({
  open,
  title,
  description,
  onClose,
  busy = false,
  size = 'md',
  closeOnBackdrop = true,
  footer,
  children,
}) {
  const titleId = useId();
  const panelRef = useRef(null);
  // Held in refs so re-rendering the parent (every keystroke in a form) does
  // not re-run the effect and steal focus back to the panel.
  const closeRef = useRef(onClose);
  const busyRef = useRef(busy);
  closeRef.current = onClose;
  busyRef.current = busy;

  useEffect(() => {
    if (!open) return undefined;

    const previouslyFocused = document.activeElement;
    panelRef.current?.focus();
    document.body.classList.add('overflow-hidden');

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('overflow-hidden');
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center sm:p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={() => closeOnBackdrop && !busy && onClose?.()}
        aria-hidden="true"
      />

      <div
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`relative w-full ${SIZES[size] || SIZES.md} max-h-[92vh] flex flex-col bg-surface-raised border border-line
          shadow-overlay rounded-t-2xl sm:rounded-xl animate-fade-in focus:outline-none`}
      >
        <div className="flex items-start justify-between gap-4 px-5 sm:px-6 pt-5 pb-4 border-b border-line">
          <div className="min-w-0">
            <h2 id={titleId} className="font-heading text-lg font-semibold text-strong">{title}</h2>
            {description && <p className="mt-1 text-sm text-muted-fg">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="p-1.5 -m-1.5 rounded-lg text-subtle hover:text-strong hover:bg-muted transition-colors disabled:opacity-50"
            aria-label="Close"
          >
            <HiX className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 sm:px-6 py-5">{children}</div>

        {footer && (
          <div className="px-5 sm:px-6 py-4 border-t border-line flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
