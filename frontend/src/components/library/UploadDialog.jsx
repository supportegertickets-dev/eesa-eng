'use client';

import { useCallback, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCloudUpload, HiPlus } from 'react-icons/hi';
import { uploadResource } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import {
  ACCEPT_ATTRIBUTE, MAX_FILES_PER_UPLOAD, filingProblems, normalizeUnitCode, plural, titleFromFileName, validateLibraryFile,
} from '@/lib/library';
import { analyzeFile } from '@/lib/libraryDetect';
import UploadItem from '@/components/library/UploadItem';
import Modal from '@/components/ui/Modal';

let nextKey = 0;

const blankDetails = (file) => ({
  title: titleFromFileName(file.name),
  description: '',
  category: 'notes',
  unitId: '',
  unitCode: '',
  unitName: '',
  year: '',
  semester: '',
});

const buildForm = ({ file, details }) => {
  const form = new FormData();
  form.append('title', details.title.trim());
  if (details.description.trim()) form.append('description', details.description.trim());
  form.append('category', details.category);
  if (details.unitId) {
    form.append('unit', details.unitId);
  } else {
    form.append('unitCode', normalizeUnitCode(details.unitCode));
    if (details.unitName?.trim()) form.append('unitName', details.unitName.trim());
    form.append('year', String(details.year ?? ''));
    form.append('semester', String(details.semester ?? ''));
  }
  // Last, so every text field has been read by the time the file arrives.
  form.append('file', file);
  return form;
};

/**
 * Upload several files at once.
 *
 * Each file is read in the browser as soon as it is added, to suggest its unit,
 * year, semester and type. The member reviews the suggestions, then the files
 * upload one after another, each with its own progress and its own outcome, so
 * one failure does not lose the rest of the batch.
 *
 * @param {object|null} preset a unit to file anything unrecognised under, when
 *   the dialog is opened from inside that unit's folder
 */
export default function UploadDialog({ open, preset, units, onClose, onUploaded }) {
  const { isAdmin } = useAuth();
  const inputRef = useRef(null);
  const [items, setItems] = useState([]);
  const [notices, setNotices] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);

  const patch = useCallback((key, changes) => setItems((list) => list.map((item) => (
    item.key === key ? { ...item, ...(typeof changes === 'function' ? changes(item) : changes) } : item
  ))), []);

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;

    const problems = [];
    const accepted = [];
    const queued = items.filter((item) => item.status !== 'done');

    for (const file of files) {
      const problem = validateLibraryFile(file);
      if (problem) problems.push(problem);
      else if (queued.some((item) => item.file.name === file.name && item.file.size === file.size)) problems.push(`"${file.name}" is already in the list.`);
      else accepted.push(file);
    }

    const room = Math.max(0, MAX_FILES_PER_UPLOAD - queued.length);
    if (accepted.length > room) {
      const left = accepted.length - room;
      problems.push(`You can upload ${MAX_FILES_PER_UPLOAD} files at a time, so ${plural(left, 'file')} ${left === 1 ? 'was' : 'were'} left out.`);
      accepted.length = room;
    }
    setNotices(problems);

    const fresh = accepted.map((file) => ({ key: ++nextKey, file, status: 'analyzing', progress: 0, details: blankDetails(file) }));
    setItems((list) => [...list.filter((item) => item.status !== 'done'), ...fresh]);

    fresh.forEach(async (item) => {
      const suggestion = await analyzeFile(item.file, units).catch(() => null);
      patch(item.key, (current) => {
        if (!suggestion) return { status: 'ready' };
        const details = {
          ...current.details,
          title: suggestion.title || current.details.title,
          category: suggestion.category,
          unitId: suggestion.unitId,
          unitCode: suggestion.unitCode,
          unitName: suggestion.unitName,
          year: suggestion.year,
          semester: suggestion.semester,
        };
        const usePreset = !suggestion.unitCode && Boolean(preset);
        if (usePreset) {
          Object.assign(details, {
            unitId: preset._id,
            unitCode: preset.code,
            unitName: preset.name || '',
            year: preset.year ?? '',
            semester: preset.semester ?? '',
          });
        }
        return { status: 'ready', details, sources: suggestion.sources, scanned: suggestion.scanned, usedPreset: usePreset };
      });
    });
  };

  const queue = items.filter((item) => item.status === 'ready' || item.status === 'error');
  const analyzing = items.some((item) => item.status === 'analyzing');
  const allDone = items.length > 0 && items.every((item) => item.status === 'done');

  const upload = async () => {
    if (queue.some((item) => Object.keys(filingProblems(item.details, units)).length)) {
      toast.error('Some files still need a unit or a title.');
      return;
    }

    setUploading(true);
    let succeeded = 0;
    for (const item of queue) {
      patch(item.key, { status: 'uploading', progress: 0, error: '' });
      try {
        const saved = await uploadResource(buildForm(item), (progress) => patch(item.key, { progress }));
        patch(item.key, { status: 'done', result: saved });
        succeeded += 1;
      } catch (error) {
        patch(item.key, { status: 'error', error: error.message });
      }
    }
    setUploading(false);

    if (succeeded) {
      toast.success(isAdmin
        ? `${plural(succeeded, 'file')} published.`
        : `${plural(succeeded, 'file')} sent for review. You will be notified once reviewed.`);
      onUploaded?.();
    }
    if (succeeded < queue.length) toast.error(`${plural(queue.length - succeeded, 'file')} could not be uploaded. Fix and retry.`);
  };

  const close = () => {
    if (uploading) return;
    setItems([]);
    setNotices([]);
    onClose();
  };

  const dropHandlers = {
    onDragOver: (event) => {
      event.preventDefault();
      if (!uploading) setDragging(true);
    },
    onDragLeave: (event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) setDragging(false);
    },
    onDrop: (event) => {
      event.preventDefault();
      setDragging(false);
      if (!uploading) addFiles(event.dataTransfer.files);
    },
  };

  const openPicker = () => inputRef.current?.click();

  let primaryLabel = 'Upload';
  if (uploading) primaryLabel = 'Uploading…';
  else if (analyzing) primaryLabel = 'Reading files…';
  else if (queue.length) primaryLabel = `Upload ${plural(queue.length, 'file')}`;

  return (
    <Modal
      open={open}
      onClose={close}
      busy={uploading}
      size="lg"
      closeOnBackdrop={false}
      title={preset ? `Upload to ${preset.code}` : 'Upload files'}
      description={isAdmin
        ? 'Your uploads are published straight away.'
        : 'A reviewer checks each file before it appears in the library.'}
      footer={allDone ? (
        <button type="button" onClick={close} className="btn-primary">Done</button>
      ) : (
        <>
          <button type="button" onClick={close} disabled={uploading} className="btn-ghost">Cancel</button>
          <button type="button" onClick={upload} disabled={uploading || analyzing || !queue.length} className="btn-primary">
            {primaryLabel}
          </button>
        </>
      )}
    >
      <div {...dropHandlers} className={`rounded-xl transition-colors ${dragging && items.length ? 'ring-2 ring-primary-500 bg-primary-500/5' : ''}`}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT_ATTRIBUTE}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            addFiles(event.target.files);
            event.target.value = '';
          }}
        />

        {!items.length ? (
          <>
            <button
              type="button"
              onClick={openPicker}
              className={`w-full flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors
                ${dragging ? 'border-primary-500 bg-primary-500/10' : 'border-line-strong hover:border-primary-400 hover:bg-muted'}`}
            >
              <HiCloudUpload className="w-10 h-10 text-faint" aria-hidden="true" />
              <span className="text-sm font-medium text-body">
                <span className="text-primary-500 dark:text-primary-300">Choose files</span> or drag them here
              </span>
              <span className="text-xs text-subtle">
                PDF, Word, PowerPoint, Excel, text or images · up to 20 MB each · {MAX_FILES_PER_UPLOAD} at a time
              </span>
            </button>
            <p className="form-hint text-center">
              Each file is read to find its unit, year, semester and type. You can check and change them before uploading.
            </p>
          </>
        ) : (
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-sm text-subtle">{plural(items.length, 'file')}</p>
            {!uploading && !allDone && items.length < MAX_FILES_PER_UPLOAD && (
              <button type="button" onClick={openPicker} className="btn-ghost btn-sm">
                <HiPlus className="w-4 h-4" aria-hidden="true" /> Add more
              </button>
            )}
          </div>
        )}

        {notices.length > 0 && (
          <div role="alert" className="my-3 rounded-lg bg-danger-soft text-danger text-sm px-3 py-2 space-y-1">
            {notices.map((notice) => <p key={notice}>{notice}</p>)}
          </div>
        )}

        {items.length > 0 && (
          <ul className="space-y-3">
            {items.map((item) => (
              <UploadItem
                key={item.key}
                item={item}
                units={units}
                disabled={uploading}
                onChange={(details) => patch(item.key, { details })}
                onRemove={() => setItems((list) => list.filter((entry) => entry.key !== item.key))}
              />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  );
}
