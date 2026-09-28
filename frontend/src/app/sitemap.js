import { DEPARTMENT_PROFILES, departmentPath } from '@/lib/departments';
import { albumHref } from '@/lib/gallery';
import { siteUrl } from '@/lib/site';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

// Rebuilt at most hourly, so new events, articles and albums are listed
// without a redeploy.
export const revalidate = 3600;

// A sleeping Render instance can take close to a minute to wake. The sitemap
// is rebuilt in the background, so waiting is cheap; giving up is not.
const REQUEST_TIMEOUT_MS = 45000;

// Enough for thousands of items per collection, well within the 50,000 URLs
// one sitemap may hold, while bounding the work if the API misreports pages.
const MAX_PAGES = 40;

/**
 * Public pages that always exist. The portal, sign-in and password pages and
 * individual card/certificate checks are left out: they are private or have
 * nothing for a search result to show.
 */
const STATIC_PATHS = [
  '/',
  '/about',
  '/departments',
  '/events',
  '/news',
  '/projects',
  '/gallery',
  '/merchandise',
  '/constitution',
  '/partner',
  '/register',
  '/contact',
  '/verify',
];

/** Every item in a paginated public list. */
async function fetchAll(path, key, limit) {
  const items = [];
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const response = await fetch(`${API_URL}${path}?page=${page}&limit=${limit}`, {
      next: { revalidate },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`${path} answered ${response.status}`);

    const data = await response.json();
    items.push(...(data[key] || []));
    if (page >= (data.totalPages || 0)) break;
  }
  return items;
}

/**
 * One collection's items, or none if the API cannot be reached. The static
 * pages are still worth publishing when the API is down; the next rebuild
 * picks the missing items up again.
 */
async function fetchOrSkip(path, key, limit) {
  try {
    return await fetchAll(path, key, limit);
  } catch (error) {
    console.warn(`Sitemap: leaving out ${path}: ${error.message}`);
    return [];
  }
}

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : undefined;
};

/** The most recent of the given dates, used as a listing page's last change. */
const newest = (dates) => dates.filter(Boolean).sort((a, b) => b - a)[0];

export default async function sitemap() {
  // The list endpoints already return only public events, published articles
  // and albums that have photos.
  const [events, articles, albums] = await Promise.all([
    fetchOrSkip('/events', 'events', 50),
    fetchOrSkip('/news', 'news', 50),
    fetchOrSkip('/gallery/albums', 'albums', 48),
  ]);

  const eventEntries = events.map((event) => ({
    url: siteUrl(`/events/${event._id}`),
    lastModified: toDate(event.updatedAt),
  }));
  const articleEntries = articles.map((article) => ({
    url: siteUrl(`/news/${article._id}`),
    lastModified: toDate(article.updatedAt || article.publishedAt),
  }));
  const albumEntries = albums
    .filter((album) => album.slug)
    .map((album) => ({ url: siteUrl(albumHref(album)), lastModified: toDate(album.updatedAt) }));

  // A listing changes whenever something in it does. Other static pages get
  // no date: a guessed one would teach Google to ignore the dates we give.
  const listingDates = {
    '/events': newest(eventEntries.map((entry) => entry.lastModified)),
    '/news': newest(articleEntries.map((entry) => entry.lastModified)),
    '/gallery': newest(albumEntries.map((entry) => entry.lastModified)),
  };

  const staticEntries = STATIC_PATHS.map((path) => ({
    url: siteUrl(path),
    lastModified: listingDates[path],
  }));
  const departmentEntries = DEPARTMENT_PROFILES.map(({ slug }) => ({ url: siteUrl(departmentPath(slug)) }));

  return [...staticEntries, ...departmentEntries, ...eventEntries, ...articleEntries, ...albumEntries];
}
