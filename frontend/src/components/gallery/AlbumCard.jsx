import Link from 'next/link';
import { HiPhotograph } from 'react-icons/hi';
import { categoryLabel, formatAlbumDate, photoCountLabel } from '@/lib/gallery';
import GalleryImage from '@/components/gallery/GalleryImage';

const CARD_SIZES = '(max-width: 480px) 100vw, (max-width: 1024px) 50vw, (max-width: 1280px) 33vw, 25vw';

export default function AlbumCard({ album, href, priority = false }) {
  const count = album.photoCount || 0;

  return (
    <Link
      href={href}
      className="group block h-full rounded-xl overflow-hidden bg-surface border border-line shadow-card hover:shadow-raised transition-shadow
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
    >
      <div className="relative">
        {album.cover?.url ? (
          <>
            <GalleryImage
              url={album.cover.url}
              aspect={4 / 3}
              sizes={CARD_SIZES}
              priority={priority}
              imgClassName="group-hover:scale-105"
            />
            <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/50 to-transparent pointer-events-none" aria-hidden="true" />
          </>
        ) : (
          <div className="aspect-[4/3] bg-muted flex flex-col items-center justify-center gap-2 text-faint">
            <HiPhotograph className="w-10 h-10" aria-hidden="true" />
            <span className="text-xs font-medium">No photos yet</span>
          </div>
        )}
        {count > 0 && (
          <span className="absolute bottom-2.5 right-2.5 badge bg-black/60 text-white backdrop-blur-sm" aria-hidden="true">
            <HiPhotograph className="w-3.5 h-3.5" /> {count}
          </span>
        )}
      </div>

      <div className="p-4">
        <h3 className="font-heading font-semibold text-strong leading-snug line-clamp-1 group-hover:text-primary-500 dark:group-hover:text-primary-300 transition-colors">
          {album.title}
        </h3>
        <p className="mt-1 text-sm text-subtle truncate">
          {[formatAlbumDate(album.date), categoryLabel(album.category)].filter(Boolean).join(' · ')}
          <span className="sr-only">, {photoCountLabel(count)}</span>
        </p>
      </div>
    </Link>
  );
}
