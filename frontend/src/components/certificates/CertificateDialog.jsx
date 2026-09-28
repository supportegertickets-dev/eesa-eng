'use client';

import { useState } from 'react';
import { HiPencil } from 'react-icons/hi';
import { useAuth } from '@/lib/AuthContext';
import { CERTIFICATE_TITLES, certificateDate, certificateSubject } from '@/lib/certificates';
import Modal from '@/components/ui/Modal';
import CertificateView from '@/components/certificates/CertificateView';
import CertificateEditDialog from '@/components/certificates/CertificateEditDialog';

const FIELD_LABELS = {
  recipientName: 'Name',
  regNumber: 'Registration number',
  department: 'Department',
  office: 'Office',
  startDate: 'Served from',
  endDate: 'Served until',
  academicYear: 'Academic year',
  issuedAt: 'Issued on',
  signatories: 'Signatures',
};
const DATE_FIELDS = new Set(['startDate', 'endDate', 'issuedAt']);
const shown = (field, value) => (value ? (DATE_FIELDS.has(field) ? certificateDate(value) : value) : 'none');

/**
 * One certificate, full width, with its download and print buttons.
 * `editable` lets an administrator correct its details, except on their own
 * certificate; `onChanged` receives the corrected certificate.
 */
export default function CertificateDialog({ certificate, onClose, editable = false, onChanged }) {
  const { user } = useAuth();
  const [editing, setEditing] = useState(false);
  if (!certificate) return null;

  const issued = [
    `No. ${certificate.number}`,
    `issued ${certificateDate(certificate.issuedAt)}`,
    certificate.issuedBy?.name && `by ${certificate.issuedBy.name}`,
  ].filter(Boolean).join(' · ');
  const own = certificate.user && certificate.user === user?._id;
  const canEdit = editable && certificate.status === 'valid' && !own;
  const edits = certificate.edits || [];

  return (
    <Modal
      open
      size="xl"
      title={`${CERTIFICATE_TITLES[certificate.type]}: ${certificate.recipientName}`}
      description={`${certificateSubject(certificate)}. ${issued}.`}
      onClose={onClose}
    >
      {certificate.status === 'revoked' && (
        <p className="mb-4 rounded-lg bg-danger-soft text-danger text-sm px-4 py-3" role="status">
          Revoked {certificateDate(certificate.revokedAt)}{certificate.revokedBy?.name ? ` by ${certificate.revokedBy.name}` : ''}.
          {certificate.revokeReason ? ` Reason: ${certificate.revokeReason}` : ''}
        </p>
      )}

      {canEdit && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn-outline btn-sm" onClick={() => setEditing(true)}>
            <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit details
          </button>
          <span className="text-sm text-muted-fg">Correct the name, dates or other details. The number and QR code stay the same.</span>
        </div>
      )}
      {editable && own && certificate.status === 'valid' && (
        <p className="mb-4 text-sm text-muted-fg">This is your own certificate, so another administrator makes any corrections.</p>
      )}

      <CertificateView certificate={certificate} />

      {editable && edits.length > 0 && (
        <details className="mt-6 rounded-lg border border-line p-4">
          <summary className="cursor-pointer text-sm font-medium text-strong">
            Edited {edits.length === 1 ? 'once' : `${edits.length} times`}, last on {certificateDate(edits[edits.length - 1].editedAt)}
          </summary>
          <ol className="mt-3 space-y-3">
            {[...edits].reverse().map((entry, index) => (
              <li key={`${entry.editedAt}-${index}`} className="text-sm">
                <p className="text-subtle">
                  {certificateDate(entry.editedAt)}{entry.editedBy?.name ? `, by ${entry.editedBy.name}` : ''}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {entry.changes.map((change) => (
                    <li key={change.field} className="text-body">
                      <span className="font-medium">{FIELD_LABELS[change.field] || change.field}:</span>{' '}
                      <span className="text-muted-fg line-through decoration-1">{shown(change.field, change.from)}</span>
                      {' → '}
                      {shown(change.field, change.to)}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
      )}

      {editing && (
        <CertificateEditDialog
          certificate={certificate}
          onClose={() => setEditing(false)}
          onSaved={(updated) => onChanged?.(updated)}
        />
      )}
    </Modal>
  );
}
