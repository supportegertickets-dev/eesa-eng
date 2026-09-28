import { NOINDEX } from '@/lib/site';

// Nothing here is worth a search result; noindex keeps it out of Google.
export const metadata = {
  title: 'Offline',
  robots: NOINDEX,
};

export default function OfflineLayout({ children }) {
  return children;
}
