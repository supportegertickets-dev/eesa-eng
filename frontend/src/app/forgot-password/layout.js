import { NOINDEX } from '@/lib/site';

// Nothing here is worth a search result; noindex keeps it out of Google.
export const metadata = {
  title: 'Forgot password',
  robots: NOINDEX,
};

export default function ForgotPasswordLayout({ children }) {
  return children;
}
