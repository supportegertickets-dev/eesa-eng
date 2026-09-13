'use client';

import { useCallback, useEffect, useRef } from 'react';
import { HiChevronLeft, HiChevronRight, HiX } from 'react-icons/hi';
import { cloudinaryImage } from '@/lib/images';

/**
 * Full-screen photo viewer with keyboard, button and swipe navigation.
 * `images` is an array of `{ url, alt }`; `index` is the open photo, or null.
 */
export default function Lightbox({ images = [], index, onClose, onIndexChange }) {
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  const open = index !== null && index !== undefined && images[index];
  const count = images.length;

  const go = useCallback((delta) => {
    if (!count) return;
    onIndexChange((index + delta + count) % count);
  }, [count, index, onIndexChange]);

  useEffect(() => {
    if (!open) return undefined;

    const previous = document.activeElement;
    closeRef.current?.focus();
    document.body.classList.add('overflow-hidden');

    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
      previous?.focus?.();
    };
  }, [open, onClose, go]);

  if (!open) return null;
  const image = images[index];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/90 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Photo viewer"
      onTouchStart={(e) => { touchStart.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchStart.current === null) return;
        const delta = e.changedTouches[0].clientX - touchStart.current;
        if (Math.abs(delta) > 50) go(delta < 0 ? 1 : -1);
        touchStart.current = null;
      }}
    >
      <div className="flex items-center justify-between px-4 py-3 text-white/90 text-sm">
        <span aria-live="polite">{index + 1} of {count}</span>
        <button ref={closeRef} type="button" onClick={onClose} className="p-2 rounded-full hover:bg-white/10" aria-label="Close photo viewer">
          <HiX className="w-6 h-6" aria-hidden="true" />
        </button>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-4 pb-6 min-h-0" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={cloudinaryImage(image.url, { width: 1920, crop: 'limit' })}
          alt={image.alt || ''}
          className="max-w-full max-h-full object-contain rounded-lg"
          onClick={(e) => e.stopPropagation()}
        />

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(-1); }}
              className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Previous photo"
            >
              <HiChevronLeft className="w-6 h-6" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); go(1); }}
              className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 p-2 sm:p-3 rounded-full bg-black/50 text-white hover:bg-black/70"
              aria-label="Next photo"
            >
              <HiChevronRight className="w-6 h-6" aria-hidden="true" />
            </button>
          </>
        )}
      </div>
    </div>
  );
}
