'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiDocumentDownload, HiExternalLink, HiPencil, HiPlus, HiScale, HiTrash, HiUpload } from 'react-icons/hi';
import { constitutionFileUrl, deleteConstitution, getConstitutionVersion, getConstitutionVersions, publishConstitution } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate, relativeTime } from '@/lib/dates';
import ConstitutionEditor from '@/components/constitution/ConstitutionEditor';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

export default function ManageConstitutionPage() {
  const { isAdmin } = useAuth();
  const [versions, setVersions] = useState(null);
  const [error, setError] = useState(null);
  const [editor, setEditor] = useState(null); // null | { initial }
  const [busyId, setBusyId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setVersions((await getConstitutionVersions()).versions || []);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Admin and Chairperson only.</p>
      </div>
    );
  }

  const openEditor = async (version) => {
    if (!version) { setEditor({ initial: null }); return; }
    setBusyId(version._id);
    try {
      // The list leaves out the article text.
      const { constitution } = await getConstitutionVersion(version._id);
      setEditor({ initial: constitution });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const saved = (constitution, { published }) => {
    toast.success(published ? `Version ${constitution.version} is now on the site.` : `Version ${constitution.version} saved.`);
    setEditor(null);
    load();
  };

  const publish = async (version) => {
    setBusyId(version._id);
    try {
      await publishConstitution(version._id);
      toast.success(`Version ${version.version} is now on the site.`);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setBusyId(pendingDelete._id);
    try {
      await deleteConstitution(pendingDelete._id);
      toast.success('Version deleted.');
      setPendingDelete(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusyId(null);
    }
  };

  if (editor) {
    return <ConstitutionEditor initial={editor.initial} onSaved={saved} onCancel={() => setEditor(null)} />;
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-primary-600 dark:text-primary-300 text-sm font-semibold uppercase tracking-wide">Governance</p>
          <h1 className="page-title mt-1">Constitution</h1>
          <p className="text-muted-fg mt-1">Upload the constitution and the site turns it into documentation anyone can read and search.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/constitution" className="btn-ghost" target="_blank">
            <HiExternalLink className="w-4 h-4" aria-hidden="true" /> View on the site
          </Link>
          <button type="button" className="btn-primary" onClick={() => openEditor(null)}>
            <HiUpload className="w-4 h-4" aria-hidden="true" /> Upload a version
          </button>
        </div>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !versions ? (
        <LoadingRegion label="Loading versions"><SkeletonList count={2} /></LoadingRegion>
      ) : versions.length === 0 ? (
        <EmptyState
          icon={HiScale}
          title="No constitution yet"
          description="Upload the constitution as a PDF or Word file. Its articles are filled in for you to check, then publish it for everyone to read."
          action="Upload the constitution"
          onAction={() => openEditor(null)}
        />
      ) : (
        <ul className="space-y-3">
          {versions.map((version) => (
            <li key={version._id} className={`card p-4 ${version.isCurrent ? 'border-success/40' : ''}`}>
              <div className="flex flex-wrap items-start gap-4">
                <span className="w-11 h-11 rounded-xl bg-primary-500/10 flex items-center justify-center shrink-0">
                  <HiScale className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-strong">Version {version.version}</p>
                    {version.isCurrent
                      ? <span className="badge-success">On the site</span>
                      : version.status === 'published'
                        ? <span className="badge-neutral">Earlier version</span>
                        : <span className="badge-warning">Draft</span>}
                  </div>
                  <p className="text-sm text-subtle mt-0.5">
                    {version.sections?.length || 0} articles
                    {version.adoptedOn && <> · adopted {formatDate(version.adoptedOn)}</>}
                    {version.file?.name && <> · {version.file.name}</>}
                  </p>
                  <p className="text-xs text-faint mt-0.5">
                    Updated {relativeTime(version.updatedAt)}{version.updatedBy ? ` by ${version.updatedBy.firstName} ${version.updatedBy.lastName}` : ''}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button type="button" className="btn-ghost btn-sm" onClick={() => openEditor(version)} disabled={busyId === version._id}>
                    <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit
                  </button>
                  {version.status === 'published' && version.file?.url && (
                    <a href={constitutionFileUrl(version._id, { download: true })} className="btn-ghost btn-sm">
                      <HiDocumentDownload className="w-4 h-4" aria-hidden="true" /> File
                    </a>
                  )}
                  {version.status === 'published' && !version.isCurrent && (
                    <Link href={`/constitution?version=${version._id}`} className="btn-ghost btn-sm" target="_blank">
                      <HiExternalLink className="w-4 h-4" aria-hidden="true" /> View
                    </Link>
                  )}
                  {!version.isCurrent && (
                    <>
                      <button type="button" className="btn-primary btn-sm" onClick={() => publish(version)} disabled={busyId === version._id}>
                        {version.status === 'published' ? 'Make current' : 'Publish'}
                      </button>
                      <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setPendingDelete(version)} disabled={busyId === version._id} aria-label={`Delete version ${version.version}`}>
                        <HiTrash className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {versions?.length > 0 && (
        <p className="mt-6 text-sm text-muted-fg flex items-start gap-2">
          <HiPlus className="w-4 h-4 mt-0.5 shrink-0" aria-hidden="true" />
          When the constitution is amended, upload the new version. Earlier versions stay readable on the site.
        </p>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete version ${pendingDelete?.version}?`}
        description="The version and its file are removed permanently."
        confirmLabel="Delete version"
        busy={Boolean(busyId)}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
