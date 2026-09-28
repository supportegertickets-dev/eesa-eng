import { cloudinaryImage } from '@/lib/images';
import { NOINDEX, snippet } from '@/lib/site';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

/**
 * Title, description, canonical link and preview image for one event, so it is
 * indexed under its own name and shows a proper card when shared. The page
 * itself renders in the browser; this runs on the server only to describe it.
 */
export async function generateMetadata({ params }) {
  const path = `/events/${params.id}`;
  // The canonical is set even when the API cannot answer. Without it the page
  // would inherit /events and be treated as a copy of the list.
  const fallback = { title: 'Event', alternates: { canonical: path } };

  try {
    const response = await fetch(`${API_URL}/events/${encodeURIComponent(params.id)}`, {
      next: { revalidate: 300 },
      // A sleeping API must not hold up the page.
      signal: AbortSignal.timeout(5000),
    });
    if (response.status === 404 || response.status === 400) return { ...fallback, robots: NOINDEX };
    if (!response.ok) return fallback;

    const event = await response.json();
    const description = snippet(event.description) || undefined;
    const image = event.image ? cloudinaryImage(event.image, { width: 1200, height: 630 }) : null;

    return {
      title: event.title,
      description,
      alternates: { canonical: path },
      // Private events open for anyone with the link but stay out of search.
      ...(event.isPublic === false && { robots: NOINDEX }),
      openGraph: {
        type: 'website',
        title: event.title,
        description,
        url: path,
        ...(image && { images: [{ url: image, width: 1200, height: 630, alt: event.title }] }),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title: event.title,
        description,
        ...(image && { images: [image] }),
      },
    };
  } catch {
    return fallback;
  }
}

export default function EventLayout({ children }) {
  return children;
}
