import { NOINDEX } from '@/lib/site';

// Nothing here is worth a search result; noindex keeps it out of Google.
export const metadata = {
  title: 'Sign in',
  robots: NOINDEX,
};

export default function LoginLayout({ children }) {
  return children;
}
