'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { getSignatories, updateCertificate } from '@/lib/api';
import { DEPARTMENTS, OFFICE_ROLES, roleLabel } from '@/lib/roles';
import { CERTIFICATE_TITLES, toDateInput } from '@/lib/certificates';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'certificate-edit-form';
const OFFICE_SUGGESTIONS = OFFICE_ROLES.map(roleLabel);
const PRINTED_DEPARTMENTS = DEPARTMENTS.filter((d) => d !== 'Other');

// The fields each kind of certificate prints, in the order the form shows them.
const FIELDS = {
  leadership: ['recipientName', 'regNumber', 'department', 'office', 'startDate', 'endDate', 'issuedAt'],
  membership: ['recipientName', 'regNumber', 'department', 'academicYear', 'issuedAt'],
};

const initialForm = (c) => ({
  recipientName: c.recipientName || '',
  regNumber: c.regNumber || '',
  department: c.department || '',
  office: c.office || '',
  startDate: toDateInput(c.startDate),
  endDate: toDateInput(c.endDate),
  academicYear: c.academicYear || '',
  issuedAt: toDateInput(c.issuedAt),
});

const sameSignatures = (a, b) => a.length === b.length
  && a.every((s, i) => s.name === b[i].name && s.title === b[i].title && s.signatureUrl === b[i].signatureUrl);

/** Academic years around today's and the certificate's own, newest first. */
const academicYearOptions = (current) => {
  const thisYear = new Date().getFullYear();
  const years = [];
  for (let y = thisYear; y >= thisYear - 12; y -= 1) years.push(`${y}/${y + 1}`);
  if (current && !years.includes(current)) years.push(current);
  return years.sort().reverse();
};

/**
 * Correct the details printed on an issued certificate. It keeps its number,
 * so its QR code still works; the change is logged and the holder is told.
 */
export default function CertificateEditDialog({ certificate, onClose, onSaved }) {
  const uid = useId();
  const [form, setForm] = useState(() => (certificate ? initialForm(certificate) : null));
  const [refreshSignatories, setRefreshSignatories] = useState(false);
  const [currentSignatories, setCurrentSignatories] = useState(null);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!certificate) return undefined;
    setForm(initialForm(certificate));
    setRefreshSignatories(false);
    setErrors({});
    setCurrentSignatories(null);

    let cancelled = false;
    getSignatories()
      .then(({ signatories }) => {
        if (!cancelled) setCurrentSignatories(signatories.filter((s) => s.certificateTypes.includes(certificate.type)).slice(0, 3));
      })
      .catch(() => { if (!cancelled) setCurrentSignatories([]); });
    return () => { cancelled = true; };
  }, [certificate]);

  const original = useMemo(() => (certificate ? initialForm(certificate) : null), [certificate]);
  const departments = useMemo(() => {
    const list = [...PRINTED_DEPARTMENTS];
    if (certificate?.department && !list.includes(certificate.department)) list.push(certificate.department);
    return list;
  }, [certificate]);

  if (!certificate || !form) return null;

  const fields = FIELDS[certificate.type];
  const clean = (field, value) => (field === 'regNumber' ? value.trim().toUpperCase() : value.trim());
  const changedFields = fields.filter((field) => clean(field, form[field]) !== clean(field, original[field]));
  const signaturesDiffer = currentSignatories?.length > 0 && !sameSignatures(certificate.signatories || [], currentSignatories);
  const nothingChanged = changedFields.length === 0 && !(refreshSignatories && signaturesDiffer);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const next = {};
    if (!form.recipientName.trim()) next.recipientName = 'Enter the name to print.';
    if (certificate.type === 'leadership') {
      if (!form.office.trim()) next.office = 'Enter the office held.';
      if (!form.startDate) next.startDate = 'Enter the start date.';
      if (!form.endDate) next.endDate = 'Enter the end date.';
      if (form.startDate && form.endDate && form.endDate < form.startDate) next.endDate = 'The term must end after it starts.';
    }
    if (!form.issuedAt) next.issuedAt = 'Enter the issue date.';
    if (Object.keys(next).length) {
      setErrors(next);
      return;
    }

    const payload = Object.fromEntries(changedFields.map((field) => [field, clean(field, form[field])]));
    if (refreshSignatories && signaturesDiffer) payload.refreshSignatories = true;

    setSaving(true);
    setErrors({});
    try {
      const result = await updateCertificate(certificate._id, payload);
      if (result.changed) {
        toast.success(certificate.user ? 'Certificate updated. The holder has been told to download the new copy.' : 'Certificate updated.');
      } else {
        toast('Nothing needed changing.');
      }
      onSaved?.(result.certificate);
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const input = (field, label, { hint, ...props } = {}) => (
    <div>
      <label htmlFor={`${uid}-${field}`} className="form-label">{label}</label>
      <input
        id={`${uid}-${field}`}
        className="input-field"
        value={form[field]}
        onChange={update(field)}
        aria-invalid={errors[field] ? 'true' : undefined}
        {...props}
      />
      {errors[field] ? <p className="form-error">{errors[field]}</p> : hint ? <p className="form-hint">{hint}</p> : null}
    </div>
  );

  return (
    <Modal
      open
      size="lg"
      title="Edit certificate details"
      description={`${CERTIFICATE_TITLES[certificate.type]} ${certificate.number}. It keeps this number, so its QR code keeps working and shows the corrected details. Every change is logged.`}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving || nothingChanged}>
            {saving ? 'Saving…' : 'Save changes'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5" noValidate>
        {input('recipientName', 'Name', {
          maxLength: 100,
          required: true,
          hint: certificate.user ? 'Printed exactly as typed. This changes the certificate only, not the member\'s profile.' : 'Printed exactly as typed.',
        })}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {input('regNumber', 'Registration number', { maxLength: 40, className: 'input-field uppercase', placeholder: 'Not printed if empty' })}
          <div>
            <label htmlFor={`${uid}-department`} className="form-label">Department</label>
            <select id={`${uid}-department`} className="input-field" value={form.department} onChange={update('department')}>
              <option value="">Not printed</option>
              {departments.map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
        </div>

        {certificate.type === 'leadership' ? (
          <>
            <div>
              {input('office', 'Office', { maxLength: 80, required: true, list: `${uid}-offices` })}
              <datalist id={`${uid}-offices`}>
                {OFFICE_SUGGESTIONS.map((office) => <option key={office} value={office} />)}
              </datalist>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {input('startDate', 'Served from', { type: 'date', required: true })}
              {input('endDate', 'Served until', { type: 'date', required: true, min: form.startDate || undefined })}
            </div>
            {certificate.term && <p className="form-hint -mt-2">The office and dates are corrected on the leadership term too.</p>}
          </>
        ) : (
          <div>
            <label htmlFor={`${uid}-academicYear`} className="form-label">Academic year</label>
            <select id={`${uid}-academicYear`} className="input-field" value={form.academicYear} onChange={update('academicYear')}>
              {academicYearOptions(certificate.academicYear).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            {errors.academicYear && <p className="form-error">{errors.academicYear}</p>}
          </div>
        )}

        {input('issuedAt', 'Issued on', { type: 'date', required: true, max: toDateInput(new Date()) })}

        <div className="rounded-lg border border-line p-4">
          <p className="text-sm font-medium text-body">Signatures</p>
          <p className="text-sm text-muted-fg mt-0.5">
            {(certificate.signatories || []).map((s) => `${s.name} (${s.title})`).join(', ') || 'None'}
          </p>
          {currentSignatories === null ? (
            <p className="form-hint">Checking the current signatories…</p>
          ) : signaturesDiffer ? (
            <label className="flex items-start gap-3 mt-3 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={refreshSignatories} onChange={(e) => setRefreshSignatories(e.target.checked)} />
              <span className="text-sm text-body">
                Replace them with the current signatories:{' '}
                <span className="text-muted-fg">{currentSignatories.map((s) => `${s.name} (${s.title})`).join(', ')}</span>
              </span>
            </label>
          ) : currentSignatories.length ? (
            <p className="form-hint">These are the current signatories.</p>
          ) : (
            <p className="form-hint">Nobody signs {certificate.type} certificates at the moment, so the signatures stay as they are.</p>
          )}
        </div>
      </form>
    </Modal>
  );
}
