'use client';

import { useEffect, useRef, useState } from 'react';
import { HiPhotograph } from 'react-icons/hi';
import { cloudinaryImage, cloudinaryPlaceholder, cloudinarySrcSet } from '@/lib/images';

/**
 * A photo that holds its space while it loads: a blurred preview first, then
 * the sharp copy fades in, sized for the screen through `srcset`.
 *
 * @param {number} aspect width over height of the frame
 * @param {string} sizes how wide the frame is at each breakpoint, for `srcset`
 */
export default function GalleryImage({
  url,
  alt = '',
  aspect = 4 / 3,
  sizes = '100vw',
  priority = false,
  className = '',
  imgClassName = '',
}) {
  const imgRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const placeholder = cloudinaryPlaceholder(url);

  // A cached image can finish loading before React attaches onLoad.
  useEffect(() => {
    const img = imgRef.current;
    if (!img?.complete) setStatus('loading');
    else setStatus(img.naturalWidth ? 'loaded' : 'error');
  }, [url]);

  return (
    <div className={`relative overflow-hidden bg-muted ${className}`} style={{ aspectRatio: aspect }}>
      {placeholder && status !== 'loaded' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 scale-110 bg-cover bg-center blur-lg"
          style={{ backgroundImage: `url("${placeholder}")` }}
        />
      )}

      {status === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center text-faint">
          <HiPhotograph className="w-8 h-8" aria-hidden="true" />
          <span className="sr-only">This photo could not be loaded.</span>
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          ref={imgRef}
          src={cloudinaryImage(url, { width: 960, crop: 'limit' })}
          srcSet={cloudinarySrcSet(url)}
          sizes={sizes}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={`absolute inset-0 w-full h-full object-cover transition-[opacity,transform] duration-500
            ${status === 'loaded' ? 'opacity-100' : 'opacity-0'} ${imgClassName}`}
        />
      )}
    </div>
  );
}
