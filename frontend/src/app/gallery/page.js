'use client';

import { albumHref } from '@/lib/gallery';
import AlbumBrowser from '@/components/gallery/AlbumBrowser';

export default function PublicGalleryPage() {
  return (
    <div className="bg-canvas min-h-screen">
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4">Gallery</h1>
          <p className="text-lg sm:text-xl text-white/85 max-w-2xl mx-auto">
            Moments from EESA events, projects, competitions and campus life.
          </p>
        </div>
      </section>

      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-12">
        <AlbumBrowser hrefFor={albumHref} />
      </section>
    </div>
  );
}
