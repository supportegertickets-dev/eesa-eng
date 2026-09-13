'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { HiPhotograph, HiX, HiRefresh, HiPlus } from 'react-icons/hi';
import { IMAGE_TYPES, validateImageFile, cloudinaryImage } from '@/lib/images';

const ASPECTS = {
  video: 'aspect-video',
  portrait: 'aspect-[3/4]',
  square: 'aspect-square',
};

/**
 * Image picker with drag and drop, previews and client-side validation.
 *
 * Single mode (`multiple` false): `value` is a File or null, and `existingUrl`
 * is the image already saved, if any.
 *
 * Multiple mode: `value` is an array of new Files, `existing` is an array of
 * saved `{ id, url }` photos, and `max` caps saved plus new together.
 */
export default function ImageDropzone({
  label,
  hint,
  multiple = false,
  max = 10,
  value,
  onChange,
  existingUrl = '',
  onRemoveExisting,
  existing = [],
  aspect = 'video',
  disabled = false,
  required = false,
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState('');

  const files = useMemo(() => (multiple ? value || [] : value ? [value] : []), [multiple, value]);

  // Object URLs must be revoked, or every preview leaks its image until the tab closes.
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);
  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const remaining = multiple ? Math.max(0, max - existing.length - files.length) : 1;

  const accept = (incoming) => {
    const list = Array.from(incoming || []);
    if (!list.length) return;

    const problems = [];
    const valid = [];
    for (const file of list) {
      const problem = validateImageFile(file);
      if (problem) problems.push(problem);
      else valid.push(file);
    }

    if (multiple) {
      const accepted = valid.slice(0, remaining);
      if (valid.length > remaining) {
        problems.push(`Only ${max} photos are allowed, so ${valid.length - remaining} ${valid.length - remaining === 1 ? 'was' : 'were'} left out.`);
      }
      if (accepted.length) onChange([...files, ...accepted]);
    } else if (valid[0]) {
      onChange(valid[0]);
    }

    setError(problems.join(' '));
  };

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const dropHandlers = {
    onDragOver: (e) => { e.preventDefault(); if (!disabled) setDragging(true); },
    onDragLeave: () => setDragging(false),
    onDrop: (e) => { e.preventDefault(); setDragging(false); if (!disabled) accept(e.dataTransfer.files); },
  };

  const input = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={IMAGE_TYPES.join(',')}
      multiple={multiple}
      className="sr-only"
      disabled={disabled}
      required={required && !files.length && !existingUrl}
      aria-describedby={hint ? hintId : undefined}
      onChange={(e) => { accept(e.target.files); e.target.value = ''; }}
    />
  );

  const emptyZone = (compact = false) => (
    <button
      type="button"
      onClick={openPicker}
      disabled={disabled}
      {...dropHandlers}
      className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed transition-colors text-center
        ${compact ? 'aspect-square p-2' : `${ASPECTS[aspect]} p-6`}
        ${dragging ? 'border-primary-500 bg-primary-500/10' : 'border-line-strong hover:border-primary-400 hover:bg-muted'}
        disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {compact ? (
        <>
          <HiPlus className="w-6 h-6 text-faint" aria-hidden="true" />
          <span className="text-xs text-subtle">Add photos</span>
        </>
      ) : (
        <>
          <HiPhotograph className="w-10 h-10 text-faint" aria-hidden="true" />
          <span className="text-sm font-medium text-body">
            <span className="text-primary-500 dark:text-primary-300">Choose {multiple ? 'photos' : 'an image'}</span> or drag {multiple ? 'them' : 'it'} here
          </span>
          <span className="text-xs text-subtle">JPG, PNG, WebP or GIF, up to 5MB{multiple ? ` each, ${max} max` : ''}</span>
        </>
      )}
    </button>
  );

  const removeButton = (onClick, labelText) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="absolute top-2 right-2 p-1.5 rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
      aria-label={labelText}
    >
      <HiX className="w-4 h-4" aria-hidden="true" />
    </button>
  );

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}{required && <span className="text-danger"> *</span>}
        </label>
      )}
      {input}

      {multiple ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-3" {...dropHandlers}>
          {existing.map((photo) => (
            <div key={photo.id} className="relative aspect-square rounded-lg overflow-hidden bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cloudinaryImage(photo.url, { width: 300, height: 300 })} alt="" className="w-full h-full object-cover" />
              {onRemoveExisting && removeButton(() => onRemoveExisting(photo.id), 'Remove this photo')}
            </div>
          ))}
          {files.map((file, index) => (
            <div key={`${file.name}-${file.lastModified}-${index}`} className="relative aspect-square rounded-lg overflow-hidden bg-muted ring-2 ring-primary-500/40">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={previews[index]} alt="" className="w-full h-full object-cover" />
              <span className="absolute bottom-1.5 left-1.5 badge bg-primary-500 text-white">New</span>
              {removeButton(() => onChange(files.filter((_, i) => i !== index)), `Remove ${file.name}`)}
            </div>
          ))}
          {remaining > 0 && emptyZone(true)}
        </div>
      ) : files[0] || existingUrl ? (
        <div className={`relative ${ASPECTS[aspect]} rounded-xl overflow-hidden bg-muted border border-line`}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={files[0] ? previews[0] : cloudinaryImage(existingUrl, { width: 900 })}
            alt="Selected image preview"
            className="w-full h-full object-cover"
          />
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button type="button" onClick={openPicker} disabled={disabled} className="btn-sm btn bg-black/60 text-white hover:bg-black/80">
              <HiRefresh className="w-4 h-4" aria-hidden="true" /> Replace
            </button>
            {(files[0] || onRemoveExisting) && (
              <button
                type="button"
                disabled={disabled}
                onClick={() => (files[0] ? onChange(null) : onRemoveExisting())}
                className="btn-sm btn bg-black/60 text-white hover:bg-black/80"
              >
                <HiX className="w-4 h-4" aria-hidden="true" /> {files[0] && existingUrl ? 'Undo' : 'Remove'}
              </button>
            )}
          </div>
        </div>
      ) : (
        emptyZone()
      )}

      {hint && <p id={hintId} className="form-hint">{hint}</p>}
      {multiple && <p className="form-hint">{existing.length + files.length} of {max} photos</p>}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
