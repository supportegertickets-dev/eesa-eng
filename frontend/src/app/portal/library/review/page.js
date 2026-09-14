'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheck, HiClipboardCheck, HiX } from 'react-icons/hi';
import { getPendingResources, reviewResource } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { plural } from '@/lib/library';
import { useLibrary } from '@/components/library/LibraryProvider';
import RejectDialog from '@/components/library/RejectDialog';
import ResourceCollection from '@/components/library/ResourceCollection';
import usePagedResources from '@/components/library/usePagedResources';
import EmptyState from '@/components/ui/EmptyState';

export default function ReviewQueuePage() {
  const { isAdmin } = useAuth();
  const { version, refresh } = useLibrary();
  const [page, setPage] = useState(1);
  const [rejecting, setRejecting] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const list = usePagedResources(isAdmin ? getPendingResources : null, { page, limit: 20 }, version);

  // Approving the last files on a page would otherwise leave an empty page.
  useEffect(() => {
    if (!list.loading && page > list.totalPages) setPage(list.totalPages);
  }, [list.loading, list.totalPages, page]);

  const decide = async (resource, status, rejectionReason) => {
    setBusyId(resource._id);
    try {
      await reviewResource(resource._id, { status, ...(rejectionReason && { rejectionReason }) });
      toast.success(status === 'approved'
        ? `"${resource.title}" is now in the library.`
        : 'File rejected. The uploader has been told why.');
      list.remove(resource._id);
      setRejecting(null);
      refresh();
      return true;
    } catch (error) {
      toast.error(error.message);
      return false;
    } finally {
      setBusyId(null);
    }
  };

  if (!isAdmin) {
    return (
      <EmptyState
        icon={HiClipboardCheck}
        title="Reviewers only"
        description="Only administrators and the chairperson review uploads."
        action="Back to the library"
        actionHref="/portal/library"
      />
    );
  }

  return (
    <div>
      <p className="text-sm text-muted-fg mb-4 max-w-3xl">
        Check each file is readable and filed under the right unit and type. Use <strong className="text-body">Edit or move</strong> in
        a file&apos;s menu to fix its details first. Approving a file in a new unit adds that unit to the library.
        {list.total > 0 && <span className="font-medium text-body"> {plural(list.total, 'file')} waiting.</span>}
      </p>

      <ResourceCollection
        list={list}
        showLocation
        onPageChange={setPage}
        renderFooter={(resource) => (
          <div className="mt-3 pt-3 border-t border-line flex flex-wrap items-center gap-2">
            {resource.unit && !resource.unit.verified && <span className="badge-info">New unit</span>}
            {resource.uploadedBy?.email && <span className="text-xs text-subtle truncate">{resource.uploadedBy.email}</span>}
            <div className="flex gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setRejecting(resource)}
                disabled={busyId === resource._id}
                className="btn btn-sm border border-line text-danger hover:bg-danger-soft"
              >
                <HiX className="w-4 h-4" aria-hidden="true" /> Reject
              </button>
              <button
                type="button"
                onClick={() => decide(resource, 'approved')}
                disabled={busyId === resource._id}
                className="btn-primary btn-sm"
              >
                <HiCheck className="w-4 h-4" aria-hidden="true" /> Approve
              </button>
            </div>
          </div>
        )}
        viewerActions={(resource, close) => (
          <>
            <button
              type="button"
              onClick={() => {
                close();
                setRejecting(resource);
              }}
              className="btn btn-sm bg-white/10 hover:bg-white/20 text-white"
              aria-label="Reject"
            >
              <HiX className="w-4 h-4" aria-hidden="true" /><span className="hidden sm:inline">Reject</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (await decide(resource, 'approved')) close();
              }}
              disabled={busyId === resource._id}
              className="btn btn-sm bg-green-600 hover:bg-green-700 text-white"
              aria-label="Approve"
            >
              <HiCheck className="w-4 h-4" aria-hidden="true" /><span className="hidden sm:inline">Approve</span>
            </button>
          </>
        )}
        emptyState={(
          <EmptyState icon={HiClipboardCheck} title="All caught up" description="No uploads are waiting for review." />
        )}
      />

      <RejectDialog
        resource={rejecting}
        busy={Boolean(rejecting) && busyId === rejecting._id}
        onCancel={() => setRejecting(null)}
        onConfirm={(reason) => decide(rejecting, 'rejected', reason)}
      />
    </div>
  );
}
