import { TITLE_TEMPLATE } from '@/lib/site';

export const metadata = {
  // An object, so each article keeps the site suffix.
  title: { default: 'News', template: TITLE_TEMPLATE },
  description: 'News, announcements and achievements from the Egerton Engineering Student Association.',
  alternates: { canonical: '/news' },
};

export default function NewsLayout({ children }) {
  return children;
}
