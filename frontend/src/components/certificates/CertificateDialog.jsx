'use client';

import { CERTIFICATE_TITLES, certificateDate, certificateSubject } from '@/lib/certificates';
import Modal from '@/components/ui/Modal';
import CertificateView from '@/components/certificates/CertificateView';

/** One certificate, full width, with its download and print buttons. */
export default function CertificateDialog({ certificate, onClose }) {
  if (!certificate) return null;
  const issued = [
    `No. ${certificate.number}`,
    `issued ${certificateDate(certificate.issuedAt)}`,
    certificate.issuedBy?.name && `by ${certificate.issuedBy.name}`,
  ].filter(Boolean).join(' · ');

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
      <CertificateView certificate={certificate} />
    </Modal>
  );
}
