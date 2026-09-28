import { NOINDEX } from '@/lib/site';

// Nothing here is worth a search result; noindex keeps it out of Google.
export const metadata = {
  title: 'Set a new password',
  robots: NOINDEX,
};

export default function ResetPasswordLayout({ children }) {
  return children;
}
