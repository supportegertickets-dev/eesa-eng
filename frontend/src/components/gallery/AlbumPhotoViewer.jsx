'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { HiPhotograph } from 'react-icons/hi';
import { absoluteUrl, albumHref, shareLink, toLightboxImages } from '@/lib/gallery';
import PhotoMasonry from '@/components/gallery/PhotoMasonry';
import EmptyState from '@/components/ui/EmptyState';
import Lightbox from '@/components/ui/Lightbox';

/**
 * An album's photos with the full-screen viewer.
 *
 * The open photo is kept in the address bar as ?photo=<id>, so a link to one
 * photo can be shared, and refreshing reopens it.
 */
export default function AlbumPhotoViewer({ album, photos }) {
  const [index, setIndex] = useState(null);
  const images = useMemo(() => toLightboxImages(album, photos), [album, photos]);

  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('photo');
    const found = wanted ? photos.findIndex((photo) => photo._id === wanted) : -1;
    if (found >= 0) setIndex(found);
    // Only on arrival; afterwards the viewer drives the address bar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = index === null ? null : photos[index]?._id || null;
    if ((params.get('photo') || null) === id) return;
    if (id) params.set('photo', id);
    else params.delete('photo');
    const query = params.toString();
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
  }, [index, photos]);

  const share = useCallback(async (image, photoIndex) => {
    const url = absoluteUrl(`${albumHref(album)}?photo=${photos[photoIndex]._id}`);
    const result = await shareLink({ url, title: album.title });
    if (result === 'copied') toast.success('Link to this photo copied.');
    else if (result === 'failed') toast.error('Could not share this photo.');
  }, [album, photos]);

  const close = useCallback(() => setIndex(null), []);

  if (!photos.length) {
    return (
      <EmptyState
        icon={HiPhotograph}
        title="No photos in this album yet"
        description="Photos will appear here as soon as they are added."
      />
    );
  }

  return (
    <>
      <PhotoMasonry photos={photos} onOpen={setIndex} altFor={(photo, photoIndex) => images[photoIndex].alt} />
      <Lightbox images={images} index={index} onClose={close} onIndexChange={setIndex} onShare={share} />
    </>
  );
}
