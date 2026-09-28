'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { addDays, format } from 'date-fns';
import { bulkUpdateMembership, getPaymentFees } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { formatAmount } from '@/lib/members';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'bulk-membership-form';

// Matches the term applied when a submitted payment is verified.
const TERM_DAYS = 180;

const toDateInput = (date) => format(date, 'yyyy-MM-dd');
// The end of the chosen day in the administrator's time zone, so "paid until
// 30 June" still includes 30 June.
const endOfDay = (value) => new Date(`${value}T23:59:59`).toISOString();
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/**
 * Mark many members paid until one date: the ticked ones (`scope.ids`) or
 * everyone matching the list's filters (`scope.filter`). The server previews
 * who will change before anything is saved, and optionally records the
 * standard fee as a cash payment for each.
 */
export default function BulkMembershipDialog({ scope, description, onClose, onDone }) {
  const uid = useId();
  const [expiry, setExpiry] = useState(() => toDateInput(addDays(new Date(), TERM_DAYS)));
  const [recordPayment, setRecordPayment] = useState(false);
  const [fees, setFees] = useState(null);
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPaymentFees().then(setFees).catch(() => setFees({ registration: null, renewal: null }));
  }, []);

  // Ask the server what would change, again whenever the choices change.
  useEffect(() => {
    if (!expiry) return undefined;
    let cancelled = false;
    setPreview(null);
    setPreviewError('');
    const timer = setTimeout(() => {
      bulkUpdateMembership({ ...scope, membershipPaid: true, membershipExpiry: endOfDay(expiry), recordPayment, dryRun: true })
        .then((result) => { if (!cancelled) setPreview(result); })
        .catch((err) => { if (!cancelled) setPreviewError(err.message); });
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [scope, expiry, recordPayment]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    try {
      const result = await bulkUpdateMembership({ ...scope, membershipPaid: true, membershipExpiry: endOfDay(expiry), recordPayment });
      toast.success(result.message);
      onDone?.(result);
      onClose();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const feesSet = fees && (fees.registration || fees.renewal);
  const count = preview?.updated ?? 0;
  const skipped = preview?.skipped;
  const leftAlone = skipped && [
    skipped.unchanged && `${skipped.unchanged} already paid until then or later`,
    skipped.inactive && `${skipped.inactive} deactivated`,
    skipped.self && 'your own account, which another administrator marks',
  ].filter(Boolean);
  const payments = preview?.payments;

  return (
    <Modal
      open
      title="Mark members paid"
      description={description}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving || !preview || count === 0}>
            {saving ? 'Saving…' : preview ? `Mark ${plural(count, 'member')} paid` : 'Mark paid'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-5">
        <div>
          <label htmlFor={`${uid}-expiry`} className="form-label">Paid until</label>
          <input
            id={`${uid}-expiry`}
            type="date"
            required
            min={toDateInput(addDays(new Date(), 1))}
            className="input-field"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
          <p className="form-hint">Everyone gets this membership expiry. A standard term is {TERM_DAYS} days. Nobody already paid for longer is shortened.</p>
        </div>

        <label className={`flex items-start gap-3 ${feesSet ? 'cursor-pointer' : 'opacity-60'}`}>
          <input
            type="checkbox"
            className="mt-0.5"
            checked={recordPayment}
            disabled={!feesSet}
            onChange={(e) => setRecordPayment(e.target.checked)}
          />
          <span>
            <span className="block text-sm font-medium text-body">Record a cash payment for each</span>
            <span className="block text-xs text-subtle">
              {feesSet
                ? `The standard fee, saved as verified by you: registration${fees.registration ? ` (${formatAmount(fees.registration)})` : ''} for members paying for the first time, renewal${fees.renewal ? ` (${formatAmount(fees.renewal)})` : ''} for returning members.`
                : fees
                  ? 'The membership fees are not set on the server, so payments cannot be recorded here.'
                  : 'Checking the membership fees…'}
            </span>
          </span>
        </label>

        <div className="rounded-lg bg-muted/60 px-4 py-3 text-sm" aria-live="polite">
          {previewError ? (
            <p className="text-danger">{previewError}</p>
          ) : !preview ? (
            <p className="text-muted-fg">Checking who will change…</p>
          ) : (
            <>
              <p className="font-medium text-strong">
                {count
                  ? `${plural(count, 'member')} will be marked paid until ${formatDate(endOfDay(expiry))}.`
                  : 'Nobody here needs marking paid.'}
              </p>
              {leftAlone.length > 0 && <p className="text-muted-fg mt-1">Left alone: {leftAlone.join('; ')}.</p>}
              {payments && count > 0 && (
                <p className="text-muted-fg mt-1">
                  Payments recorded:{' '}
                  {[
                    payments.registration.count && `${plural(payments.registration.count, 'registration')} × ${formatAmount(payments.registration.fee)}`,
                    payments.renewal.count && `${plural(payments.renewal.count, 'renewal')} × ${formatAmount(payments.renewal.fee)}`,
                  ].filter(Boolean).join(' and ')}, {formatAmount(payments.total)} in total.
                </p>
              )}
              {count > 0 && <p className="text-muted-fg mt-1">Each member is notified that their membership is active.</p>}
            </>
          )}
        </div>
      </form>
    </Modal>
  );
}
