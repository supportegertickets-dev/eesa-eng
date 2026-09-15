'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { photoAspect } from '@/lib/gallery';
import GalleryImage from '@/components/gallery/GalleryImage';

// Photos added to the page at a time as the member scrolls.
const BATCH = 48;
const TILE_SIZES = '(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw';

const columnsFor = (width) => {
  if (width < 520) return 2;
  if (width < 900) return 3;
  return 4;
};

/**
 * Photos in columns at their natural proportions, with nothing cropped.
 *
 * CSS columns fill top to bottom, which scatters an album's order down the
 * page. Here each photo goes into whichever column is currently shortest, so
 * the order still reads left to right and the columns end level. Photos are
 * added in batches, so a 500-photo album does not create 500 images up front.
 */
export default function PhotoMasonry({ photos, onOpen, altFor }) {
  const containerRef = useRef(null);
  const sentinelRef = useRef(null);
  const [columns, setColumns] = useState(3);
  const [shown, setShown] = useState(BATCH);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => setColumns(columnsFor(entry.contentRect.width)));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const hasMore = shown < photos.length;

  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasMore) return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setShown((count) => count + BATCH);
    }, { rootMargin: '1200px 0px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, shown]);

  const layout = useMemo(() => {
    const heights = new Array(columns).fill(0);
    const result = Array.from({ length: columns }, () => []);
    photos.slice(0, shown).forEach((photo, index) => {
      const shortest = heights.indexOf(Math.min(...heights));
      result[shortest].push({ photo, index });
      heights[shortest] += 1 / photoAspect(photo);
    });
    return result;
  }, [photos, columns, shown]);

  return (
    <div>
      <div ref={containerRef} className="flex items-start gap-2 sm:gap-3">
        {layout.map((column, columnIndex) => (
          <ul key={columnIndex} className="flex-1 min-w-0 flex flex-col gap-2 sm:gap-3">
            {column.map(({ photo, index }) => (
              <li key={photo._id}>
                <button
                  type="button"
                  onClick={() => onOpen(index)}
                  className="group relative block w-full overflow-hidden rounded-lg
                    focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
                  aria-label={`Open ${altFor(photo, index)}`}
                >
                  <GalleryImage
                    url={photo.url}
                    aspect={photoAspect(photo)}
                    sizes={TILE_SIZES}
                    priority={index < 8}
                    imgClassName="group-hover:scale-[1.03]"
                  />
                  {photo.caption && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 px-3 pb-2.5 pt-8 bg-gradient-to-t from-black/75 to-transparent text-left text-sm text-white
                        line-clamp-2 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity"
                    >
                      {photo.caption}
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        ))}
      </div>
      {hasMore && <div ref={sentinelRef} className="h-px" aria-hidden="true" />}
    </div>
  );
}
