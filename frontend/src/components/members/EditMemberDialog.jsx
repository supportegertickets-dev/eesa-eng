'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { updateMemberDetails } from '@/lib/api';
import { DEPARTMENTS } from '@/lib/roles';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'edit-member-form';

const initialForm = (member) => ({
  firstName: member?.firstName || '',
  lastName: member?.lastName || '',
  regNumber: member?.regNumber || '',
  department: member?.department || 'Other',
  yearOfStudy: String(member?.yearOfStudy || 1),
  academicStatus: member?.academicStatus || 'student',
});

/** Correct a member's name, registration number or academic details on their behalf. */
export default function EditMemberDialog({ open, member, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(member));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  // Start from the member's current details each time the dialog opens.
  useEffect(() => {
    if (open) {
      setForm(initialForm(member));
      setErrors({});
    }
  }, [open, member]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});
    try {
      const result = await updateMemberDetails(member._id, {
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        regNumber: form.regNumber.trim(),
        yearOfStudy: Number(form.yearOfStudy),
      });
      toast.success(result?.message || 'Details updated.');
      onSaved?.(result.user);
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const errorFor = (field) => errors[field] && <p id={`member-${field}-error`} className="form-error">{errors[field]}</p>;
  const invalid = (field) => ({
    'aria-invalid': errors[field] ? 'true' : undefined,
    'aria-describedby': errors[field] ? `member-${field}-error` : undefined,
  });

  return (
    <Modal
      open={open}
      title={`Edit ${member?.firstName || 'member'}'s details`}
      description="Fix details the member cannot change themselves. Their email, password and bio stay as they are."
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="member-firstName" className="form-label">First name</label>
            <input id="member-firstName" className="input-field" required maxLength={50} value={form.firstName} onChange={update('firstName')} {...invalid('firstName')} />
            {errorFor('firstName')}
          </div>
          <div>
            <label htmlFor="member-lastName" className="form-label">Last name</label>
            <input id="member-lastName" className="input-field" required maxLength={50} value={form.lastName} onChange={update('lastName')} {...invalid('lastName')} />
            {errorFor('lastName')}
          </div>
        </div>

        <div>
          <label htmlFor="member-regNumber" className="form-label">Registration number</label>
          <input id="member-regNumber" className="input-field uppercase" maxLength={30} value={form.regNumber} onChange={update('regNumber')} {...invalid('regNumber')} />
          {errors.regNumber ? errorFor('regNumber') : <p className="form-hint">Leave empty to clear it.</p>}
        </div>

        <div>
          <label htmlFor="member-department" className="form-label">Department</label>
          <select id="member-department" className="input-field" value={form.department} onChange={update('department')} {...invalid('department')}>
            {DEPARTMENTS.map((department) => <option key={department} value={department}>{department}</option>)}
          </select>
          {errorFor('department')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="member-academicStatus" className="form-label">Status</label>
            <select id="member-academicStatus" className="input-field" value={form.academicStatus} onChange={update('academicStatus')}>
              <option value="student">Student</option>
              <option value="alumni">Alumni</option>
            </select>
          </div>
          <div>
            <label htmlFor="member-yearOfStudy" className="form-label">Year of study</label>
            <select
              id="member-yearOfStudy"
              className="input-field"
              value={form.yearOfStudy}
              onChange={update('yearOfStudy')}
              disabled={form.academicStatus === 'alumni'}
              {...invalid('yearOfStudy')}
            >
              {[1, 2, 3, 4, 5].map((year) => <option key={year} value={year}>Year {year}</option>)}
            </select>
            {errorFor('yearOfStudy')}
          </div>
        </div>
        <p className="form-hint">Changing the year or status restarts the automatic yearly progression from today.</p>
      </form>
    </Modal>
  );
}
