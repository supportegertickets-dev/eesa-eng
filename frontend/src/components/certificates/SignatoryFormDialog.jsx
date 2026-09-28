'use client';

import { useEffect, useId, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiUpload } from 'react-icons/hi';
import { createSignatory, updateSignatory } from '@/lib/api';
import { cleanSignature } from '@/lib/certificates';
import { validateImageFile } from '@/lib/images';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'signatory-form';
const TITLE_SUGGESTIONS = ['Chairperson', 'Patron', 'Secretary General', 'Vice Chairperson', 'Dean, Faculty of Engineering and Technology'];
const TYPES = [
  { id: 'leadership', label: 'Leadership certificates' },
  { id: 'membership', label: 'Membership certificates' },
];

const initialForm = (signatory) => ({
  name: signatory?.name || '',
  title: signatory?.title || '',
  certificateTypes: signatory?.certificateTypes || TYPES.map((t) => t.id),
});

/**
 * Add or change a signatory. The signature image is cleaned in the browser:
 * the paper becomes transparent so the signature sits on the certificate as
 * if signed on it. A signature that does not clean well can be kept as it is.
 */
export default function SignatoryFormDialog({ open, signatory, onClose, onSaved }) {
  const uid = useId();
  const inputRef = useRef(null);
  const editing = Boolean(signatory);
  const [form, setForm] = useState(() => initialForm(signatory));
  const [original, setOriginal] = useState(null); // File
  const [cleaned, setCleaned] = useState(null); // { blob, url }
  const [cleanError, setCleanError] = useState('');
  const [removeBackground, setRemoveBackground] = useState(true);
  const [originalUrl, setOriginalUrl] = useState('');
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(signatory));
    setOriginal(null);
    setCleaned(null);
    setCleanError('');
    setRemoveBackground(true);
    setErrors({});
  }, [open, signatory]);

  // Object URLs for the previews, released when replaced.
  useEffect(() => {
    if (!original) { setOriginalUrl(''); return undefined; }
    const url = URL.createObjectURL(original);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [original]);
  useEffect(() => () => { if (cleaned) URL.revokeObjectURL(cleaned.url); }, [cleaned]);

  const choose = async (file) => {
    if (!file) return;
    const problem = validateImageFile(file);
    if (problem) {
      setErrors((e) => ({ ...e, signature: problem }));
      return;
    }
    setErrors((e) => ({ ...e, signature: undefined }));
    setOriginal(file);
    setCleaned(null);
    setCleanError('');
    try {
      setCleaned(await cleanSignature(file));
      setRemoveBackground(true);
    } catch (err) {
      setCleanError(err.message);
      setRemoveBackground(false);
    }
  };

  const toggleType = (id) => setForm((current) => ({
    ...current,
    certificateTypes: current.certificateTypes.includes(id)
      ? current.certificateTypes.filter((t) => t !== id)
      : [...current.certificateTypes, id],
  }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!form.name.trim()) nextErrors.name = 'Enter the signatory\'s name.';
    if (!form.title.trim()) nextErrors.title = 'Enter their title, such as Chairperson.';
    if (!form.certificateTypes.length) nextErrors.certificateTypes = 'Choose which certificates they sign.';
    if (!editing && !original) nextErrors.signature = 'Upload a photo or scan of the signature.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const data = new FormData();
    data.append('name', form.name.trim());
    data.append('title', form.title.trim());
    data.append('certificateTypes', form.certificateTypes.join(','));
    if (original) {
      if (removeBackground && cleaned) data.append('signature', cleaned.blob, 'signature.png');
      else data.append('signature', original);
    }

    setSaving(true);
    setErrors({});
    try {
      const result = editing ? await updateSignatory(signatory._id, data) : await createSignatory(data);
      toast.success(editing ? 'Signatory updated.' : `${result.signatory.name} added.`);
      onSaved?.(result.signatory);
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const preview = original ? (removeBackground && cleaned ? cleaned.url : originalUrl) : signatory?.signatureUrl;

  return (
    <Modal
      open={open}
      title={editing ? 'Edit signatory' : 'Add a signatory'}
      description="Their signature, name and title are printed at the foot of each certificate issued from now on. Certificates already issued keep the signatures they have."
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save' : 'Add signatory'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5" noValidate>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-name`} className="form-label">Name</label>
            <input
              id={`${uid}-name`}
              className="input-field"
              maxLength={80}
              placeholder="e.g. Dr. Jane Wanjiru"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              aria-invalid={errors.name ? 'true' : undefined}
            />
            {errors.name && <p className="form-error">{errors.name}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-title`} className="form-label">Title</label>
            <input
              id={`${uid}-title`}
              className="input-field"
              list={`${uid}-titles`}
              maxLength={80}
              placeholder="e.g. Patron"
              value={form.title}
              onChange={(e) => setForm((c) => ({ ...c, title: e.target.value }))}
              aria-invalid={errors.title ? 'true' : undefined}
            />
            <datalist id={`${uid}-titles`}>
              {TITLE_SUGGESTIONS.map((title) => <option key={title} value={title} />)}
            </datalist>
            {errors.title && <p className="form-error">{errors.title}</p>}
          </div>
        </div>

        <fieldset>
          <legend className="form-label">Signs</legend>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {TYPES.map((type) => (
              <label key={type.id} className="flex items-center gap-2 text-sm text-body cursor-pointer">
                <input type="checkbox" checked={form.certificateTypes.includes(type.id)} onChange={() => toggleType(type.id)} />
                {type.label}
              </label>
            ))}
          </div>
          {errors.certificateTypes && <p className="form-error">{errors.certificateTypes}</p>}
        </fieldset>

        <div>
          <p className="form-label" id={`${uid}-signature`}>Signature</p>
          <div className="rounded-lg border border-line bg-[#fffdf7] h-36 flex items-center justify-center p-4" aria-labelledby={`${uid}-signature`}>
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="Signature preview" className="max-h-full max-w-full object-contain" />
            ) : (
              <p className="text-sm text-gray-500 text-center">Sign in dark ink on plain white paper, then photograph or scan it.</p>
            )}
          </div>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ''; }}
          />
          <div className="flex flex-wrap items-center gap-3 mt-3">
            <button type="button" className="btn-outline btn-sm" onClick={() => inputRef.current?.click()}>
              <HiUpload className="w-4 h-4" aria-hidden="true" /> {original || editing ? 'Choose another image' : 'Choose image'}
            </button>
            {original && cleaned && (
              <label className="flex items-center gap-2 text-sm text-body cursor-pointer">
                <input type="checkbox" checked={removeBackground} onChange={(e) => setRemoveBackground(e.target.checked)} />
                Remove the paper background
              </label>
            )}
          </div>
          {errors.signature
            ? <p className="form-error">{errors.signature}</p>
            : cleanError
              ? <p className="form-hint text-warning">{cleanError} It will be used as it is.</p>
              : <p className="form-hint">JPG, PNG or WebP up to 5MB. Crop close to the signature for the best result.</p>}
        </div>
      </form>
    </Modal>
  );
}
