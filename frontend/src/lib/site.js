/**
 * The site's public address, without a trailing slash.
 *
 * Canonical links, the sitemap and robots.txt are all built from it, so every
 * domain that serves the site (eesa-en.vercel.app, eesa.ac.ke, www.eesa.ac.ke)
 * points search engines at this one address and none of them is indexed as a
 * duplicate of another. Moving to a new domain is one change to
 * NEXT_PUBLIC_SITE_URL and a redeploy.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://eesa-en.vercel.app').replace(/\/+$/, '');

/** A path on the public site as a full URL, e.g. siteUrl('/events') → https://…/events */
export const siteUrl = (path = '/') => new URL(path, `${SITE_URL}/`).toString();

/** Plain text trimmed to the length a search result shows, cut at a word. */
export const snippet = (text, max = 160) => {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1).replace(/\s+\S*$/, '')}…`;
};

/** For pages that are reachable by link but should not appear in search results. */
export const NOINDEX = { index: false, follow: true };

/**
 * Appended to every page title. A layout that sets its own title must pass
 * this on as its template too; a plain string title drops it for every page
 * beneath that layout.
 */
export const TITLE_TEMPLATE = '%s | EESA';
