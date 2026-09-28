'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiArrowDown, HiArrowUp, HiPencil, HiPencilAlt, HiPlus, HiTrash } from 'react-icons/hi';
import { deleteSignatory, getSignatories, reorderSignatories } from '@/lib/api';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';
import SignatoryFormDialog from '@/components/certificates/SignatoryFormDialog';

const TYPE_LABELS = { leadership: 'Leadership', membership: 'Membership' };

/** Who signs certificates, in the order their signatures appear, left to right. */
export default function SignatoriesPanel() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | { signatory }
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getSignatories());
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const move = async (index, direction) => {
    const ids = data.signatories.map((s) => s._id);
    const [moved] = ids.splice(index, 1);
    ids.splice(index + direction, 0, moved);
    setBusy(true);
    try {
      setData(await reorderSignatories(ids));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      const result = await deleteSignatory(removing._id);
      toast.success(result.message);
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (error) return <ErrorState error={error} onRetry={load} />;
  if (!data) return <LoadingRegion label="Loading signatories"><SkeletonList count={2} /></LoadingRegion>;

  const missing = ['leadership', 'membership'].filter((type) => !data.signatories.some((s) => s.certificateTypes.includes(type)));

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-start gap-3 mb-4">
        <p className="text-sm text-muted-fg flex-1 max-w-3xl">
          Up to {data.maxPerType} people sign each kind of certificate, such as the Chairperson and the Patron.
          The first in the list signs on the left. Each certificate keeps the signatures it was issued with, so changes here apply to new certificates only.
        </p>
        <button type="button" className="btn-primary shrink-0" onClick={() => setEditing({ signatory: null })}>
          <HiPlus className="w-4 h-4" aria-hidden="true" /> Add signatory
        </button>
      </div>

      {missing.length > 0 && data.signatories.length > 0 && (
        <p className="mb-4 rounded-lg bg-warning-soft text-warning text-sm px-4 py-3" role="status">
          Nobody signs {missing.map((type) => TYPE_LABELS[type].toLowerCase()).join(' or ')} certificates yet, so they cannot be issued.
        </p>
      )}

      {data.signatories.length === 0 ? (
        <EmptyState
          icon={HiPencilAlt}
          title="No signatories yet"
          description="Certificates cannot be issued until someone's signature is added."
          action="Add signatory"
          onAction={() => setEditing({ signatory: null })}
        />
      ) : (
        <ol className="space-y-2">
          {data.signatories.map((signatory, index) => (
            <li key={signatory._id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="w-full sm:w-48 h-20 rounded-lg border border-line bg-[#fffdf7] flex items-center justify-center p-2 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={signatory.signatureUrl} alt={`${signatory.name}'s signature`} className="max-h-full max-w-full object-contain" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-strong">{signatory.name}</p>
                <p className="text-sm text-muted-fg">{signatory.title}</p>
                <p className="flex flex-wrap gap-1.5 mt-1.5">
                  {signatory.certificateTypes.map((type) => <span key={type} className="badge-neutral">{TYPE_LABELS[type]}</span>)}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(index, -1)} disabled={busy || index === 0} aria-label={`Move ${signatory.name} up`}>
                  <HiArrowUp className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" className="btn-ghost btn-sm" onClick={() => move(index, 1)} disabled={busy || index === data.signatories.length - 1} aria-label={`Move ${signatory.name} down`}>
                  <HiArrowDown className="w-4 h-4" aria-hidden="true" />
                </button>
                <button type="button" className="btn-outline btn-sm" onClick={() => setEditing({ signatory })}>
                  <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit
                </button>
                <button type="button" className="btn-ghost btn-sm text-danger" onClick={() => setRemoving(signatory)} aria-label={`Remove ${signatory.name}`}>
                  <HiTrash className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}

      <SignatoryFormDialog
        open={Boolean(editing)}
        signatory={editing?.signatory || null}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        busy={busy}
        title="Remove this signatory?"
        description={removing ? `${removing.name}'s signature will not be printed on new certificates. Certificates already issued keep it.` : ''}
        confirmLabel="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </div>
  );
}
