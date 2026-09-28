'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'platform-password-form';

/**
 * Asks the superadmin for their password before a platform control takes
 * effect. The server checks it; a wrong one keeps the dialog open.
 */
export default function PasswordDialog({
  open, title, description, confirmLabel = 'Confirm', destructive = false, busy = false, error = '', onConfirm, onClose,
}) {
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (open) setPassword('');
  }, [open]);

  const submit = (event) => {
    event.preventDefault();
    if (password) onConfirm(password);
  };

  return (
    <Modal
      open={open}
      size="sm"
      title={title}
      description={description}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" form={FORM_ID} className={destructive ? 'btn-danger' : 'btn-primary'} disabled={busy || !password}>
            {busy ? 'Working…' : confirmLabel}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={submit}>
        {error && <div role="alert" className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3 mb-4">{error}</div>}
        <label htmlFor="platform-password" className="form-label">Your password</label>
        <input
          id="platform-password"
          type="password"
          className="input-field"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoFocus
          required
        />
        <p className="form-hint">Every change here is recorded in the audit log.</p>
      </form>
    </Modal>
  );
}
