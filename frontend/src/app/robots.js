import { SITE_URL } from '@/lib/site';

/**
 * /robots.txt, served identically on every domain. It names the sitemap on the
 * primary domain, so Google is sent there whichever address it arrives by.
 *
 * The portal is kept out because it sits behind a sign-in and holds members'
 * data. Sign-in and password pages are left crawlable on purpose: they carry
 * a noindex tag, which Google can only see if it may fetch the page.
 */
export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: '/portal',
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
