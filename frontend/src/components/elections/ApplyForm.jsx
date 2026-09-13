'use client';

import { useId, useState } from 'react';
import { applyForElection, updateCandidate } from '@/lib/api';
import { MIN_MANIFESTO, formatDateTime } from '@/lib/elections';
import ImageDropzone from '@/components/ui/ImageDropzone';

/**
 * Apply to stand, edit a pending application, or resubmit a rejected one.
 * `onDone` receives the API response, `{ message, election }`.
 */
export default function ApplyForm({ election, application = null, onDone, onCancel }) {
  const uid = useId();
  const editingPending = application?.status === 'pending';
  const resubmitting = application?.status === 'rejected';

  const [position, setPosition] = useState(application?.position || election.positions[0] || '');
  const [manifesto, setManifesto] = useState(application?.manifesto || '');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const length = manifesto.trim().length;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!position) { setError('Choose the position you are running for.'); return; }
    if (length < MIN_MANIFESTO) { setError(`Your manifesto needs at least ${MIN_MANIFESTO} characters.`); return; }

    const data = new FormData();
    data.append('position', position);
    data.append('manifesto', manifesto.trim());
    if (photo) data.append('photo', photo);

    setError('');
    setSubmitting(true);
    try {
      const result = editingPending
        ? await updateCandidate(election._id, application._id, data)
        : await applyForElection(election._id, data, setProgress);
      onDone(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card space-y-5" noValidate>
      <div>
        <h2 className="font-heading text-lg font-semibold text-strong">
          {editingPending ? 'Edit your application' : resubmitting ? 'Update and resubmit your application' : 'Apply to stand'}
        </h2>
        <p className="text-sm text-muted-fg mt-1">
          An administrator reviews every application. Nominations close {formatDateTime(election.nominationsCloseAt)}.
        </p>
      </div>

      {resubmitting && application.rejectionReason && (
        <div className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3">
          <p className="font-medium">Why your application was not approved</p>
          <p className="mt-1">{application.rejectionReason}</p>
        </div>
      )}

      {error && <p role="alert" className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-6">
        <ImageDropzone
          label="Campaign photo"
          hint="Optional. A clear head-and-shoulders photo. Your profile picture is used if you skip this."
          value={photo}
          onChange={setPhoto}
          existingUrl={application?.photo || ''}
          aspect="portrait"
          disabled={submitting}
        />

        <div className="space-y-4">
          <div>
            <label htmlFor={`${uid}-position`} className="form-label">Position <span className="text-danger">*</span></label>
            <select id={`${uid}-position`} value={position} onChange={(e) => setPosition(e.target.value)} className="input-field">
              {election.positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>

          <div>
            <label htmlFor={`${uid}-manifesto`} className="form-label">Manifesto <span className="text-danger">*</span></label>
            <textarea
              id={`${uid}-manifesto`}
              value={manifesto}
              onChange={(e) => setManifesto(e.target.value)}
              className="input-field resize-y"
              rows={8}
              maxLength={2000}
              placeholder="Why are you standing, and what will you do in office?"
            />
            <p className={`form-hint flex justify-between ${length > 0 && length < MIN_MANIFESTO ? 'text-warning' : ''}`}>
              <span>At least {MIN_MANIFESTO} characters.</span>
              <span className="tabular-nums">{manifesto.length} / 2000</span>
            </p>
          </div>
        </div>
      </div>

      {submitting && photo && !editingPending && (
        <div className="h-2 rounded-full bg-muted overflow-hidden" aria-hidden="true">
          <div className="h-full bg-primary-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-line">
        {onCancel && <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost">Cancel</button>}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Submitting…' : editingPending ? 'Save application' : 'Submit application'}
        </button>
      </div>
    </form>
  );
}
