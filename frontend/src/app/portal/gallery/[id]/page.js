'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiCalendar, HiExternalLink, HiPencil, HiShare, HiTrash } from 'react-icons/hi';
import { announceAlbumPhotos, deleteAlbum, getAlbum } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { absoluteUrl, albumHref, categoryLabel, formatAlbumDate, photoCountLabel, shareLink } from '@/lib/gallery';
import AlbumFormDialog from '@/components/gallery/AlbumFormDialog';
import AlbumPhotoViewer from '@/components/gallery/AlbumPhotoViewer';
import PhotoManager from '@/components/gallery/PhotoManager';
import PhotoUploader from '@/components/gallery/PhotoUploader';
import ActionMenu from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

const backLink = (
  <Link href="/portal/gallery" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong mb-4">
    <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> Gallery
  </Link>
);

export default function PortalAlbumPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { user, isAdmin, isLeadership } = useAuth();

  const [album, setAlbum] = useState(null);
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getAlbum(id);
      setAlbum(data.album);
      setPhotos(data.photos);
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const handleUploaded = useCallback((photo) => {
    setPhotos((current) => [...current, photo].sort((a, b) => a.position - b.position));
    setAlbum((current) => ({
      ...current,
      photoCount: (current.photoCount || 0) + 1,
      cover: current.cover?.url ? current.cover : { url: photo.url, width: photo.width, height: photo.height },
    }));
  }, []);

  const handleBatchComplete = useCallback(async (count) => {
    toast.success(`${photoCountLabel(count)} uploaded.`);
    try {
      const result = await announceAlbumPhotos(id);
      if (result?.sent) toast.success('Members have been emailed about the new photos.');
    } catch {
      // The photos are saved; a missed announcement is not worth an error.
    }
  }, [id]);

  const share = async () => {
    const result = await shareLink({ url: absoluteUrl(albumHref(album)), title: album.title });
    if (result === 'copied') toast.success('Album link copied.');
    else if (result === 'failed') toast.error('Could not copy the link.');
  };

  const confirmDeleteAlbum = async () => {
    setDeleting(true);
    try {
      await deleteAlbum(album._id);
      toast.success('Album deleted.');
      router.push('/portal/gallery');
    } catch (err) {
      toast.error(err.message);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <LoadingRegion label="Loading album">
        <Skeleton className="h-4 w-20 mb-6" />
        <Skeleton className="h-8 w-72 max-w-full mb-3" />
        <Skeleton className="h-4 w-48 mb-8" />
        <div className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, index) => <Skeleton key={index} className="aspect-square rounded-lg" />)}
        </div>
      </LoadingRegion>
    );
  }

  if (error || !album) {
    return (
      <div>
        {backLink}
        <ErrorState
          error={error}
          title={error?.status === 404 ? 'Album not found' : undefined}
          onRetry={error?.status === 404 ? undefined : load}
        />
      </div>
    );
  }

  const canDeleteAlbum = isAdmin || String(album.createdBy?._id || album.createdBy) === String(user?._id);
  const creator = [album.createdBy?.firstName, album.createdBy?.lastName].filter(Boolean).join(' ');

  return (
    <div>
      {backLink}

      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="badge-brand">{categoryLabel(album.category)}</span>
            {album.event && (
              <Link href={`/events/${album.event._id}`} className="badge-neutral hover:bg-muted-strong transition-colors">
                <HiCalendar className="w-3 h-3" aria-hidden="true" /> {album.event.title}
              </Link>
            )}
          </div>
          <h1 className="page-title break-words">{album.title}</h1>
          <p className="text-sm text-subtle mt-1">
            {[formatAlbumDate(album.date), photoCountLabel(photos.length), creator && `Created by ${creator}`].filter(Boolean).join(' · ')}
          </p>
          {album.description && <p className="text-body mt-3 max-w-3xl whitespace-pre-line">{album.description}</p>}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" onClick={share} className="btn-outline btn-sm">
            <HiShare className="w-4 h-4" aria-hidden="true" /> Share
          </button>
          {isLeadership && (
            <>
              <button type="button" onClick={() => setEditing(true)} className="btn-outline btn-sm">
                <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit details
              </button>
              <ActionMenu
                label="More album actions"
                actions={[
                  { label: 'View public page', icon: HiExternalLink, onClick: () => router.push(albumHref(album)) },
                  ...(canDeleteAlbum ? [{ label: 'Delete album', icon: HiTrash, danger: true, onClick: () => setConfirmingDelete(true) }] : []),
                ]}
              />
            </>
          )}
        </div>
      </div>

      {isLeadership ? (
        <div className="space-y-8">
          <PhotoUploader
            albumId={album._id}
            photoCount={photos.length}
            onUploaded={handleUploaded}
            onBatchComplete={handleBatchComplete}
          />
          <PhotoManager
            album={album}
            photos={photos}
            setPhotos={setPhotos}
            user={user}
            isAdmin={isAdmin}
            onAlbumChange={setAlbum}
          />
        </div>
      ) : (
        <AlbumPhotoViewer album={album} photos={photos} />
      )}

      <AlbumFormDialog
        open={editing}
        album={album}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          setAlbum(saved);
          setEditing(false);
        }}
      />

      <ConfirmDialog
        open={confirmingDelete}
        title={`Delete "${album.title}"?`}
        description={`The album and all ${photoCountLabel(photos.length)} in it will be permanently deleted, including from storage.`}
        confirmLabel="Delete album"
        busy={deleting}
        onConfirm={confirmDeleteAlbum}
        onCancel={() => setConfirmingDelete(false)}
      />
    </div>
  );
}
