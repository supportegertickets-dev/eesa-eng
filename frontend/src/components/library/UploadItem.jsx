'use client';

import { useId, useState } from 'react';
import { HiCheckCircle, HiExclamationCircle, HiSparkles, HiX } from 'react-icons/hi';
import {
  RESOURCE_TYPES, TYPE_LABELS, fileKind, filingProblems, formatBytes, isNewUnit, normalizeUnitCode, placementLabel,
} from '@/lib/library';
import { FileIcon } from '@/components/library/ResourceRow';
import UnitPicker from '@/components/library/UnitPicker';

/** Say where the suggested filing came from, so the member knows what to check. */
const detectionNote = (item, newUnit) => {
  if (item.usedPreset) return 'Filed in the unit you were viewing.';
  if (!item.sources?.unit) return item.scanned ? 'No unit code found in the file or its name.' : 'No unit code found in the file name.';
  let note = `Unit found in the ${item.sources.unit}`;
  if (newUnit && item.sources.placement === 'document') note += '; year and semester read from the document';
  if (newUnit && item.sources.placement === 'unit code') note += '; year guessed from the unit code, please check it';
  return `${note}.`;
};

/** One file in the upload dialog: its detected details, editable before upload. */
export default function UploadItem({ item, units, disabled, onChange, onRemove }) {
  const id = useId();
  const { file, status, details } = item;
  const [expanded, setExpanded] = useState(false);

  const problems = filingProblems(details, units);
  const hasProblems = Object.keys(problems).length > 0;
  const newUnit = isNewUnit(details, units);
  const editable = status === 'ready' || status === 'error';
  const showForm = editable && (expanded || hasProblems);
  const locked = disabled || !editable;
  const update = (changes) => onChange({ ...details, ...changes });

  const knownUnit = details.unitId ? units.find((unit) => unit._id === details.unitId) : null;
  const placement = placementLabel(knownUnit || details);

  let statusLine;
  if (status === 'analyzing') {
    statusLine = (
      <span className="inline-flex items-center gap-1.5">
        <span className="w-3 h-3 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" aria-hidden="true" />
        Reading file…
      </span>
    );
  } else if (status === 'uploading') {
    statusLine = `Uploading… ${item.progress}%`;
  } else if (status === 'done') {
    statusLine = (
      <span className="inline-flex items-center gap-1 text-success">
        <HiCheckCircle className="w-4 h-4" aria-hidden="true" />
        {item.result?.status === 'approved' ? 'Published' : 'Sent for review'}
      </span>
    );
  } else if (status === 'error') {
    statusLine = (
      <span className="inline-flex items-center gap-1 text-danger">
        <HiExclamationCircle className="w-4 h-4" aria-hidden="true" /> Upload failed
      </span>
    );
  } else if (hasProblems) {
    statusLine = (
      <span className="inline-flex items-center gap-1 text-warning">
        <HiExclamationCircle className="w-4 h-4" aria-hidden="true" /> Needs your input
      </span>
    );
  } else {
    statusLine = (
      <span className="inline-flex items-center gap-1">
        <HiSparkles className="w-4 h-4 text-accent-500 shrink-0" aria-hidden="true" /> {detectionNote(item, newUnit)}
      </span>
    );
  }

  return (
    <li className={`rounded-xl border bg-surface p-3 sm:p-4 ${status === 'error' ? 'border-danger/40' : 'border-line'}`}>
      <div className="flex items-start gap-3">
        <FileIcon kind={fileKind(file)} className="w-10 h-10" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-strong truncate" title={file.name}>{file.name}</p>
          <p className="mt-0.5 text-xs text-subtle">{formatBytes(file.size)} · {statusLine}</p>

          {status === 'uploading' && (
            <div
              className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden"
              role="progressbar"
              aria-valuenow={item.progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${file.name}`}
            >
              <div className="h-full bg-primary-500 transition-all duration-200" style={{ width: `${item.progress}%` }} />
            </div>
          )}
          {status === 'error' && item.error && <p className="mt-1 text-sm text-danger">{item.error}</p>}
        </div>

        {(editable || status === 'analyzing') && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            aria-label={`Remove ${file.name}`}
            className="p-1.5 -m-1 rounded-lg text-subtle hover:text-danger hover:bg-danger-soft transition-colors"
          >
            <HiX className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {editable && !showForm && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          disabled={disabled}
          className="mt-3 w-full flex items-center justify-between gap-3 rounded-lg bg-muted px-3 py-2 text-left text-sm hover:bg-muted-strong transition-colors"
        >
          <span className="min-w-0 truncate">
            <span className="font-semibold text-strong">{normalizeUnitCode(details.unitCode) || details.unitCode}</span>
            <span className="text-body"> · {TYPE_LABELS[details.category]} · {placement}</span>
            {newUnit && <span className="badge-info ml-2">New unit</span>}
          </span>
          <span className="font-medium text-primary-500 dark:text-primary-300 shrink-0">Edit</span>
        </button>
      )}

      {showForm && (
        <div className="mt-4 space-y-4">
          <UnitPicker units={units} value={details} onChange={update} disabled={locked} error={problems.unit} />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="sm:col-span-2">
              <label htmlFor={`${id}-title`} className="form-label">Title</label>
              <input
                id={`${id}-title`}
                value={details.title}
                onChange={(event) => update({ title: event.target.value })}
                maxLength={200}
                disabled={locked}
                aria-invalid={Boolean(problems.title)}
                className="input-field"
              />
              {problems.title && <p className="form-error">{problems.title}</p>}
            </div>
            <div>
              <label htmlFor={`${id}-type`} className="form-label">Type</label>
              <select
                id={`${id}-type`}
                value={details.category}
                onChange={(event) => update({ category: event.target.value })}
                disabled={locked}
                className="input-field"
              >
                {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor={`${id}-description`} className="form-label">
                Description <span className="font-normal text-subtle">(optional)</span>
              </label>
              <input
                id={`${id}-description`}
                value={details.description}
                onChange={(event) => update({ description: event.target.value })}
                maxLength={1000}
                disabled={locked}
                placeholder="e.g. 2023 main exam"
                className="input-field"
              />
            </div>
          </div>

          {!hasProblems && (
            <button type="button" onClick={() => setExpanded(false)} className="text-sm font-medium text-subtle hover:text-body">
              Done editing
            </button>
          )}
        </div>
      )}
    </li>
  );
}
