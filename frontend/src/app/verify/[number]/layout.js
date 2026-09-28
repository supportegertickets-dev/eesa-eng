import { NOINDEX } from '@/lib/site';

// A check result names the card or certificate holder. It is for whoever
// scanned the QR code, not for search results, so it is noindex and drops the
// /verify canonical it would otherwise inherit.
export const metadata = {
  robots: NOINDEX,
  alternates: {},
};

export default function VerifyResultLayout({ children }) {
  return children;
}
