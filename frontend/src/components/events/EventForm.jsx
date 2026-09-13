'use client';

import { useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { createEvent, updateEvent } from '@/lib/api';
import { toLocalInput, fromLocalInput } from '@/lib/dates';
import { EVENT_CATEGORIES, EVENT_STATUSES, MAX_EVENT_PHOTOS } from '@/lib/events';
import ImageDropzone from '@/components/ui/ImageDropzone';

const EMPTY = {
  title: '', description: '', date: '', endDate: '', location: '',
  category: 'other', maxAttendees: 0, isPublic: true, status: 'upcoming',
};

const formFrom = (event) => (event ? {
  title: event.title || '',
  description: event.description || '',
  date: toLocalInput(event.date),
  endDate: toLocalInput(event.endDate),
  location: event.location || '',
  category: event.category || 'other',
  maxAttendees: event.maxAttendees || 0,
  isPublic: event.isPublic !== false,
  status: event.status || 'upcoming',
} : EMPTY);

/**
 * Create or edit an event, including its cover image and photo gallery.
 * Pass `event` to edit; omit it to create.
 */
export default function EventForm({ event = null, onSaved, onCancel }) {
  const editing = Boolean(event);
  const uid = useId();
  const fieldId = (name) => `${uid}-${name}`;

  const [form, setForm] = useState(() => formFrom(event));
  const [cover, setCover] = useState(null);
  const [removeCover, setRemoveCover] = useState(false);
  const [photos, setPhotos] = useState([]);
  const [removedPhotoIds, setRemovedPhotoIds] = useState([]);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [progress, setProgress] = useState(0);

  const existingPhotos = useMemo(
    () => (event?.photos || [])
      .filter((photo) => !removedPhotoIds.includes(photo._id))
      .map((photo) => ({ id: photo._id, url: photo.url })),
    [event, removedPhotoIds]
  );

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setForm((current) => ({ ...current, [field]: value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const fieldError = (name) => (errors[name] ? <p className="form-error" id={`${fieldId(name)}-error`}>{errors[name]}</p> : null);
  const invalid = (name) => ({
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${fieldId(name)}-error` : undefined,
  });

  const validateForm = () => {
    const next = {};
    if (form.title.trim().length < 3) next.title = 'Title must be at least 3 characters.';
    if (form.description.trim().length < 10) next.description = 'Description must be at least 10 characters.';
    if (!form.date) next.date = 'Choose when the event starts.';
    if (form.endDate && form.date && new Date(form.endDate) < new Date(form.date)) {
      next.endDate = 'The end time must be after the start time.';
    }
    if (form.location.trim().length < 2) next.location = 'Enter where the event takes place.';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const reset = () => {
    setForm(EMPTY);
    setCover(null);
    setRemoveCover(false);
    setPhotos([]);
    setRemovedPhotoIds([]);
    setErrors({});
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;

    const data = new FormData();
    data.append('title', form.title.trim());
    data.append('description', form.description.trim());
    data.append('date', fromLocalInput(form.date));
    if (form.endDate || editing) data.append('endDate', fromLocalInput(form.endDate));
    data.append('location', form.location.trim());
    data.append('category', form.category);
    data.append('maxAttendees', String(Math.max(0, parseInt(form.maxAttendees, 10) || 0)));
    data.append('isPublic', String(form.isPublic));
    if (editing) data.append('status', form.status);
    if (cover) data.append('image', cover);
    photos.forEach((photo) => data.append('photos', photo));
    if (editing && removeCover && !cover) data.append('removeImage', 'true');
    if (editing && removedPhotoIds.length) data.append('removePhotoIds', JSON.stringify(removedPhotoIds));

    setSubmitting(true);
    setProgress(0);
    try {
      const saved = editing
        ? await updateEvent(event._id, data, setProgress)
        : await createEvent(data, setProgress);
      toast.success(editing ? 'Event updated.' : 'Event created. Members have been notified by email.');
      if (!editing) reset();
      onSaved?.(saved);
    } catch (err) {
      if (err.errors) setErrors(err.errors);
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const uploading = submitting && (cover || photos.length > 0);

  return (
    <form onSubmit={handleSubmit} className="card space-y-6" noValidate>
      <div>
        <h2 className="font-heading text-lg font-semibold text-strong">{editing ? 'Edit event' : 'Create event'}</h2>
        <p className="text-sm text-muted-fg mt-1">
          {editing ? 'Changes are visible to members as soon as you save.' : 'All members are emailed when a new event is published.'}
        </p>
      </div>

      <ImageDropzone
        label="Cover image"
        hint="Shown on event cards and as the banner on the event page. A wide 16:9 photo works best."
        value={cover}
        onChange={(file) => { setCover(file); if (file) setRemoveCover(false); }}
        existingUrl={editing && !removeCover ? event.image : ''}
        onRemoveExisting={editing && event.image ? () => setRemoveCover(true) : undefined}
        aspect="video"
        disabled={submitting}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label htmlFor={fieldId('title')} className="form-label">Title <span className="text-danger">*</span></label>
          <input id={fieldId('title')} type="text" value={form.title} onChange={set('title')} className="input-field" maxLength={200} {...invalid('title')} />
          {fieldError('title')}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={fieldId('description')} className="form-label">Description <span className="text-danger">*</span></label>
          <textarea id={fieldId('description')} rows={5} value={form.description} onChange={set('description')} className="input-field resize-y" maxLength={5000} {...invalid('description')} />
          {fieldError('description')}
        </div>

        <div>
          <label htmlFor={fieldId('date')} className="form-label">Starts <span className="text-danger">*</span></label>
          <input id={fieldId('date')} type="datetime-local" value={form.date} onChange={set('date')} className="input-field" {...invalid('date')} />
          {fieldError('date')}
        </div>

        <div>
          <label htmlFor={fieldId('endDate')} className="form-label">Ends</label>
          <input id={fieldId('endDate')} type="datetime-local" value={form.endDate} min={form.date || undefined} onChange={set('endDate')} className="input-field" {...invalid('endDate')} />
          {fieldError('endDate') || <p className="form-hint">Optional.</p>}
        </div>

        <div className="sm:col-span-2">
          <label htmlFor={fieldId('location')} className="form-label">Location <span className="text-danger">*</span></label>
          <input id={fieldId('location')} type="text" value={form.location} onChange={set('location')} className="input-field" maxLength={200} placeholder="e.g. Engineering Block, Lecture Hall 2" {...invalid('location')} />
          {fieldError('location')}
        </div>

        <div>
          <label htmlFor={fieldId('category')} className="form-label">Category</label>
          <select id={fieldId('category')} value={form.category} onChange={set('category')} className="input-field capitalize">
            {EVENT_CATEGORIES.map((category) => (
              <option key={category} value={category} className="capitalize">{category}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={fieldId('maxAttendees')} className="form-label">Capacity</label>
          <input id={fieldId('maxAttendees')} type="number" min="0" value={form.maxAttendees} onChange={set('maxAttendees')} className="input-field" {...invalid('maxAttendees')} />
          {fieldError('maxAttendees') || <p className="form-hint">0 means unlimited.</p>}
        </div>

        {editing && (
          <div>
            <label htmlFor={fieldId('status')} className="form-label">Status</label>
            <select id={fieldId('status')} value={form.status} onChange={set('status')} className="input-field capitalize">
              {EVENT_STATUSES.map((status) => (
                <option key={status} value={status} className="capitalize">{status}</option>
              ))}
            </select>
          </div>
        )}

        <label className="flex items-center gap-3 sm:col-span-2 cursor-pointer w-fit">
          <input type="checkbox" checked={form.isPublic} onChange={set('isPublic')} className="w-4 h-4 accent-primary-500" />
          <span className="text-sm text-body">Show on the public events page</span>
        </label>
      </div>

      <ImageDropzone
        label="Photo gallery"
        hint="Optional. Add photos now, or come back after the event to share pictures from it."
        multiple
        max={MAX_EVENT_PHOTOS}
        value={photos}
        onChange={setPhotos}
        existing={existingPhotos}
        onRemoveExisting={(id) => setRemovedPhotoIds((ids) => [...ids, id])}
        disabled={submitting}
      />

      {uploading && (
        <div aria-live="polite">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary-500 transition-all duration-200" style={{ width: `${progress}%` }} />
          </div>
          <p className="form-hint">{progress < 100 ? `Uploading images… ${progress}%` : 'Processing images…'}</p>
        </div>
      )}

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-line">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost">Cancel</button>
        )}
        <button type="submit" disabled={submitting} className="btn-primary">
          {submitting ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save changes' : 'Create event')}
        </button>
      </div>
    </form>
  );
}
