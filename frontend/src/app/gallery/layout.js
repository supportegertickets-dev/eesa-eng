import { TITLE_TEMPLATE } from '@/lib/site';

export const metadata = {
  // An object, so each album keeps the site suffix.
  title: { default: 'Gallery', template: TITLE_TEMPLATE },
  description: 'Photo albums from EESA events, projects, competitions and campus life at Egerton University.',
  alternates: { canonical: '/gallery' },
};

export default function GalleryLayout({ children }) {
  return children;
}
