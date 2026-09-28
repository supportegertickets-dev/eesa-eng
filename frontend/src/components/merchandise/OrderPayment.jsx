'use client';

import { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheckCircle, HiClock, HiDeviceMobile, HiReceiptTax, HiXCircle } from 'react-icons/hi';
import { getOrder, payOrderManual, payOrderMpesa } from '@/lib/api';
import { formatKES } from '@/lib/merchandise';
import { relativeTime } from '@/lib/dates';

const POLL_MS = 5000;
const POLL_LIMIT = 24; // Two minutes: Safaricom times an unanswered prompt out before then.

/**
 * Paying for an order: an STK Push to the member's phone, or an M-Pesa code
 * for money sent another way. Either can be retried until one is confirmed.
 */
export default function OrderPayment({ order, mpesaAvailable, paymentInstructions, defaultPhone, onChange }) {
  const { payment = {} } = order;
  const waitingForMpesa = payment.status === 'pending' && payment.method === 'mpesa';
  const receiptInReview = payment.status === 'pending' && payment.method === 'manual';

  const [method, setMethod] = useState(mpesaAvailable ? 'mpesa' : 'manual');
  const [phone, setPhone] = useState(defaultPhone || '');
  const [reference, setReference] = useState('');
  const [proof, setProof] = useState(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const pollRef = useRef(null);

  useEffect(() => { if (!mpesaAvailable) setMethod('manual'); }, [mpesaAvailable]);

  // Watch for the callback while a prompt is open on the member's phone.
  useEffect(() => {
    if (!waitingForMpesa) return undefined;
    setPolling(true);
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts += 1;
      try {
        const { order: latest } = await getOrder(order._id);
        if (latest.payment?.status !== 'pending' || latest.payment?.method !== 'mpesa') {
          clearInterval(pollRef.current);
          setPolling(false);
          if (latest.payment?.status === 'verified') toast.success('Payment received. Thank you!');
          else if (latest.payment?.status === 'rejected') toast.error('The M-Pesa payment did not go through.');
          onChange(latest);
          return;
        }
      } catch {
        // A dropped request just waits for the next tick.
      }
      if (attempts >= POLL_LIMIT) {
        clearInterval(pollRef.current);
        setPolling(false);
      }
    }, POLL_MS);
    return () => clearInterval(pollRef.current);
  }, [waitingForMpesa, order._id, onChange]);

  const sendPrompt = async (event) => {
    event?.preventDefault();
    setBusy(true);
    try {
      const result = await payOrderMpesa(order._id, phone.trim());
      toast.success(result.message);
      onChange(result.order);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const submitReceipt = async (event) => {
    event.preventDefault();
    setBusy(true);
    try {
      const form = new FormData();
      form.append('reference', reference.trim());
      if (proof) form.append('proof', proof);
      const result = await payOrderManual(order._id, form);
      toast.success('Code received. We will confirm your payment shortly.');
      setReference('');
      setProof(null);
      onChange(result.order);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  if (receiptInReview) {
    return (
      <div className="rounded-xl bg-warning-soft border border-warning/30 p-4 flex gap-3">
        <HiClock className="w-6 h-6 text-warning shrink-0" aria-hidden="true" />
        <div>
          <p className="font-semibold text-strong">Checking your payment</p>
          <p className="text-sm text-body mt-0.5">
            You sent M-Pesa code <span className="font-mono font-semibold">{payment.reference}</span> {relativeTime(payment.submittedAt)}.
            The treasurer will confirm it and you will get a notification.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {payment.status === 'rejected' && (
        <div className="rounded-xl bg-danger-soft border border-danger/30 p-4 flex gap-3" role="alert">
          <HiXCircle className="w-6 h-6 text-danger shrink-0" aria-hidden="true" />
          <div>
            <p className="font-semibold text-strong">The last payment attempt did not go through</p>
            {payment.rejectionReason && <p className="text-sm text-body mt-0.5">{payment.rejectionReason}</p>}
            <p className="text-sm text-muted-fg mt-0.5">Try again below.</p>
          </div>
        </div>
      )}

      {waitingForMpesa && (
        <div className="rounded-xl bg-info-soft border border-info/30 p-4 flex gap-3" role="status">
          {polling
            ? <span className="w-6 h-6 shrink-0 animate-spin rounded-full border-[3px] border-info border-t-transparent" aria-hidden="true" />
            : <HiDeviceMobile className="w-6 h-6 text-info shrink-0" aria-hidden="true" />}
          <div>
            <p className="font-semibold text-strong">{polling ? 'Check your phone' : 'Still waiting for M-Pesa'}</p>
            <p className="text-sm text-body mt-0.5">
              {polling
                ? `Enter your M-Pesa PIN on ${payment.phone ? `+${payment.phone}` : 'your phone'} to pay ${formatKES(order.total)}.`
                : 'If you paid, it will show here shortly. If no prompt arrived, send another one or enter an M-Pesa code instead.'}
            </p>
          </div>
        </div>
      )}

      <div role="tablist" aria-label="Payment method" className="flex gap-2">
        {mpesaAvailable && (
          <button type="button" role="tab" aria-selected={method === 'mpesa'} onClick={() => setMethod('mpesa')}
            className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${method === 'mpesa' ? 'bg-green-600 text-white' : 'bg-muted text-body hover:bg-muted-strong'}`}
          >
            <HiDeviceMobile className="w-4 h-4" aria-hidden="true" /> M-Pesa prompt
          </button>
        )}
        <button type="button" role="tab" aria-selected={method === 'manual'} onClick={() => setMethod('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium inline-flex items-center gap-2 ${method === 'manual' ? 'bg-primary-500 text-white' : 'bg-muted text-body hover:bg-muted-strong'}`}
        >
          <HiReceiptTax className="w-4 h-4" aria-hidden="true" /> I have an M-Pesa code
        </button>
      </div>

      {method === 'mpesa' && mpesaAvailable ? (
        <form onSubmit={sendPrompt} className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label htmlFor="pay-phone" className="form-label">M-Pesa number</label>
            <input id="pay-phone" type="tel" className="input-field" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0712 345 678" autoComplete="tel" />
          </div>
          <button type="submit" className="bg-green-600 hover:bg-green-700 text-white btn" disabled={busy || !phone.trim()}>
            {busy ? 'Sending…' : waitingForMpesa ? 'Send another prompt' : `Pay ${formatKES(order.total)}`}
          </button>
        </form>
      ) : (
        <form onSubmit={submitReceipt} className="space-y-3">
          <p className="text-sm text-body bg-muted rounded-lg p-3">
            {paymentInstructions
              ? <>Send <strong>{formatKES(order.total)}</strong> by M-Pesa: {paymentInstructions}. Use <span className="font-mono font-semibold">{order.orderNumber}</span> as the account or reference where asked.</>
              : <>Send <strong>{formatKES(order.total)}</strong> to the EESA treasurer by M-Pesa, then enter the transaction code from the confirmation SMS.</>}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="pay-reference" className="form-label">M-Pesa transaction code</label>
              <input id="pay-reference" className="input-field font-mono uppercase" required maxLength={60} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="SJK3D7HF2R" autoCapitalize="characters" />
            </div>
            <div>
              <label htmlFor="pay-proof" className="form-label">Screenshot (optional)</label>
              <input id="pay-proof" type="file" accept="image/*" className="text-sm mt-2" onChange={(e) => setProof(e.target.files?.[0] || null)} />
            </div>
          </div>
          <button type="submit" className="btn-primary" disabled={busy || !reference.trim()}>
            <HiCheckCircle className="w-4 h-4" aria-hidden="true" /> {busy ? 'Sending…' : 'Submit payment'}
          </button>
        </form>
      )}
    </div>
  );
}
