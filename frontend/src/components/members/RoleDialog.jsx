'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { updateUserRole } from '@/lib/api';
import { ALL_ROLES, isLeadership, isPower, roleLabel } from '@/lib/roles';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'member-role-form';

const describeRole = (role) => {
  if (role === 'admin') return 'Full control: can change roles and manage every account, including other admins.';
  if (isPower(role)) return 'Can manage members, verify payments and approve content, but cannot change roles.';
  if (isLeadership(role)) return 'An office holder: can create and edit association content.';
  return 'A regular member with no management access.';
};

/** Change a member's role. The API allows this for the admin role only. */
export default function RoleDialog({ open, member, onClose, onSaved }) {
  const [role, setRole] = useState(member?.role || 'member');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRole(member?.role || 'member');
  }, [open, member]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await updateUserRole(member._id, role);
      toast.success(result?.message || `Role changed to ${roleLabel(role)}.`);
      onSaved?.(result.user);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      size="sm"
      title="Change role"
      description={`${member?.firstName || 'This member'} is currently ${roleLabel(member?.role)}.`}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving || role === member?.role}>
            {saving ? 'Saving…' : 'Change role'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit}>
        <label htmlFor="member-role" className="form-label">Role</label>
        <select id="member-role" className="input-field" value={role} onChange={(event) => setRole(event.target.value)}>
          {ALL_ROLES.map((option) => <option key={option} value={option}>{roleLabel(option)}</option>)}
        </select>
        <p className="form-hint">{describeRole(role)}</p>
      </form>
    </Modal>
  );
}
