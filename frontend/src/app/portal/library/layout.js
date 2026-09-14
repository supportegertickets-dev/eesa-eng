'use client';

import { LibraryProvider } from '@/components/library/LibraryProvider';
import LibraryHeader from '@/components/library/LibraryHeader';

export default function LibraryLayout({ children }) {
  return (
    <LibraryProvider>
      <LibraryHeader />
      {children}
    </LibraryProvider>
  );
}
