'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiCalendar, HiPencil, HiPhotograph, HiShare } from 'react-icons/hi';
import { getAlbum } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { cloudinaryImage } from '@/lib/images';
import {
  absoluteUrl, albumHref, categoryLabel, formatAlbumDate, manageAlbumHref, photoCountLabel, shareLink,
} from '@/lib/gallery';
import AlbumPhotoViewer from '@/components/gallery/AlbumPhotoViewer';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const heroButton = 'btn-sm btn bg-white/15 hover:bg-white/25 text-white backdrop-blur';

export default function AlbumPage({ params }) {
  const { slug } = params;
  const { isLeadership } = useAuth();

  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAlbum(slug);
      setAlbum(data.album);
      setPhotos(data.photos);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <LoadingRegion label="Loading album">
        <Skeleton className="h-64 sm:h-80 w-full rounded-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, index) => (
            <Skeleton key={index} className={`rounded-lg ${index % 3 === 0 ? 'aspect-[3/4]' : 'aspect-[4/3]'}`} />
          ))}
        </div>
      </LoadingRegion>
    );
  }

  if (error || !album) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href="/gallery" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong mb-6">
          <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> All albums
        </Link>
        <ErrorState
          error={error}
          title={error?.status === 404 ? 'Album not found' : undefined}
          onRetry={error?.status === 404 ? undefined : load}
        />
      </div>
    );
  }

  const share = async () => {
    const result = await shareLink({ url: absoluteUrl(albumHref(album)), title: album.title });
    if (result === 'copied') toast.success('Album link copied.');
    else if (result === 'failed') toast.error('Could not copy the link.');
  };

  const date = formatAlbumDate(album.date);

  return (
    <div className="bg-canvas">
      <section className="relative isolate overflow-hidden text-white">
        {album.cover?.url ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cloudinaryImage(album.cover.url, { width: 1920, height: 800 })}
              alt=""
              className="absolute inset-0 -z-10 w-full h-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/45 to-black/25" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800" />
        )}

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:pb-14 min-h-[16rem] sm:min-h-[22rem] flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <Link href="/gallery" className="inline-flex items-center gap-1 text-sm text-white/85 hover:text-white">
              <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> All albums
            </Link>
            <div className="flex gap-2">
              <button type="button" onClick={share} className={heroButton}>
                <HiShare className="w-4 h-4" aria-hidden="true" /> Share
              </button>
              {isLeadership && (
                <Link href={manageAlbumHref(album)} className={heroButton}>
                  <HiPencil className="w-4 h-4" aria-hidden="true" /> Manage
                </Link>
              )}
            </div>
          </div>

          <div className="mt-auto pt-10">
            <div className="flex flex-wrap gap-2 mb-3">
              <span className="badge bg-white/20 text-white backdrop-blur">{categoryLabel(album.category)}</span>
              {album.event && (
                <Link href={`/events/${album.event._id}`} className="badge bg-white/20 hover:bg-white/30 text-white backdrop-blur transition-colors">
                  <HiCalendar className="w-3 h-3" aria-hidden="true" /> {album.event.title}
                </Link>
              )}
            </div>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold leading-tight max-w-4xl break-words">{album.title}</h1>
            <p className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-white/90">
              {date && (
                <span className="inline-flex items-center gap-1.5">
                  <HiCalendar className="w-5 h-5" aria-hidden="true" /> {date}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5">
                <HiPhotograph className="w-5 h-5" aria-hidden="true" /> {photoCountLabel(photos.length)}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
        {album.description && (
          <p className="text-body text-lg leading-relaxed max-w-3xl mb-8 whitespace-pre-line">{album.description}</p>
        )}
        <AlbumPhotoViewer album={album} photos={photos} />
      </section>
    </div>
  );
}
