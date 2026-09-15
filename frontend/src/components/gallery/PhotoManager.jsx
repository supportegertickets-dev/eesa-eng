'use client';

import { useCallback, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiArrowsExpand, HiCheck, HiCheckCircle, HiChevronDoubleLeft, HiChevronDoubleRight, HiChevronLeft, HiChevronRight,
  HiPencil, HiStar, HiTrash,
} from 'react-icons/hi';
import { deleteAlbumPhotos, reorderAlbumPhotos, updateAlbum } from '@/lib/api';
import { cloudinaryImage } from '@/lib/images';
import { absoluteUrl, albumHref, photoCountLabel, shareLink, toLightboxImages } from '@/lib/gallery';
import CaptionDialog from '@/components/gallery/CaptionDialog';
import ActionMenu from '@/components/ui/ActionMenu';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import Lightbox from '@/components/ui/Lightbox';

const sameId = (a, b) => Boolean(a && b) && String(a._id || a) === String(b._id || b);

/**
 * Organise an album: reorder by dragging or from each photo's menu, choose the
 * cover, caption photos, and delete one or many.
 *
 * A new order is staged until the leader saves it, so a stray drag is easy to
 * undo. Photos uploaded meanwhile join the end of the staged order.
 *
 * @param {Function} setPhotos state setter for the album's photos; accepts an updater
 */
export default function PhotoManager({ album, photos, setPhotos, user, isAdmin, onAlbumChange }) {
  const [order, setOrder] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [captionIndex, setCaptionIndex] = useState(null);
  const [viewIndex, setViewIndex] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const displayed = useMemo(() => {
    if (!order) return photos;
    const byId = new Map(photos.map((photo) => [photo._id, photo]));
    const staged = new Set(order);
    return [...order.map((id) => byId.get(id)).filter(Boolean), ...photos.filter((photo) => !staged.has(photo._id))];
  }, [order, photos]);

  const images = useMemo(() => toLightboxImages(album, displayed), [album, displayed]);

  const canDelete = (photo) => isAdmin || sameId(album.createdBy, user?._id) || sameId(photo.uploadedBy, user?._id);
  const deletable = displayed.filter(canDelete);
  const allSelected = deletable.length > 0 && deletable.every((photo) => selected.has(photo._id));
  const isCover = (photo) => (album.coverPhoto ? sameId(album.coverPhoto, photo._id) : photo.url === album.cover?.url);

  const moveTo = (id, target) => {
    const ids = displayed.map((photo) => photo._id);
    const from = ids.indexOf(id);
    if (from < 0) return;
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(target, ids.length)), 0, id);
    setOrder(ids);
  };

  const saveOrder = async () => {
    const ids = displayed.map((photo) => photo._id);
    setSavingOrder(true);
    try {
      const updated = await reorderAlbumPhotos(album._id, ids);
      const positions = new Map(ids.map((id, position) => [id, position]));
      setPhotos((current) => current
        .map((photo) => (positions.has(photo._id) ? { ...photo, position: positions.get(photo._id) } : photo))
        .sort((a, b) => a.position - b.position));
      onAlbumChange(updated);
      setOrder(null);
      toast.success('Photo order saved.');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSavingOrder(false);
    }
  };

  const setCover = async (photo) => {
    try {
      onAlbumChange(await updateAlbum(album._id, { coverPhoto: photo._id }));
      toast.success('Cover photo updated.');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggle = (id) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  const confirmDelete = async () => {
    const ids = pendingDelete;
    setDeleting(true);
    try {
      const result = await deleteAlbumPhotos(album._id, ids);
      const gone = new Set(ids);
      setPhotos((current) => current.filter((photo) => !gone.has(photo._id)));
      setSelected((current) => new Set([...current].filter((id) => !gone.has(id))));
      onAlbumChange(result.album);
      setPendingDelete(null);
      toast.success(`${photoCountLabel(result.deleted)} deleted.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const share = useCallback(async (image, index) => {
    const result = await shareLink({ url: absoluteUrl(`${albumHref(album)}?photo=${displayed[index]._id}`), title: album.title });
    if (result === 'copied') toast.success('Link to this photo copied.');
    else if (result === 'failed') toast.error('Could not share this photo.');
  }, [album, displayed]);

  const closeViewer = useCallback(() => setViewIndex(null), []);
  const closeCaption = useCallback(() => setCaptionIndex(null), []);

  if (!photos.length) return null;

  return (
    <section aria-labelledby="album-photos-heading">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <h2 id="album-photos-heading" className="font-heading text-lg font-semibold text-strong">{photoCountLabel(photos.length)}</h2>
          <p className="text-sm text-subtle" aria-live="polite">
            {selecting ? `${selected.size} selected` : 'Drag photos to reorder them, or use the menu on each photo.'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {selecting ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(allSelected ? new Set() : new Set(deletable.map((photo) => photo._id)))}
                className="btn-ghost btn-sm"
              >
                {allSelected ? 'Clear selection' : 'Select all'}
              </button>
              <button type="button" onClick={() => setPendingDelete([...selected])} disabled={!selected.size} className="btn-danger btn-sm">
                <HiTrash className="w-4 h-4" aria-hidden="true" /> Delete{selected.size ? ` ${selected.size}` : ''}
              </button>
              <button type="button" onClick={stopSelecting} className="btn-outline btn-sm">Done</button>
            </>
          ) : deletable.length > 0 && (
            <button type="button" onClick={() => setSelecting(true)} disabled={Boolean(order)} className="btn-outline btn-sm">
              <HiCheckCircle className="w-4 h-4" aria-hidden="true" /> Select
            </button>
          )}
        </div>
      </div>

      <ul className="grid grid-cols-2 min-[480px]:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-x-3 gap-y-4">
        {displayed.map((photo, index) => {
          const mayDelete = canDelete(photo);
          const checked = selected.has(photo._id);
          const cover = isCover(photo);
          const last = displayed.length - 1;

          const actions = [
            { label: 'View', icon: HiArrowsExpand, onClick: () => setViewIndex(index) },
            { label: photo.caption ? 'Edit caption' : 'Add caption', icon: HiPencil, onClick: () => setCaptionIndex(index) },
            ...(sameId(album.coverPhoto, photo._id) ? [] : [{ label: 'Set as cover', icon: HiStar, onClick: () => setCover(photo) }]),
            ...(index > 0 ? [
              { label: 'Move to start', icon: HiChevronDoubleLeft, onClick: () => moveTo(photo._id, 0) },
              { label: 'Move earlier', icon: HiChevronLeft, onClick: () => moveTo(photo._id, index - 1) },
            ] : []),
            ...(index < last ? [
              { label: 'Move later', icon: HiChevronRight, onClick: () => moveTo(photo._id, index + 1) },
              { label: 'Move to end', icon: HiChevronDoubleRight, onClick: () => moveTo(photo._id, last) },
            ] : []),
            ...(mayDelete ? [{ label: 'Delete', icon: HiTrash, danger: true, onClick: () => setPendingDelete([photo._id]) }] : []),
          ];

          return (
            <li
              key={photo._id}
              draggable={!selecting && !savingOrder}
              onDragStart={(e) => {
                setDragId(photo._id);
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', photo._id);
              }}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (overId !== photo._id) setOverId(photo._id);
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && dragId !== photo._id) moveTo(dragId, index);
                setDragId(null);
                setOverId(null);
              }}
              onDragEnd={() => {
                setDragId(null);
                setOverId(null);
              }}
              className={`relative rounded-lg transition-opacity ${dragId === photo._id ? 'opacity-40' : ''}`}
            >
              <button
                type="button"
                onClick={() => (selecting ? mayDelete && toggle(photo._id) : setViewIndex(index))}
                disabled={selecting && !mayDelete}
                aria-pressed={selecting ? checked : undefined}
                aria-label={selecting ? `Select photo ${index + 1}` : `View photo ${index + 1}`}
                className={`group block w-full aspect-square rounded-lg overflow-hidden bg-muted
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2
                  ${selecting && !mayDelete ? 'opacity-40 cursor-not-allowed' : ''}
                  ${checked ? 'ring-4 ring-primary-500' : ''}
                  ${overId === photo._id && dragId !== photo._id ? 'ring-2 ring-primary-500 ring-offset-2' : ''}`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cloudinaryImage(photo.url, { width: 360, height: 360 })}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  draggable={false}
                  className={`w-full h-full object-cover transition-transform duration-300 ${checked ? 'scale-90 rounded-md' : 'group-hover:scale-105'}`}
                />
              </button>

              {selecting && mayDelete && (
                <span
                  aria-hidden="true"
                  className={`absolute top-2 left-2 w-6 h-6 rounded-full border-2 flex items-center justify-center pointer-events-none
                    ${checked ? 'bg-primary-500 border-primary-500 text-white' : 'bg-black/30 border-white'}`}
                >
                  {checked && <HiCheck className="w-4 h-4" />}
                </span>
              )}

              {cover && !selecting && (
                <span className="absolute top-2 left-2 badge bg-accent-500 text-white shadow pointer-events-none">
                  <HiStar className="w-3 h-3" aria-hidden="true" /> Cover
                </span>
              )}

              {!selecting && (
                <div className="absolute top-1.5 right-1.5 rounded-lg bg-surface/90 backdrop-blur-sm shadow-card">
                  <ActionMenu label={`Actions for photo ${index + 1}`} actions={actions} />
                </div>
              )}

              <button
                type="button"
                onClick={() => setCaptionIndex(index)}
                disabled={selecting}
                className="mt-1.5 w-full text-left text-xs truncate rounded px-0.5 hover:text-strong disabled:pointer-events-none"
              >
                {photo.caption ? (
                  <span className="text-body">{photo.caption}</span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-faint">
                    <HiPencil className="w-3 h-3" aria-hidden="true" /> Add caption
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {order && (
        <div
          role="status"
          className="sticky bottom-20 lg:bottom-4 z-20 mt-6 card py-3 px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-overlay"
        >
          <p className="text-sm font-medium text-strong">You have changed the photo order.</p>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setOrder(null)} disabled={savingOrder} className="btn-ghost btn-sm">Discard</button>
            <button type="button" onClick={saveOrder} disabled={savingOrder} className="btn-primary btn-sm">
              {savingOrder ? 'Saving…' : 'Save order'}
            </button>
          </div>
        </div>
      )}

      <CaptionDialog
        photos={displayed}
        index={captionIndex}
        onIndexChange={setCaptionIndex}
        onClose={closeCaption}
        onSaved={(saved) => setPhotos((current) => current.map((photo) => (photo._id === saved._id ? { ...photo, caption: saved.caption } : photo)))}
      />

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={pendingDelete?.length > 1 ? `Delete ${pendingDelete.length} photos?` : 'Delete this photo?'}
        description="Deleted photos are removed from the album and from storage. This cannot be undone."
        confirmLabel="Delete"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <Lightbox images={images} index={viewIndex} onClose={closeViewer} onIndexChange={setViewIndex} onShare={share} />
    </section>
  );
}
