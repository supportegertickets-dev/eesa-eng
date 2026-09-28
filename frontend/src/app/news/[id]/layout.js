import { cloudinaryImage } from '@/lib/images';
import { NOINDEX, snippet } from '@/lib/site';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ');

/**
 * Title, description, canonical link and preview image for one article, so it
 * is indexed under its own headline and shows a proper card when shared. The
 * page itself renders in the browser; this runs on the server only to describe it.
 */
export async function generateMetadata({ params }) {
  const path = `/news/${params.id}`;
  // The canonical is set even when the API cannot answer. Without it the page
  // would inherit /news and be treated as a copy of the list.
  const fallback = { title: 'News', alternates: { canonical: path } };

  try {
    const response = await fetch(`${API_URL}/news/${encodeURIComponent(params.id)}`, {
      next: { revalidate: 300 },
      // A sleeping API must not hold up the page.
      signal: AbortSignal.timeout(5000),
    });
    // Drafts answer 404 too, so an unpublished article is never indexed.
    if (response.status === 404 || response.status === 400) return { ...fallback, robots: NOINDEX };
    if (!response.ok) return fallback;

    const article = await response.json();
    const description = snippet(article.excerpt || article.content) || undefined;
    const image = article.image ? cloudinaryImage(article.image, { width: 1200, height: 630 }) : null;
    const author = fullName(article.author);

    return {
      title: article.title,
      description,
      alternates: { canonical: path },
      ...(author && { authors: [{ name: author }] }),
      openGraph: {
        type: 'article',
        title: article.title,
        description,
        url: path,
        ...(article.publishedAt && { publishedTime: article.publishedAt }),
        ...(article.updatedAt && { modifiedTime: article.updatedAt }),
        ...(image && { images: [{ url: image, width: 1200, height: 630, alt: article.title }] }),
      },
      twitter: {
        card: image ? 'summary_large_image' : 'summary',
        title: article.title,
        description,
        ...(image && { images: [image] }),
      },
    };
  } catch {
    return fallback;
  }
}

export default function ArticleLayout({ children }) {
  return children;
}
