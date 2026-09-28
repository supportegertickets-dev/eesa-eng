'use client';

import { useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheck, HiUpload } from 'react-icons/hi';
import { uploadPassportPhoto } from '@/lib/api';
import ImageDropzone from '@/components/ui/ImageDropzone';

const GUIDELINES = [
  'A recent colour photo of your face and shoulders, looking at the camera',
  'Plain, light background with no other people in the frame',
  'No sunglasses, hats or filters; religious head coverings are fine',
  'Sharp and well lit, not a scan of an old card',
];

/**
 * Submit a passport photo for the membership card. A member's photo waits for
 * an administrator to check it; an administrator adding a photo for a member
 * passes their own `upload`, and it goes straight onto the card.
 */
export default function PassportUploader({
  onUploaded,
  replacing = false,
  upload = uploadPassportPhoto,
  submitLabel = 'Send for review',
  successMessage = 'Photo sent for review. We will notify you once it is checked.',
  heading,
  note,
}) {
  const [file, setFile] = useState(null);
  const [progress, setProgress] = useState(null);

  const submit = async (event) => {
    event.preventDefault();
    if (!file) return;
    const form = new FormData();
    form.append('photo', file);
    setProgress(0);
    try {
      const result = await upload(form, setProgress);
      toast.success(successMessage);
      setFile(null);
      onUploaded?.(result);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;

  return (
    <form onSubmit={submit} className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_1fr]">
      <ImageDropzone
        label="Passport photo"
        value={file}
        onChange={setFile}
        aspect="portrait"
        disabled={busy}
        required
      />

      <div>
        <h3 className="font-semibold text-strong">{heading || (replacing ? 'Replace your card photo' : 'What makes a good card photo')}</h3>
        <ul className="mt-3 space-y-2">
          {GUIDELINES.map((line) => (
            <li key={line} className="flex items-start gap-2 text-sm text-body">
              <HiCheck className="w-4 h-4 mt-0.5 text-success shrink-0" aria-hidden="true" />
              {line}
            </li>
          ))}
        </ul>
        {(note || replacing) && (
          <p className="mt-3 text-sm text-muted-fg">{note || 'Your current card keeps its photo until the new one is approved.'}</p>
        )}

        <button type="submit" className="btn-primary mt-5" disabled={!file || busy}>
          <HiUpload className="w-4 h-4" aria-hidden="true" />
          {busy ? `Uploading… ${progress}%` : submitLabel}
        </button>
      </div>
    </form>
  );
}
