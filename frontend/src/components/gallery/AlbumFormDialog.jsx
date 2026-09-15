'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { createAlbum, getEvents, updateAlbum } from '@/lib/api';
import { GALLERY_CATEGORIES, categoryLabel, formatAlbumDate, fromDateInput, toDateInput } from '@/lib/gallery';
import Modal from '@/components/ui/Modal';

const blankForm = () => ({ title: '', description: '', category: 'events', date: toDateInput(new Date()), event: '' });

/** Create an album, or edit one's title, date, category, linked event and description. */
export default function AlbumFormDialog({ open, album, onClose, onSaved }) {
  const id = useId();
  const [form, setForm] = useState(blankForm);
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [events, setEvents] = useState([]);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(album ? {
      title: album.title,
      description: album.description || '',
      category: album.category,
      date: toDateInput(album.date),
      event: album.event?._id || album.event || '',
    } : blankForm());
    getEvents('?limit=50').then((data) => setEvents(data.events || [])).catch(() => setEvents([]));
    // Reset only when the dialog opens, not whenever the album updates behind it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, album?._id]);

  // The linked event may be private or older than the recent list.
  const eventOptions = useMemo(() => {
    const linked = album?.event?._id ? album.event : null;
    return linked && !events.some((event) => event._id === linked._id) ? [linked, ...events] : events;
  }, [album, events]);

  const update = (changes) => setForm((current) => ({ ...current, ...changes }));

  const chooseEvent = (eventId) => {
    const event = eventOptions.find((option) => option._id === eventId);
    update({
      event: eventId,
      // Fill in what the event already knows, without overwriting what was typed.
      ...(event && !form.title.trim() ? { title: event.title } : {}),
      ...(event && !album ? { date: toDateInput(event.date), category: 'events' } : {}),
    });
  };

  const submit = async (e) => {
    e.preventDefault();
    const problems = {};
    if (form.title.trim().length < 2) problems.title = 'Give the album a title of at least 2 characters.';
    if (!form.date) problems.date = 'Choose when the photos were taken.';
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setSaving(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        category: form.category,
        date: fromDateInput(form.date),
        event: form.event || null,
      };
      const saved = album ? await updateAlbum(album._id, payload) : await createAlbum(payload);
      toast.success(album ? 'Album updated.' : 'Album created. Now add some photos.');
      onSaved(saved);
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const field = (name) => ({
    id: `${id}-${name}`,
    'aria-invalid': Boolean(errors[name]),
    'aria-describedby': errors[name] ? `${id}-${name}-error` : undefined,
    disabled: saving,
  });
  const errorFor = (name) => errors[name] && <p id={`${id}-${name}-error`} className="form-error">{errors[name]}</p>;

  return (
    <Modal
      open={open}
      onClose={onClose}
      busy={saving}
      title={album ? 'Edit album' : 'New album'}
      description={album ? 'The album keeps its link when you rename it.' : 'Create the album, then drop in as many photos as you like.'}
      footer={(
        <>
          <button type="button" onClick={onClose} disabled={saving} className="btn-ghost">Cancel</button>
          <button type="submit" form={`${id}-form`} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : album ? 'Save changes' : 'Create album'}
          </button>
        </>
      )}
    >
      <form id={`${id}-form`} onSubmit={submit} noValidate className="space-y-4">
        <div>
          <label htmlFor={`${id}-event`} className="form-label">
            Event <span className="font-normal text-subtle">(optional)</span>
          </label>
          <select {...field('event')} value={form.event} onChange={(e) => chooseEvent(e.target.value)} className="input-field">
            <option value="">Not linked to an event</option>
            {eventOptions.map((event) => (
              <option key={event._id} value={event._id}>
                {event.title}{event.date ? ` · ${formatAlbumDate(event.date)}` : ''}
              </option>
            ))}
          </select>
          {errorFor('event')}
        </div>

        <div>
          <label htmlFor={`${id}-title`} className="form-label">Title</label>
          <input
            {...field('title')}
            value={form.title}
            onChange={(e) => update({ title: e.target.value })}
            maxLength={120}
            placeholder="e.g. Engineering Week 2026"
            className="input-field"
          />
          {errorFor('title')}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${id}-date`} className="form-label">Date taken</label>
            <input {...field('date')} type="date" value={form.date} onChange={(e) => update({ date: e.target.value })} className="input-field" />
            {errorFor('date')}
          </div>
          <div>
            <label htmlFor={`${id}-category`} className="form-label">Category</label>
            <select {...field('category')} value={form.category} onChange={(e) => update({ category: e.target.value })} className="input-field">
              {GALLERY_CATEGORIES.map((category) => <option key={category} value={category}>{categoryLabel(category)}</option>)}
            </select>
            {errorFor('category')}
          </div>
        </div>

        <div>
          <label htmlFor={`${id}-description`} className="form-label">
            Description <span className="font-normal text-subtle">(optional)</span>
          </label>
          <textarea
            {...field('description')}
            value={form.description}
            onChange={(e) => update({ description: e.target.value })}
            maxLength={2000}
            rows={3}
            placeholder="What was the occasion?"
            className="input-field"
          />
          {errorFor('description')}
        </div>
      </form>
    </Modal>
  );
}
