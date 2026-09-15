'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createNotification } from '@/lib/api';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'notify-member-form';

/** Send one member a portal notification that nobody else sees. */
export default function NotifyMemberDialog({ open, member, onClose }) {
  const [form, setForm] = useState({ title: '', message: '' });
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (open) setForm({ title: '', message: '' });
  }, [open]);

  const update = (field) => (event) => setForm((current) => ({ ...current, [field]: event.target.value }));

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSending(true);
    try {
      await createNotification({
        title: form.title.trim(),
        message: form.message.trim(),
        type: 'general',
        target: 'specific',
        targetUsers: [member._id],
      });
      toast.success(`Notification sent to ${member.firstName}.`);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      title={`Notify ${member?.firstName || 'member'}`}
      description="Only this member will see it, under Notifications in their portal."
      onClose={onClose}
      busy={sending}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={sending}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={sending || !form.title.trim() || !form.message.trim()}>
            {sending ? 'Sending…' : 'Send notification'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="notify-title" className="form-label">Title</label>
          <input id="notify-title" className="input-field" required maxLength={200} value={form.title} onChange={update('title')} />
        </div>
        <div>
          <label htmlFor="notify-message" className="form-label">Message</label>
          <textarea id="notify-message" className="input-field resize-y" rows={5} required maxLength={2000} value={form.message} onChange={update('message')} />
          <p className="form-hint">{form.message.length}/2000</p>
        </div>
      </form>
    </Modal>
  );
}
