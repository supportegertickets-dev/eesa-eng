'use client';

import { useState } from 'react';

const SIZES = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-14 h-14 text-lg',
  xl: 'w-24 h-24 text-2xl',
};

/**
 * Derive initials without assuming either name is present.
 * `user.firstName[0]` threw whenever a record had an empty name.
 */
const initialsFor = (name = '') => {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};

/**
 * Profile picture with an initials fallback.
 *
 * Members can upload an avatar, but the sidebar and member lists only ever
 * rendered a single initial, so uploaded pictures were invisible outside the
 * profile page.
 */
/**
 * `tone="onBrand"` is for placement on the maroon bar, where the default maroon
 * initials disc would be the same colour as its background and vanish.
 */
export default function Avatar({ src, name, size = 'md', className = '', ring = false, tone = 'default' }) {
  const [failed, setFailed] = useState(false);
  const showImage = src && !failed;

  return (
    <span
      className={`${SIZES[size] || SIZES.md} shrink-0 inline-flex items-center justify-center
        rounded-full overflow-hidden font-semibold select-none
        ${showImage ? 'bg-muted' : tone === 'onBrand' ? 'bg-white/20 text-white ring-1 ring-white/40' : 'bg-primary-500 text-white'}
        ${ring ? 'ring-2 ring-surface' : ''} ${className}`}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={name ? `${name}'s profile picture` : 'Profile picture'}
          className="w-full h-full object-cover"
          loading="lazy"
          // A deleted or expired Cloudinary URL falls back to initials rather
          // than a broken-image icon.
          onError={() => setFailed(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsFor(name)}</span>
      )}
    </span>
  );
}
