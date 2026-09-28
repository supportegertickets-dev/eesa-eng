import { TITLE_TEMPLATE } from '@/lib/site';

export const metadata = {
  // An object, so each event page keeps the site suffix.
  title: { default: 'Events', template: TITLE_TEMPLATE },
  description: 'Workshops, seminars, competitions, trips and social events run by the Egerton Engineering Student Association.',
  alternates: { canonical: '/events' },
};

export default function EventsLayout({ children }) {
  return children;
}
