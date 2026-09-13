'use client';

import { useId, useState } from 'react';
import toast from 'react-hot-toast';
import { HiPlus, HiX } from 'react-icons/hi';
import { createElection, updateElection } from '@/lib/api';
import { SUGGESTED_POSITIONS, fromLocalInput, toLocalInput } from '@/lib/elections';

/** Create an election, or edit one. Positions and the opening time lock once voting starts. */
export default function ElectionForm({ election = null, onSaved, onCancel }) {
  const editing = Boolean(election);
  const locked = editing && election.status !== 'upcoming';
  const uid = useId();
  const fieldId = (name) => `${uid}-${name}`;

  const [form, setForm] = useState({
    title: election?.title || '',
    description: election?.description || '',
    nominationDeadline: toLocalInput(election?.nominationDeadline),
    startDate: toLocalInput(election?.startDate),
    endDate: toLocalInput(election?.endDate),
  });
  const [positions, setPositions] = useState(election?.positions || []);
  const [positionInput, setPositionInput] = useState('');
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const set = (field) => (e) => {
    setForm((current) => ({ ...current, [field]: e.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const addPosition = (raw) => {
    const value = raw.trim().replace(/\s+/g, ' ');
    if (!value) return;
    if (positions.some((p) => p.toLowerCase() === value.toLowerCase())) {
      setErrors((current) => ({ ...current, positions: `"${value}" is already listed.` }));
      return;
    }
    if (positions.length >= 20) {
      setErrors((current) => ({ ...current, positions: 'An election can have at most 20 positions.' }));
      return;
    }
    setPositions((current) => [...current, value]);
    setPositionInput('');
    setErrors((current) => ({ ...current, positions: undefined }));
  };

  const validateForm = () => {
    const next = {};
    if (form.title.trim().length < 3) next.title = 'Title must be at least 3 characters.';
    if (!positions.length) next.positions = 'Add at least one position.';
    const start = form.startDate ? new Date(form.startDate) : null;
    const end = form.endDate ? new Date(form.endDate) : null;
    const nominations = form.nominationDeadline ? new Date(form.nominationDeadline) : null;
    if (!start) next.startDate = 'Choose when voting opens.';
    if (!end) next.endDate = 'Choose when voting closes.';
    else if (end <= new Date()) next.endDate = 'Voting must close in the future.';
    if (start && end && end <= start) next.endDate = 'Voting must close after it opens.';
    if (nominations && start && nominations > start) next.nominationDeadline = 'Nominations must close before voting opens.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      endDate: fromLocalInput(form.endDate),
    };
    if (!locked) {
      payload.positions = positions;
      payload.startDate = fromLocalInput(form.startDate);
      payload.nominationDeadline = fromLocalInput(form.nominationDeadline);
    }

    setSubmitting(true);
    try {
      const saved = editing ? await updateElection(election._id, payload) : await createElection(payload);
      toast.success(editing ? 'Election updated.' : 'Election created. Nominations are open.');
      onSaved?.(saved);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const fieldError = (name) => (errors[name] ? <p className="form-error">{errors[name]}</p> : null);
  const suggestions = SUGGESTED_POSITIONS.filter((p) => !positions.some((existing) => existing.toLowerCase() === p.toLowerCase()));

  return (
    <form onSubmit={handleSubmit} className="card space-y-5" noValidate>
      <div>
        <h2 className="font-heading text-lg font-semibold text-strong">{editing ? 'Edit election' : 'New election'}</h2>
        <p className="text-sm text-muted-fg mt-1">
          {locked
            ? 'Voting has started, so only the title, description and closing time can change.'
            : 'Members can apply to stand until nominations close. Voting opens and closes automatically on schedule.'}
        </p>
      </div>

      <div>
        <label htmlFor={fieldId('title')} className="form-label">Title <span className="text-danger">*</span></label>
        <input id={fieldId('title')} value={form.title} onChange={set('title')} className="input-field" maxLength={200} placeholder="e.g. EESA Committee Elections 2026" aria-invalid={Boolean(errors.title)} />
        {fieldError('title')}
      </div>

      <div>
        <label htmlFor={fieldId('description')} className="form-label">Description</label>
        <textarea id={fieldId('description')} value={form.description} onChange={set('description')} className="input-field" rows={3} maxLength={2000} placeholder="Who can stand, how campaigning works, anything members should know." />
      </div>

      <fieldset disabled={locked}>
        <legend className="form-label">Positions <span className="text-danger">*</span></legend>
        {positions.length > 0 && (
          <ul className="flex flex-wrap gap-2 mb-3">
            {positions.map((position) => (
              <li key={position} className="badge-brand text-sm py-1 pl-3 pr-1.5">
                {position}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => setPositions((current) => current.filter((p) => p !== position))}
                    className="ml-1 p-0.5 rounded-full hover:bg-primary-500/20"
                    aria-label={`Remove ${position}`}
                  >
                    <HiX className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {!locked && (
          <>
            <div className="flex gap-2">
              <input
                value={positionInput}
                onChange={(e) => setPositionInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addPosition(positionInput); } }}
                className="input-field"
                placeholder="Type a position and press Enter"
                aria-label="New position"
                maxLength={80}
              />
              <button type="button" onClick={() => addPosition(positionInput)} className="btn-outline shrink-0">
                <HiPlus className="w-4 h-4" aria-hidden="true" /> Add
              </button>
            </div>
            {suggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-xs text-subtle mr-1">Quick add:</span>
                {suggestions.map((suggestion) => (
                  <button key={suggestion} type="button" onClick={() => addPosition(suggestion)} className="text-xs px-2.5 py-1 rounded-full bg-muted text-muted-fg hover:bg-muted-strong">
                    + {suggestion}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
        {fieldError('positions')}
      </fieldset>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label htmlFor={fieldId('nominationDeadline')} className="form-label">Nominations close</label>
          <input id={fieldId('nominationDeadline')} type="datetime-local" value={form.nominationDeadline} onChange={set('nominationDeadline')} className="input-field" disabled={locked} aria-invalid={Boolean(errors.nominationDeadline)} />
          {fieldError('nominationDeadline') || <p className="form-hint">Leave blank to accept applications until voting opens.</p>}
        </div>
        <div>
          <label htmlFor={fieldId('startDate')} className="form-label">Voting opens <span className="text-danger">*</span></label>
          <input id={fieldId('startDate')} type="datetime-local" value={form.startDate} onChange={set('startDate')} className="input-field" disabled={locked} aria-invalid={Boolean(errors.startDate)} />
          {fieldError('startDate')}
        </div>
        <div>
          <label htmlFor={fieldId('endDate')} className="form-label">Voting closes <span className="text-danger">*</span></label>
          <input id={fieldId('endDate')} type="datetime-local" value={form.endDate} min={form.startDate || undefined} onChange={set('endDate')} className="input-field" aria-invalid={Boolean(errors.endDate)} />
          {fieldError('endDate')}
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-line">
        {onCancel && <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost">Cancel</button>}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? 'Saving…' : editing ? 'Save changes' : 'Create election'}
        </button>
      </div>
    </form>
  );
}
