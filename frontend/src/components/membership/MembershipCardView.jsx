'use client';

import { useEffect, useState } from 'react';
import { HiDownload, HiPrinter, HiExclamation } from 'react-icons/hi';
import { cardFileName, printImage, renderCardImage } from '@/lib/membershipCard';
import { formatDate } from '@/lib/dates';
import { Skeleton } from '@/components/ui/Skeleton';

/**
 * The member's card as an image, with download and print.
 *
 * The QR code links to the public verification page on whichever site the
 * member is using, so a card made on a preview deployment verifies there.
 */
export default function MembershipCardView({ card }) {
  const [image, setImage] = useState(null);
  const [photoMissing, setPhotoMissing] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setImage(null);
    setFailed(false);

    renderCardImage(card)
      .then(({ dataUrl, photoLoaded }) => {
        if (cancelled) return;
        setImage(dataUrl);
        setPhotoMissing(!photoLoaded);
      })
      .catch(() => { if (!cancelled) setFailed(true); });

    return () => { cancelled = true; };
  }, [card]);

  const fileName = cardFileName(card);
  const description = `Membership card for ${card.fullName}, member number ${card.memberNumber}, ${card.department}, valid until ${card.validUntil ? formatDate(card.validUntil) : 'the end of the current semester'}.`;

  return (
    <div>
      <div className="max-w-xl">
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={image} alt={description} className="w-full h-auto rounded-2xl shadow-overlay" />
        ) : failed ? (
          <div className="aspect-[1012/638] rounded-2xl border border-line bg-muted flex items-center justify-center text-sm text-muted-fg p-6 text-center">
            Your card could not be drawn in this browser. Try refreshing the page.
          </div>
        ) : (
          <div role="status" aria-label="Preparing your card">
            <Skeleton className="aspect-[1012/638] w-full rounded-2xl" />
          </div>
        )}
      </div>

      {photoMissing && image && (
        <p className="mt-3 text-sm text-warning flex items-start gap-2" role="status">
          <HiExclamation className="w-5 h-5 shrink-0" aria-hidden="true" />
          Your photo could not be loaded, so the card was drawn without it. Check your connection and refresh before downloading.
        </p>
      )}

      <div className="flex flex-wrap gap-2 mt-5">
        <a
          href={image || undefined}
          download={fileName}
          aria-disabled={!image}
          className={`btn-primary ${image ? '' : 'pointer-events-none opacity-60'}`}
        >
          <HiDownload className="w-4 h-4" aria-hidden="true" /> Download card
        </a>
        <button type="button" className="btn-outline" disabled={!image} onClick={() => printImage(image)}>
          <HiPrinter className="w-4 h-4" aria-hidden="true" /> Print or save as PDF
        </button>
      </div>
      <p className="form-hint">Prints at the size of a bank card (85.6 × 54 mm). Choose “Save as PDF” in the print dialog for a PDF copy.</p>
    </div>
  );
}
