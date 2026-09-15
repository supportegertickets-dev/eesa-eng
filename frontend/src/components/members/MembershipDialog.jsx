'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { addDays, format } from 'date-fns';
import { updateMembership } from '@/lib/api';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'membership-form';

// Matches the term applied when a submitted payment is verified.
const TERM_DAYS = 180;

const toDateInput = (date) => format(date, 'yyyy-MM-dd');

const initialForm = (member) => {
  const expiry = member?.membershipExpiry ? new Date(member.membershipExpiry) : null;
  return {
    paid: 'paid',
    // Keep a future expiry; otherwise offer a fresh term from today.
    expiry: toDateInput(expiry && expiry > new Date() ? expiry : addDays(new Date(), TERM_DAYS)),
    recordPayment: false,
    amount: '',
    type: member?.lastPaymentDate ? 'renewal' : 'registration',
    reference: '',
  };
};

/**
 * Set a member's membership by hand, for example after a cash payment at a
 * meeting, and optionally record that payment so the history stays complete.
 */
export default function MembershipDialog({ open, member, onClose, onSaved }) {
  const [form, setForm] = useState(() => initialForm(member));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setForm(initialForm(member));
      setErrors({});
    }
  }, [open, member]);

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const isPaid = form.paid === 'paid';

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setErrors({});

    const payload = { membershipPaid: isPaid };
    if (isPaid) {
      // The end of the chosen day in the administrator's time zone, so
      // "expires 30 June" still includes 30 June.
      payload.membershipExpiry = new Date(`${form.expiry}T23:59:59`).toISOString();
      if (form.recordPayment) {
        payload.payment = { amount: Number(form.amount), type: form.type, reference: form.reference.trim() };
      }
    }

    try {
      const result = await updateMembership(member._id, payload);
      toast.success(result?.message || 'Membership updated.');
      onSaved?.(result.user, result.payment);
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      title="Update membership"
      description={`Set ${member?.firstName || 'this member'}'s membership status directly. Online payments are still verified from the Payments page.`}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : 'Save membership'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5">
        <fieldset className="space-y-2">
          <legend className="form-label">Status</legend>
          <label className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 cursor-pointer has-[:checked]:border-primary-500">
            <input type="radio" name="membership-paid" value="paid" checked={isPaid} onChange={update('paid')} />
            <span className="text-sm text-body">Paid</span>
          </label>
          <label className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 cursor-pointer has-[:checked]:border-primary-500">
            <input type="radio" name="membership-paid" value="unpaid" checked={!isPaid} onChange={update('paid')} />
            <span className="text-sm text-body">Not paid</span>
          </label>
        </fieldset>

        {isPaid && (
          <>
            <div>
              <label htmlFor="membership-expiry" className="form-label">Paid until</label>
              <input
                id="membership-expiry"
                type="date"
                required
                min={toDateInput(new Date())}
                className="input-field"
                value={form.expiry}
                onChange={update('expiry')}
                aria-invalid={errors.membershipExpiry ? 'true' : undefined}
              />
              {errors.membershipExpiry
                ? <p className="form-error">{errors.membershipExpiry}</p>
                : <p className="form-hint">A standard term is {TERM_DAYS} days.</p>}
            </div>

            <div className="rounded-lg border border-line p-4 space-y-4">
              <label className="flex items-start gap-3 cursor-pointer">
                <input type="checkbox" className="mt-0.5" checked={form.recordPayment} onChange={update('recordPayment')} />
                <span>
                  <span className="block text-sm font-medium text-body">Record a payment received offline</span>
                  <span className="block text-xs text-subtle">It is saved as verified by you and appears in the member&apos;s payment history.</span>
                </span>
              </label>

              {form.recordPayment && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="membership-amount" className="form-label">Amount (KSh)</label>
                    <input
                      id="membership-amount"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      required
                      className="input-field"
                      value={form.amount}
                      onChange={update('amount')}
                      aria-invalid={errors['payment.amount'] ? 'true' : undefined}
                    />
                    {errors['payment.amount'] && <p className="form-error">{errors['payment.amount']}</p>}
                  </div>
                  <div>
                    <label htmlFor="membership-type" className="form-label">Payment for</label>
                    <select id="membership-type" className="input-field" value={form.type} onChange={update('type')}>
                      <option value="registration">Registration</option>
                      <option value="renewal">Renewal</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="membership-reference" className="form-label">Reference <span className="text-subtle font-normal">(optional)</span></label>
                    <input
                      id="membership-reference"
                      className="input-field"
                      maxLength={100}
                      placeholder="Receipt number or note"
                      value={form.reference}
                      onChange={update('reference')}
                    />
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
