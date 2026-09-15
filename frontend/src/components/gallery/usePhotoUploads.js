'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { uploadAlbumPhoto } from '@/lib/api';
import { MAX_IMAGE_BYTES, validateImageFile } from '@/lib/images';
import { MAX_ALBUM_PHOTOS, MAX_SOURCE_IMAGE_BYTES, prepareImageForUpload } from '@/lib/gallery';

// Photos in flight at once. More gains little on a phone connection and
// competes with resizing for the device's memory.
const CONCURRENCY = 3;
const IN_PROGRESS = ['queued', 'preparing', 'uploading'];

let nextKey = 0;

/**
 * A queue that uploads photos into an album a few at a time.
 *
 * Each file is resized just before its turn, so a batch of hundreds never
 * holds more than a few decoded photos in memory. Every file has its own
 * progress and outcome: a failure can be retried without resending the rest.
 *
 * `onUploaded(photo)` runs as each photo is saved, and `onBatchComplete(count)`
 * once the queue empties with at least one success.
 */
export default function usePhotoUploads({ albumId, photoCount, onUploaded, onBatchComplete }) {
  const [items, setItems] = useState([]);
  const itemsRef = useRef(items);
  const running = useRef(0);
  const uploadedInBatch = useRef(0);
  const mounted = useRef(true);
  const latest = useRef({});
  latest.current = { albumId, photoCount, onUploaded, onBatchComplete };

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const actions = useMemo(() => {
    const commit = (update) => {
      itemsRef.current = update(itemsRef.current);
      setItems(itemsRef.current);
    };
    const patch = (key, changes) => commit((list) => list.map((item) => (item.key === key ? { ...item, ...changes } : item)));

    const upload = async (item) => {
      try {
        const file = await prepareImageForUpload(item.file);
        if (file.size > MAX_IMAGE_BYTES) throw new Error('This photo is still over 5MB after resizing. Try a smaller copy.');

        patch(item.key, { status: 'uploading', progress: 0, uploadSize: file.size });
        const form = new FormData();
        form.append('photo', file);
        const photo = await uploadAlbumPhoto(latest.current.albumId, form, (progress) => patch(item.key, { progress }));

        patch(item.key, { status: 'done', progress: 100, photo });
        uploadedInBatch.current += 1;
        latest.current.onUploaded?.(photo);
      } catch (error) {
        patch(item.key, { status: 'error', error: error.message || 'Upload failed.' });
      }
    };

    const pump = () => {
      // Leaving the page stops the queue; photos already in flight still finish.
      while (mounted.current && running.current < CONCURRENCY) {
        const next = itemsRef.current.find((item) => item.status === 'queued');
        if (!next) break;

        running.current += 1;
        patch(next.key, { status: 'preparing', error: '' });
        upload(next).finally(() => {
          running.current -= 1;
          if (running.current === 0 && !itemsRef.current.some((item) => item.status === 'queued')) {
            const count = uploadedInBatch.current;
            uploadedInBatch.current = 0;
            if (count) latest.current.onBatchComplete?.(count);
          }
          pump();
        });
      }
    };

    /** Queue files. Returns messages about any that were left out. */
    const add = (fileList) => {
      const files = Array.from(fileList || []);
      const problems = [];
      const accepted = [];
      const pending = itemsRef.current.filter((item) => IN_PROGRESS.includes(item.status)).length;
      const room = Math.max(0, MAX_ALBUM_PHOTOS - latest.current.photoCount - pending);

      for (const file of files) {
        // GIFs are sent as they are, so they must already fit the API's limit.
        const problem = validateImageFile(file, { maxBytes: file.type === 'image/gif' ? MAX_IMAGE_BYTES : MAX_SOURCE_IMAGE_BYTES });
        const duplicate = itemsRef.current.some((item) => item.file.name === file.name
          && item.file.size === file.size && item.file.lastModified === file.lastModified);

        if (problem) problems.push(problem);
        else if (duplicate) problems.push(`"${file.name}" is already in the list.`);
        else accepted.push(file);
      }

      if (accepted.length > room) {
        const left = accepted.length - room;
        problems.push(room
          ? `This album has room for ${room} more photo${room === 1 ? '' : 's'}, so ${left} ${left === 1 ? 'was' : 'were'} left out.`
          : `This album already holds the maximum of ${MAX_ALBUM_PHOTOS} photos. Start a new album for the rest.`);
        accepted.length = room;
      }

      if (accepted.length) {
        commit((list) => [...list, ...accepted.map((file) => ({ key: ++nextKey, file, status: 'queued', progress: 0, error: '' }))]);
        pump();
      }
      return problems;
    };

    const retry = (key) => {
      patch(key, { status: 'queued', progress: 0, error: '' });
      pump();
    };

    const retryFailed = () => {
      commit((list) => list.map((item) => (item.status === 'error' ? { ...item, status: 'queued', progress: 0, error: '' } : item)));
      pump();
    };

    const cancelQueued = () => commit((list) => list.filter((item) => item.status !== 'queued'));
    const remove = (key) => commit((list) => list.filter((item) => item.key !== key || ['preparing', 'uploading'].includes(item.status)));
    const clearFinished = () => commit((list) => list.filter((item) => IN_PROGRESS.includes(item.status)));

    return { add, retry, retryFailed, cancelQueued, remove, clearFinished };
  }, []);

  const stats = useMemo(() => {
    const count = (status) => items.filter((item) => item.status === status).length;
    const done = count('done');
    const failed = count('error');
    const queued = count('queued');
    const inFlight = items.filter((item) => item.status === 'preparing' || item.status === 'uploading');
    const partial = inFlight.reduce((sum, item) => sum + (item.progress || 0) / 100, 0);
    const total = items.length;

    return {
      total,
      done,
      failed,
      queued,
      busy: queued + inFlight.length > 0,
      progress: total ? Math.round(((done + failed + partial) / total) * 100) : 0,
    };
  }, [items]);

  // Closing the tab mid-batch would silently drop the rest.
  useEffect(() => {
    if (!stats.busy) return undefined;
    const warn = (event) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [stats.busy]);

  return { items, stats, ...actions };
}
