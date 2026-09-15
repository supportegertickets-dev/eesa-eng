'use client';

import { useRef, useState } from 'react';
import { HiCheckCircle, HiCloudUpload, HiPhotograph, HiRefresh, HiX } from 'react-icons/hi';
import { IMAGE_TYPES, cloudinaryImage } from '@/lib/images';
import { MAX_ALBUM_PHOTOS, photoCountLabel } from '@/lib/gallery';
import usePhotoUploads from '@/components/gallery/usePhotoUploads';

const formatBytes = (bytes = 0) => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`);

function UploadRow({ item, onRetry, onRemove }) {
  const { file, status, progress } = item;

  let detail;
  if (status === 'queued') detail = <span className="text-subtle">{formatBytes(file.size)} · Waiting</span>;
  else if (status === 'preparing') detail = <span className="text-subtle">Optimising…</span>;
  else if (status === 'uploading' && progress >= 100) detail = <span className="text-subtle">Processing…</span>;
  else if (status === 'error') detail = <span className="text-danger">{item.error}</span>;
  else if (status === 'done') {
    detail = (
      <span className="inline-flex items-center gap-1 text-success">
        <HiCheckCircle className="w-3.5 h-3.5" aria-hidden="true" />
        Uploaded{item.uploadSize < file.size ? ` · resized from ${formatBytes(file.size)} to ${formatBytes(item.uploadSize)}` : ''}
      </span>
    );
  }

  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span className="w-10 h-10 rounded-md bg-muted overflow-hidden shrink-0 flex items-center justify-center">
        {item.photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cloudinaryImage(item.photo.url, { width: 80, height: 80 })} alt="" className="w-full h-full object-cover" />
        ) : (
          <HiPhotograph className="w-5 h-5 text-faint" aria-hidden="true" />
        )}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-strong truncate" title={file.name}>{file.name}</p>
        {status === 'uploading' && progress < 100 ? (
          <div
            className="mt-1.5 h-1 rounded-full bg-muted overflow-hidden"
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Uploading ${file.name}`}
          >
            <div className="h-full bg-primary-500 transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
        ) : (
          <p className="text-xs mt-0.5 truncate">{detail}</p>
        )}
      </div>

      {status === 'error' && (
        <button type="button" onClick={onRetry} className="btn-ghost btn-sm" aria-label={`Retry ${file.name}`}>
          <HiRefresh className="w-4 h-4" aria-hidden="true" /> Retry
        </button>
      )}
      {['queued', 'error', 'done'].includes(status) && (
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg text-subtle hover:text-strong hover:bg-muted transition-colors"
          aria-label={`Remove ${file.name} from the list`}
        >
          <HiX className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </li>
  );
}

/**
 * Drop zone and upload queue for adding photos to an album.
 */
export default function PhotoUploader({ albumId, photoCount, onUploaded, onBatchComplete }) {
  const inputRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [notices, setNotices] = useState([]);
  const [expanded, setExpanded] = useState(true);
  const uploads = usePhotoUploads({ albumId, photoCount, onUploaded, onBatchComplete });
  const { items, stats } = uploads;

  const full = photoCount >= MAX_ALBUM_PHOTOS;
  const compact = photoCount > 0;
  const addFiles = (files) => setNotices(uploads.add(files));

  // Photos being dragged to reorder carry no files and must not light the zone up.
  const carriesFiles = (event) => Array.from(event.dataTransfer?.types || []).includes('Files');
  const dropHandlers = {
    onDragOver: (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      if (!full) setDragging(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    },
    onDrop: (event) => {
      if (!carriesFiles(event)) return;
      event.preventDefault();
      setDragging(false);
      if (!full) addFiles(event.dataTransfer.files);
    },
  };

  let headline;
  if (stats.busy) headline = `Uploading photos · ${stats.done} of ${stats.total} done${stats.failed ? `, ${stats.failed} failed` : ''}`;
  else if (stats.failed) headline = `${stats.done} uploaded, ${stats.failed} failed`;
  else headline = `${photoCountLabel(stats.done)} uploaded`;

  return (
    <section aria-label="Upload photos" className="space-y-3">
      <input
        ref={inputRef}
        type="file"
        accept={IMAGE_TYPES.join(',')}
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />

      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={full}
        {...dropHandlers}
        className={`w-full flex items-center justify-center rounded-xl border-2 border-dashed transition-colors
          disabled:opacity-60 disabled:cursor-not-allowed
          ${compact ? 'flex-row gap-3 px-4 py-4 text-left' : 'flex-col gap-2 px-6 py-12 sm:py-16 text-center'}
          ${dragging ? 'border-primary-500 bg-primary-500/10' : 'border-line-strong hover:border-primary-400 hover:bg-muted'}`}
      >
        <HiCloudUpload className={`${compact ? 'w-7 h-7' : 'w-12 h-12'} text-faint shrink-0`} aria-hidden="true" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-body">
            {full ? `This album is full (${MAX_ALBUM_PHOTOS} photos)` : (
              <><span className="text-primary-500 dark:text-primary-300">Choose photos</span> or drag them here</>
            )}
          </span>
          <span className="block text-xs text-subtle mt-0.5">
            JPG, PNG, WebP or GIF · large photos are resized before uploading · up to {MAX_ALBUM_PHOTOS} per album
          </span>
        </span>
      </button>

      {notices.length > 0 && (
        <div role="alert" className="rounded-lg bg-danger-soft text-danger text-sm px-3 py-2 space-y-1">
          {notices.map((notice) => <p key={notice}>{notice}</p>)}
        </div>
      )}

      {items.length > 0 && (
        <div className="card p-0 overflow-hidden">
          <div className="px-4 py-3 flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="flex-1 min-w-[12rem]">
              <p className="text-sm font-medium text-strong" aria-live="polite">{headline}</p>
              <div
                className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"
                role="progressbar"
                aria-valuenow={stats.progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Overall upload progress"
              >
                <div
                  className={`h-full transition-all duration-300 ${!stats.busy && stats.failed ? 'bg-warning' : !stats.busy ? 'bg-success' : 'bg-primary-500'}`}
                  style={{ width: `${stats.progress}%` }}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {stats.failed > 0 && (
                <button type="button" onClick={uploads.retryFailed} className="btn-outline btn-sm">
                  <HiRefresh className="w-4 h-4" aria-hidden="true" /> Retry {stats.failed} failed
                </button>
              )}
              {stats.queued > 0 && (
                <button type="button" onClick={uploads.cancelQueued} className="btn-ghost btn-sm">Cancel remaining</button>
              )}
              {!stats.busy && (
                <button type="button" onClick={() => { uploads.clearFinished(); setNotices([]); }} className="btn-ghost btn-sm">Dismiss</button>
              )}
              <button type="button" onClick={() => setExpanded((open) => !open)} aria-expanded={expanded} className="btn-ghost btn-sm">
                {expanded ? 'Hide details' : 'Show details'}
              </button>
            </div>
          </div>

          {expanded && (
            <ul className="border-t border-line max-h-72 overflow-y-auto divide-y divide-line">
              {items.map((item) => (
                <UploadRow
                  key={item.key}
                  item={item}
                  onRetry={() => uploads.retry(item.key)}
                  onRemove={() => uploads.remove(item.key)}
                />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
