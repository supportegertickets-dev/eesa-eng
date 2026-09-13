import { SkeletonGrid, LoadingRegion } from '@/components/ui/Skeleton';

/**
 * Route-level loading state, shown while a server component streams in.
 * Holds the page's shape rather than collapsing to a spinner.
 */
export default function Loading() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
      <LoadingRegion label="Loading page">
        <div className="space-y-3 mb-8">
          <div className="skeleton h-8 w-64" />
          <div className="skeleton h-4 w-96 max-w-full" />
        </div>
        <SkeletonGrid count={6} />
      </LoadingRegion>
    </div>
  );
}
