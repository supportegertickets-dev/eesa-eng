'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiDownload, HiEye, HiPencil, HiTrash } from 'react-icons/hi';
import { deleteResource, getResourceFileUrl, trackDownload } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useLibrary } from '@/components/library/LibraryProvider';
import EditResourceDialog from '@/components/library/EditResourceDialog';
import ResourceRow from '@/components/library/ResourceRow';
import ResourceViewer from '@/components/library/ResourceViewer';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

/** Save a file to the device through a single-use download link. */
export const downloadResource = async (resource) => {
  try {
    const url = await getResourceFileUrl(resource._id, { download: true });
    trackDownload(resource._id).catch(() => {});
    // The response is an attachment, so the browser saves it and stays on the page.
    window.location.assign(url);
  } catch (error) {
    toast.error(error.message || 'That file could not be downloaded.');
  }
};

/**
 * A list of library files with everything members do to them: preview,
 * download, edit or move, and delete. Uploaders manage their own files;
 * reviewers manage all of them.
 *
 * @param {object} props.list the result of usePagedResources
 * @param {Function} [props.renderFooter] extra content under a row
 * @param {Function} [props.viewerActions] (resource, close) => buttons for the preview header
 */
export default function ResourceCollection({
  list,
  emptyState,
  onPageChange,
  hidePagination = false,
  showStatus = false,
  showLocation = false,
  showUploader = true,
  renderFooter,
  viewerActions,
}) {
  const { user, isAdmin } = useAuth();
  const { refresh } = useLibrary();

  const [viewing, setViewing] = useState(null);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false);

  const canManage = (resource) => isAdmin || String(resource.uploadedBy?._id || resource.uploadedBy) === String(user?._id);

  const confirmDelete = async () => {
    setBusy(true);
    try {
      await deleteResource(deleting._id);
      list.remove(deleting._id);
      toast.success('File deleted.');
      setDeleting(null);
      refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (list.loading && !list.resources.length) {
    return <LoadingRegion label="Loading files"><SkeletonList count={3} /></LoadingRegion>;
  }
  if (list.error && !list.resources.length) return <ErrorState error={list.error} onRetry={list.reload} />;
  if (!list.resources.length) return emptyState || null;

  return (
    <>
      <ul className={`space-y-3 transition-opacity ${list.loading ? 'opacity-60' : ''}`} aria-busy={list.loading}>
        {list.resources.map((resource) => (
          <ResourceRow
            key={resource._id}
            resource={resource}
            onOpen={setViewing}
            showStatus={showStatus}
            showLocation={showLocation}
            showUploader={showUploader}
            footer={renderFooter?.(resource)}
            actions={[
              { label: 'Preview', icon: HiEye, onClick: () => setViewing(resource) },
              { label: 'Download', icon: HiDownload, onClick: () => downloadResource(resource) },
              ...(canManage(resource) ? [
                { label: 'Edit or move', icon: HiPencil, onClick: () => setEditing(resource) },
                { label: 'Delete', icon: HiTrash, danger: true, onClick: () => setDeleting(resource) },
              ] : []),
            ]}
          />
        ))}
      </ul>

      {!hidePagination && (
        <Pagination className="mt-6" page={list.page} totalPages={list.totalPages} onChange={onPageChange} />
      )}

      {viewing && (
        <ResourceViewer
          resource={viewing}
          onClose={() => setViewing(null)}
          actions={viewerActions?.(viewing, () => setViewing(null))}
        />
      )}

      <EditResourceDialog
        resource={editing}
        onClose={() => setEditing(null)}
        onSaved={(updated) => {
          list.update(updated);
          setEditing(null);
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this file?"
        description={deleting ? `"${deleting.title}" will be removed from the library for everyone. This cannot be undone.` : ''}
        confirmLabel="Delete file"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}
