'use client';

import { useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { updatePhoto } from '@/lib/api';
import { cloudinaryImage } from '@/lib/images';
import Modal from '@/components/ui/Modal';

const MAX_CAPTION = 500;

/**
 * Edit one photo's caption, with "Save and next" for captioning a whole album
 * in one pass.
 */
export default function CaptionDialog({ photos, index, onIndexChange, onClose, onSaved }) {
  const id = useId();
  const textareaRef = useRef(null);
  const photo = index === null || index === undefined ? null : photos[index];
  const [caption, setCaption] = useState('');
  const [saving, setSaving] = useState(false);
  const hasNext = Boolean(photo) && index < photos.length - 1;

  useEffect(() => {
    if (!photo) return;
    setCaption(photo.caption || '');
    // After the dialog has focused itself.
    requestAnimationFrame(() => textareaRef.current?.focus());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo?._id]);

  const save = async (advance) => {
    if (!photo) return;
    const next = caption.trim();
    const finish = () => (advance && hasNext ? onIndexChange(index + 1) : onClose());

    if (next === (photo.caption || '')) {
      finish();
      return;
    }

    setSaving(true);
    try {
      onSaved(await updatePhoto(photo._id, { caption: next }));
      finish();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(photo)}
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Caption"
      description={photo ? `Photo ${index + 1} of ${photos.length}` : undefined}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost">Cancel</button>
          {hasNext && (
            <button type="button" onClick={() => save(true)} disabled={saving} className="btn-outline">Save and next</button>
          )}
          <button type="button" onClick={() => save(false)} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </>
      )}
    >
      {photo && (
        <div className="space-y-4">
          <div className="rounded-lg bg-muted overflow-hidden flex items-center justify-center min-h-[10rem]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img key={photo._id} src={cloudinaryImage(photo.url, { width: 960, crop: 'limit' })} alt="" className="max-h-72 w-auto object-contain animate-fade-in" />
          </div>
          <div>
            <label htmlFor={id} className="form-label">Caption</label>
            <textarea
              ref={textareaRef}
              id={id}
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  save(true);
                }
              }}
              maxLength={MAX_CAPTION}
              rows={3}
              disabled={saving}
              placeholder="Who is in the photo, or what is happening?"
              className="input-field"
            />
            <p className="form-hint flex justify-between gap-4">
              <span>Ctrl + Enter to save{hasNext ? ' and go to the next photo' : ''}.</span>
              <span className="tabular-nums">{caption.length}/{MAX_CAPTION}</span>
            </p>
          </div>
        </div>
      )}
    </Modal>
  );
}
