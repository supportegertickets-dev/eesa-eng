'use client';

import { Suspense } from 'react';
import LibraryBrowser from '@/components/library/LibraryBrowser';
import { SkeletonList } from '@/components/ui/Skeleton';

// The browser reads its folder from the query string, which Next requires to
// sit inside a Suspense boundary.
export default function LibraryPage() {
  return (
    <Suspense fallback={<SkeletonList count={4} />}>
      <LibraryBrowser />
    </Suspense>
  );
}
