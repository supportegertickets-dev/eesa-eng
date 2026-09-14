'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { createUnit, updateUnit } from '@/lib/api';
import { SEMESTERS, YEARS, normalizeUnitCode } from '@/lib/library';
import Modal from '@/components/ui/Modal';

const EMPTY = { code: '', name: '', year: '', semester: '', verified: true };

const orNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value));

/**
 * Add or edit a unit. Pass `unit={{}}` to add, a unit to edit, or null to close.
 */
export default function UnitFormDialog({ unit, onClose, onSaved }) {
  const id = useId();
  const editing = Boolean(unit?._id);

  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!unit) return;
    setForm(unit._id
      ? { code: unit.code, name: unit.name || '', year: unit.year ?? '', semester: unit.semester ?? '', verified: unit.verified }
      : EMPTY);
    setErrors({});
  }, [unit]);

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = async (event) => {
    event.preventDefault();
    const next = {};
    const code = normalizeUnitCode(form.code);
    if (!code) next.code = 'Unit codes look like EEEN 481.';
    if ((orNull(form.year) === null) !== (orNull(form.semester) === null)) {
      next.semester = 'Choose both a year and a semester, or neither.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const payload = {
      code,
      name: form.name.trim(),
      year: orNull(form.year),
      semester: orNull(form.semester),
      ...(editing && { verified: form.verified }),
    };

    setSaving(true);
    try {
      const saved = editing ? await updateUnit(unit._id, payload) : await createUnit(payload);
      toast.success(editing ? `${saved.code} saved.` : `${saved.code} added.`);
      onSaved?.(saved);
    } catch (error) {
      if (error.errors) setErrors(error.errors);
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const formId = `${id}-form`;

  return (
    <Modal
      open={Boolean(unit)}
      onClose={onClose}
      busy={saving}
      size="sm"
      title={editing ? `Edit ${unit.code}` : 'Add a unit'}
      description={editing
        ? 'Files in this unit follow any change to its code, year or semester.'
        : 'Units are the folders library files are filed under.'}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost">Cancel</button>
          <button type="submit" form={formId} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : editing ? 'Save changes' : 'Add unit'}
          </button>
        </>
      )}
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${id}-code`} className="form-label">Unit code <span className="text-danger">*</span></label>
          <input
            id={`${id}-code`}
            value={form.code}
            onChange={set('code')}
            maxLength={12}
            autoComplete="off"
            placeholder="EEEN 481"
            aria-invalid={Boolean(errors.code)}
            className="input-field uppercase"
          />
          {errors.code && <p className="form-error">{errors.code}</p>}
        </div>

        <div>
          <label htmlFor={`${id}-name`} className="form-label">Name</label>
          <input
            id={`${id}-name`}
            value={form.name}
            onChange={set('name')}
            maxLength={150}
            placeholder="Project Management"
            aria-invalid={Boolean(errors.name)}
            className="input-field"
          />
          {errors.name && <p className="form-error">{errors.name}</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${id}-year`} className="form-label">Year</label>
            <select id={`${id}-year`} value={form.year} onChange={set('year')} className="input-field">
              <option value="">None</option>
              {YEARS.map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${id}-semester`} className="form-label">Semester</label>
            <select
              id={`${id}-semester`}
              value={form.semester}
              onChange={set('semester')}
              aria-invalid={Boolean(errors.semester)}
              className="input-field"
            >
              <option value="">None</option>
              {SEMESTERS.map((semester) => <option key={semester} value={semester}>Semester {semester}</option>)}
            </select>
          </div>
          <p className={`col-span-2 !mt-0 ${errors.semester ? 'form-error' : 'form-hint'}`}>
            {errors.semester || 'Leave both as None for service and elective units.'}
          </p>
        </div>

        {editing && (
          <label className="flex items-center gap-3 cursor-pointer w-fit">
            <input type="checkbox" checked={form.verified} onChange={set('verified')} className="w-4 h-4 accent-primary-500" />
            <span className="text-sm text-body">Confirmed (shown to all members)</span>
          </label>
        )}
      </form>
    </Modal>
  );
}
