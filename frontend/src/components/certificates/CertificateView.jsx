'use client';

import { useEffect, useState } from 'react';
import { HiDownload, HiExclamation, HiPrinter } from 'react-icons/hi';
import {
  CERTIFICATE_TITLES, certificateFileName, certificateSubject, printCertificates, renderCertificateImage,
} from '@/lib/certificates';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * A certificate as an image, with download and print. The QR code links to
 * the public verification page on whichever site is being used.
 */
export default function CertificateView({ certificate }) {
  const [image, setImage] = useState(null);
  const [signaturesMissing, setSignaturesMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setFailed(false);

    renderCertificateImage(certificate)
      .then(({ dataUrl, signaturesLoaded }) => {
        if (cancelled) return;
        setImage(dataUrl);
        setSignaturesMissing(!signaturesLoaded);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [certificate]);

  const title = CERTIFICATE_TITLES[certificate.type];
  const revoked = certificate.status === 'revoked';

  return (
    <div>
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={image}
          alt={`${title} for ${certificate.recipientName}: ${certificateSubject(certificate)}. Number ${certificate.number}.`}
          className="w-full h-auto rounded-lg border border-line shadow-overlay"
        />
      ) : failed ? (
        <div className="aspect-[297/210] rounded-lg border border-line bg-muted flex items-center justify-center text-sm text-muted-fg p-6 text-center">
          The certificate could not be drawn in this browser. Try refreshing the page.
        </div>
      ) : (
        <div role="status" aria-label="Preparing the certificate">
          <Skeleton className="aspect-[297/210] w-full rounded-lg" />
        </div>
      )}

      {signaturesMissing && image && (
        <p className="mt-3 text-sm text-warning flex items-start gap-2" role="status">
          <HiExclamation className="w-5 h-5 shrink-0" aria-hidden="true" />
          A signature could not be loaded, so it is missing from the image. Check your connection and reopen the certificate before downloading.
        </p>
      )}

      {revoked ? (
        <p className="mt-4 text-sm text-danger">This certificate has been revoked, so it can no longer be downloaded or printed.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 mt-5">
            <a
              href={image || undefined}
              download={certificateFileName(certificate)}
              aria-disabled={!image}
              className={`btn-primary ${image ? '' : 'pointer-events-none opacity-60'}`}
            >
              <HiDownload className="w-4 h-4" aria-hidden="true" /> Download
            </a>
            <button type="button" className="btn-outline" disabled={!image} onClick={() => printCertificates([image], { title })}>
              <HiPrinter className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
            </button>
          </div>
          <p className="form-hint">Prints on A4 in landscape. Choose “Save as PDF” in the print dialog for a PDF copy.</p>
        </>
      )}
    </div>
  );
}
