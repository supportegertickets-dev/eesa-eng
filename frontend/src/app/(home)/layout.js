// The home page is a client component and cannot export metadata, so its
// canonical lives in this route group's layout. The group adds nothing to the URL.
export const metadata = {
  alternates: { canonical: '/' },
};

export default function HomeLayout({ children }) {
  return children;
}
