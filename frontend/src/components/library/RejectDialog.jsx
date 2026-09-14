'use client';

import { useEffect, useId, useState } from 'react';
import Modal from '@/components/ui/Modal';

const QUICK_REASONS = [
  'Filed under the wrong unit',
  'Already in the library',
  'Unreadable or incomplete',
  'Not study material',
];

/** Ask the reviewer why a file is rejected; the uploader is shown this reason. */
export default function RejectDialog({ resource, busy = false, onCancel, onConfirm }) {
  const id = useId();
  const [reason, setReason] = useState('');

  useEffect(() => setReason(''), [resource]);

  const valid = reason.trim().length >= 3;
  const uploader = resource?.uploadedBy?.firstName || 'the uploader';

  return (
    <Modal
      open={Boolean(resource)}
      onClose={onCancel}
      busy={busy}
      size="sm"
      title="Reject this file?"
      description={resource ? `Tell ${uploader} why "${resource.title}" was not added. They will be notified and can fix it.` : ''}
      footer={(
        <>
          <button type="button" onClick={onCancel} disabled={busy} className="btn-ghost">Cancel</button>
          <button type="button" onClick={() => onConfirm(reason.trim())} disabled={!valid || busy} className="btn-danger">
            {busy ? 'Rejecting…' : 'Reject file'}
          </button>
        </>
      )}
    >
      <div className="flex flex-wrap gap-2 mb-4">
        {QUICK_REASONS.map((text) => (
          <button
            key={text}
            type="button"
            onClick={() => setReason(text)}
            className="px-3 py-1 rounded-full border border-line text-xs text-body hover:bg-muted transition-colors"
          >
            {text}
          </button>
        ))}
      </div>
      <label htmlFor={`${id}-reason`} className="form-label">Reason</label>
      <textarea
        id={`${id}-reason`}
        rows={3}
        maxLength={500}
        value={reason}
        onChange={(event) => setReason(event.target.value)}
        placeholder="e.g. This is EEEN 482, not EEEN 481. Please move it."
        className="input-field resize-y"
      />
      <p className="form-hint">{reason.length}/500</p>
    </Modal>
  );
}
