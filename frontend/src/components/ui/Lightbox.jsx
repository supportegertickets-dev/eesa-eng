'use client';

import { useCallback, useEffect, useRef } from 'react';
import { HiChevronLeft, HiChevronRight, HiDownload, HiShare, HiX } from 'react-icons/hi';
import { cloudinaryImage, cloudinarySrcSet } from '@/lib/images';

const iconButton = 'p-2 rounded-full text-white/90 hover:text-white hover:bg-white/10 transition-colors';
const fullSize = (url) => cloudinaryImage(url, { width: 1920, crop: 'limit' });

/**
 * Full-screen photo viewer with keyboard, button and swipe navigation.
 *
 * `images` is an array of `{ url, alt, caption?, downloadUrl? }`; `index` is
 * the open photo, or null. Pass `onShare(image, index)` to offer sharing.
 */
export default function Lightbox({ images = [], index, onClose, onIndexChange, onShare }) {
  const closeRef = useRef(null);
  const touchStart = useRef(null);
  const open = index !== null && index !== undefined && Boolean(images[index]);
  const count = images.length;

  // Read through a ref, so a parent re-rendering with new callbacks does not
  // re-run the effect below and pull focus back to the close button.
  const latest = useRef({});
  latest.current = { index, count, onClose, onIndexChange };

  const go = useCallback((delta) => {
    const { index: current, count: total, onIndexChange: change } = latest.current;
    if (total > 1) change((current + delta + total) % total);
  }, []);

  useEffect(() => {
    if (!open) return undefined;

    const previous = document.activeElement;
    closeRef.current?.focus();
    document.body.classList.add('overflow-hidden');

    const onKey = (e) => {
      if (e.key === 'Escape') latest.current.onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    document.addEventListener('keydown', onKey);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.classList.remove('overflow-hidden');
      previous?.focus?.();
    };
  }, [open, go]);

  // Fetch the neighbouring photos in the background, so moving on is instant.
  useEffect(() => {
    if (!open || count < 2) return;
    for (const delta of [1, -1]) {
      const neighbour = images[(index + delta + count) % count];
      const preload = new Image();
      preload.sizes = '100vw';
      preload.srcset = cloudinarySrcSet(neighbour.url) || '';
      preload.src = fullSize(neighbour.url);
    }
  }, [open, index, count, images]);

  if (!open) return null;
  const image = images[index];

  return (
    <div
      className="fixed inset-0 z-[70] bg-black/95 flex flex-col"
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
      <div className="flex items-center justify-between gap-2 px-3 sm:px-4 py-2 text-white/90 text-sm">
        <span aria-live="polite" className="px-1 tabular-nums">{index + 1} of {count}</span>
        <div className="flex items-center gap-1">
          {onShare && (
            <button type="button" onClick={() => onShare(image, index)} className={iconButton} aria-label="Share this photo">
              <HiShare className="w-5 h-5" aria-hidden="true" />
            </button>
          )}
          {image.downloadUrl && (
            <a href={image.downloadUrl} download className={iconButton} aria-label="Download this photo">
              <HiDownload className="w-5 h-5" aria-hidden="true" />
            </a>
          )}
          <button ref={closeRef} type="button" onClick={onClose} className={iconButton} aria-label="Close photo viewer">
            <HiX className="w-6 h-6" aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="relative flex-1 flex items-center justify-center px-2 sm:px-16 min-h-0" onClick={onClose}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={image.url}
          src={fullSize(image.url)}
          srcSet={cloudinarySrcSet(image.url)}
          sizes="100vw"
          alt={image.alt || ''}
          className="max-w-full max-h-full object-contain rounded-sm select-none animate-fade-in"
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

      <div className="min-h-[3rem] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
        {image.caption && (
          <p className="text-white/90 text-sm sm:text-base max-w-3xl mx-auto whitespace-pre-line line-clamp-4">{image.caption}</p>
        )}
      </div>
    </div>
  );
}
