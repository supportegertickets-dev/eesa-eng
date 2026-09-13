'use client';

import { useEffect, useRef } from 'react';
import { HiExclamation } from 'react-icons/hi';

/**
 * Confirmation dialog for destructive actions.
 *
 * Replaces `window.confirm`, which cannot be styled, is blocked in some mobile
 * browsers, and gives no room to say what will actually happen.
 */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = true,
  busy = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);
  const previouslyFocused = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    // Return focus to whatever opened the dialog once it closes.
    previouslyFocused.current = document.activeElement;
    confirmRef.current?.focus();

    // Stop the page behind the dialog from scrolling.
    document.body.classList.add('overflow-hidden');

    const onKeyDown = (event) => {
      if (event.key === 'Escape' && !busy) onCancel?.();
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.classList.remove('overflow-hidden');
      previouslyFocused.current?.focus?.();
    };
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-[1px]"
        onClick={() => !busy && onCancel?.()}
        aria-hidden="true"
      />

      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby={description ? 'confirm-description' : undefined}
        className="relative w-full max-w-md bg-surface-raised rounded-xl shadow-overlay border border-line p-6 animate-fade-in"
      >
        <div className="flex gap-4">
          <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center
            ${destructive ? 'bg-danger-soft' : 'bg-info-soft'}`}
          >
            <HiExclamation
              className={`w-5 h-5 ${destructive ? 'text-danger' : 'text-info'}`}
              aria-hidden="true"
            />
          </span>

          <div className="flex-1">
            <h2 id="confirm-title" className="font-heading text-lg font-semibold text-strong">{title}</h2>
            {description && (
              <p id="confirm-description" className="mt-1.5 text-sm text-muted-fg">{description}</p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={destructive ? 'btn-danger' : 'btn-primary'}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
