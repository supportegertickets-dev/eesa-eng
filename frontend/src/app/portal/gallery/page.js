'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { HiPlus } from 'react-icons/hi';
import { useAuth } from '@/lib/AuthContext';
import { manageAlbumHref } from '@/lib/gallery';
import AlbumBrowser from '@/components/gallery/AlbumBrowser';
import AlbumFormDialog from '@/components/gallery/AlbumFormDialog';

export default function PortalGalleryPage() {
  const router = useRouter();
  const { isLeadership } = useAuth();
  const [creating, setCreating] = useState(false);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Gallery</h1>
          <p className="text-muted-fg mt-1">
            {isLeadership
              ? 'Create albums, upload photos in bulk and keep them organised.'
              : 'Photo albums from EESA events and activities.'}
          </p>
        </div>
        {isLeadership && (
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <HiPlus className="w-4 h-4" aria-hidden="true" /> New album
          </button>
        )}
      </div>

      <AlbumBrowser
        hrefFor={manageAlbumHref}
        includeEmpty={isLeadership}
        compact
        emptyAction={isLeadership ? 'Create the first album' : undefined}
        onEmptyAction={isLeadership ? () => setCreating(true) : undefined}
      />

      <AlbumFormDialog
        open={creating}
        album={null}
        onClose={() => setCreating(false)}
        onSaved={(album) => {
          setCreating(false);
          router.push(manageAlbumHref(album));
        }}
      />
    </div>
  );
}
