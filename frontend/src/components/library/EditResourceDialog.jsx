'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { updateResource } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { RESOURCE_TYPES, TYPE_LABELS, filingProblems, normalizeUnitCode } from '@/lib/library';
import { useLibrary } from '@/components/library/LibraryProvider';
import UnitPicker from '@/components/library/UnitPicker';
import Modal from '@/components/ui/Modal';

const detailsFrom = (resource) => ({
  title: resource.title || '',
  description: resource.description || '',
  category: resource.category || 'other',
  unitId: resource.unit?._id || '',
  unitCode: resource.unit?.code || resource.unitCode || '',
  unitName: resource.unit?.name || '',
  year: resource.unit?.year ?? resource.year ?? '',
  semester: resource.unit?.semester ?? resource.semester ?? '',
});

const orNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

/** Edit a file's details or move it to another unit. */
export default function EditResourceDialog({ resource, onClose, onSaved }) {
  const id = useId();
  const { isAdmin } = useAuth();
  const { units, refresh } = useLibrary();

  const [details, setDetails] = useState(null);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!resource) return;
    setDetails(detailsFrom(resource));
    setShowErrors(false);
  }, [resource]);

  if (!resource || !details) return null;

  // The file's own unit may not be confirmed yet, so it is not in the member's
  // unit list; include it so the picker shows it as selected.
  const pickerUnits = resource.unit && !units.some((unit) => unit._id === resource.unit._id)
    ? [...units, resource.unit]
    : units;

  const problems = filingProblems(details, pickerUnits);
  const unitChanged = details.unitId
    ? details.unitId !== (resource.unit?._id || '')
    : normalizeUnitCode(details.unitCode) !== resource.unitCode;

  const set = (field) => (event) => setDetails((current) => ({ ...current, [field]: event.target.value }));

  const submit = async (event) => {
    event.preventDefault();
    if (Object.keys(problems).length) {
      setShowErrors(true);
      return;
    }

    const payload = {
      title: details.title.trim(),
      description: details.description.trim(),
      category: details.category,
    };
    if (unitChanged) {
      if (details.unitId) {
        payload.unit = details.unitId;
      } else {
        Object.assign(payload, {
          unitCode: normalizeUnitCode(details.unitCode),
          unitName: details.unitName?.trim() || '',
          year: orNull(details.year),
          semester: orNull(details.semester),
        });
      }
    }

    setSaving(true);
    try {
      const updated = await updateResource(resource._id, payload);
      toast.success(updated.status === 'pending' && resource.status !== 'pending'
        ? 'Saved and sent back for review.'
        : 'Changes saved.');
      onSaved?.(updated);
      refresh();
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const formId = `${id}-form`;

  return (
    <Modal
      open
      onClose={onClose}
      busy={saving}
      size="lg"
      title="Edit or move file"
      description={resource.originalFileName}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost">Cancel</button>
          <button type="submit" form={formId} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        {!isAdmin && resource.status === 'rejected' && (
          <p className="rounded-lg bg-info-soft text-info text-sm px-3 py-2">Saving sends this file back to the reviewers.</p>
        )}

        <div>
          <label htmlFor={`${id}-title`} className="form-label">Title <span className="text-danger">*</span></label>
          <input
            id={`${id}-title`}
            value={details.title}
            onChange={set('title')}
            maxLength={200}
            aria-invalid={showErrors && Boolean(problems.title)}
            className="input-field"
          />
          {showErrors && problems.title && <p className="form-error">{problems.title}</p>}
        </div>

        <div>
          <label htmlFor={`${id}-type`} className="form-label">Type</label>
          <select id={`${id}-type`} value={details.category} onChange={set('category')} className="input-field">
            {RESOURCE_TYPES.map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
          </select>
        </div>

        <div>
          <label htmlFor={`${id}-description`} className="form-label">
            Description <span className="font-normal text-subtle">(optional)</span>
          </label>
          <textarea
            id={`${id}-description`}
            rows={2}
            value={details.description}
            onChange={set('description')}
            maxLength={1000}
            className="input-field resize-y"
          />
        </div>

        <UnitPicker
          units={pickerUnits}
          value={details}
          onChange={(next) => setDetails((current) => ({ ...current, ...next }))}
          disabled={saving}
          error={showErrors ? problems.unit : undefined}
        />
      </form>
    </Modal>
  );
}
