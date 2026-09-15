import { cloudinaryImage } from '@/lib/images';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Title, description and preview image for a shared album link, so it shows a
 * proper card in WhatsApp, Slack and social posts. The page itself renders in
 * the browser; this runs on the server only to describe it.
 */
export async function generateMetadata({ params }) {
  try {
    const response = await fetch(`${API_URL}/gallery/albums/${encodeURIComponent(params.slug)}`, {
      next: { revalidate: 300 },
      // A sleeping API must not hold up the page.
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return { title: 'Gallery' };

    const { album } = await response.json();
    const count = album.photoCount || 0;
    const description = album.description || `${count} photo${count === 1 ? '' : 's'} from EESA.`;
    const image = album.cover?.url ? cloudinaryImage(album.cover.url, { width: 1200, height: 630 }) : null;
    const path = `/gallery/${album.slug}`;

    return {
      title: album.title,
      description,
      alternates: { canonical: path },
      openGraph: {
        type: 'website',
        title: album.title,
        description,
        url: path,
        ...(image && { images: [{ url: image, width: 1200, height: 630, alt: album.title }] }),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title: album.title,
        description,
        ...(image && { images: [image] }),
      },
    };
  } catch {
    return { title: 'Gallery' };
  }
}

export default function AlbumLayout({ children }) {
  return children;
}
