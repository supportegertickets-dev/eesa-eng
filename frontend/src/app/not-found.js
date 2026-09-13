import Link from 'next/link';
import { HiHome, HiSearch } from 'react-icons/hi';

export const metadata = { title: 'Page not found' };

/**
 * 404 page. Previously the app had none, so a mistyped URL rendered Next.js's
 * bare default with no navigation back into the site.
 */
export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-16">
      <div className="max-w-md w-full text-center">
        <p className="font-heading text-6xl font-bold text-primary-500/25 dark:text-primary-300/25">404</p>

        <h1 className="mt-2 font-heading text-2xl font-bold text-strong">Page not found</h1>
        <p className="mt-2 text-muted-fg">
          That page does not exist, or it may have been moved since you last visited.
        </p>

        <div className="mt-7 flex flex-col sm:flex-row gap-3 justify-center">
          <Link href="/" className="btn-primary">
            <HiHome className="w-4 h-4" aria-hidden="true" />
            Go to home
          </Link>
          <Link href="/events" className="btn-outline">
            <HiSearch className="w-4 h-4" aria-hidden="true" />
            Browse events
          </Link>
        </div>
      </div>
    </div>
  );
}
