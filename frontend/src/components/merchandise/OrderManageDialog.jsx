'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCheck, HiExternalLink, HiMail, HiPhone, HiX } from 'react-icons/hi';
import { cancelOrder, reviewOrderPayment, setOrderStatus } from '@/lib/api';
import { formatDateTime } from '@/lib/dates';
import { ORDER_STATUS, formatKES, orderStatusLabel, paymentState } from '@/lib/merchandise';
import Modal from '@/components/ui/Modal';
import OrderItems from '@/components/merchandise/OrderItems';
import OrderProgress from '@/components/merchandise/OrderProgress';

/**
 * Everything the treasurer does with one order: check the payment, prepare it,
 * hand it over, or cancel it. Actions that need a reason or a note ask for one
 * in place rather than in a second dialog.
 */
export default function OrderManageDialog({ order, onClose, onChanged }) {
  const [mode, setMode] = useState(null); // null | 'reject' | 'ready' | 'cancel'
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setMode(null); setText(''); }, [order?._id]);

  if (!order) return null;

  const buyer = order.user || {};
  const name = [buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Deleted member';
  const { payment = {} } = order;
  const paymentPending = order.status === 'awaiting_payment' && payment.status === 'pending';

  const run = async (action, success) => {
    setBusy(true);
    try {
      const result = await action();
      toast.success(success);
      setMode(null);
      setText('');
      onChanged(result.order);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setBusy(false);
    }
  };

  const confirmPayment = () => run(() => reviewOrderPayment(order._id, { status: 'verified' }), 'Payment confirmed. The member has been told.');
  const markCollected = () => run(() => setOrderStatus(order._id, { status: 'collected' }), 'Marked as collected.');

  const submitMode = (event) => {
    event.preventDefault();
    const value = text.trim();
    if (mode === 'reject') run(() => reviewOrderPayment(order._id, { status: 'rejected', reason: value }), 'Payment rejected. The member can pay again.');
    if (mode === 'ready') run(() => setOrderStatus(order._id, { status: 'ready', note: value }), 'Marked ready. The member has been told to collect it.');
    if (mode === 'cancel') run(() => cancelOrder(order._id, value), 'Order cancelled and stock returned.');
  };

  const modeCopy = {
    reject: { label: 'Why is the payment being rejected?', placeholder: 'Code not found on the statement', button: 'Reject payment', required: true, danger: true },
    ready: { label: 'Collection details (optional)', placeholder: 'Weekdays 2–5pm', button: 'Mark ready', required: false },
    cancel: {
      label: 'Reason for cancelling',
      placeholder: 'Out of stock in this size',
      button: 'Cancel order',
      required: false,
      danger: true,
      warning: payment.status === 'verified' ? `This order is paid (${formatKES(order.total)}). Refund the member after cancelling.` : null,
    },
  }[mode];

  const canCancel = !['collected', 'cancelled'].includes(order.status);

  return (
    <Modal
      open
      title={`Order ${order.orderNumber}`}
      description={`${orderStatusLabel(order.status)} · ${formatKES(order.total)} · placed ${formatDateTime(order.createdAt)}`}
      onClose={onClose}
      busy={busy}
      size="lg"
      footer={!mode && (
        <>
          {canCancel && (
            <button type="button" className="btn-ghost text-danger sm:mr-auto" onClick={() => setMode('cancel')} disabled={busy}>Cancel order</button>
          )}
          {paymentPending && (
            <>
              <button type="button" className="btn-ghost text-danger" onClick={() => setMode('reject')} disabled={busy}>
                <HiX className="w-4 h-4" aria-hidden="true" /> Reject payment
              </button>
              <button type="button" className="btn-primary" onClick={confirmPayment} disabled={busy}>
                <HiCheck className="w-4 h-4" aria-hidden="true" /> Confirm payment
              </button>
            </>
          )}
          {order.status === 'paid' && (
            <>
              <button type="button" className="btn-ghost" onClick={markCollected} disabled={busy}>Handed over now</button>
              <button type="button" className="btn-primary" onClick={() => setMode('ready')} disabled={busy}>Mark ready to collect</button>
            </>
          )}
          {order.status === 'ready' && (
            <button type="button" className="btn-primary" onClick={markCollected} disabled={busy}>
              <HiCheck className="w-4 h-4" aria-hidden="true" /> Mark collected
            </button>
          )}
        </>
      )}
    >
      <div className="space-y-6">
        <OrderProgress order={order} />

        {mode && (
          <form onSubmit={submitMode} className="rounded-xl border border-line-strong p-4 space-y-3">
            {modeCopy.warning && <p className="text-sm text-warning font-medium">{modeCopy.warning}</p>}
            <label htmlFor="order-action-text" className="form-label">{modeCopy.label}</label>
            <textarea
              id="order-action-text"
              className="input-field"
              rows={2}
              maxLength={300}
              required={modeCopy.required}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={modeCopy.placeholder}
            />
            <div className="flex gap-2 justify-end">
              <button type="button" className="btn-ghost" onClick={() => setMode(null)} disabled={busy}>Back</button>
              <button type="submit" className={modeCopy.danger ? 'btn-danger' : 'btn-primary'} disabled={busy || (modeCopy.required && !text.trim())}>
                {busy ? 'Saving…' : modeCopy.button}
              </button>
            </div>
          </form>
        )}

        <section aria-labelledby="buyer-heading">
          <h3 id="buyer-heading" className="text-sm font-semibold text-strong mb-2">Member</h3>
          <div className="rounded-xl bg-muted p-3 text-sm space-y-1">
            <p className="font-medium text-strong">{name}{buyer.regNumber && <span className="text-subtle font-normal"> · {buyer.regNumber}</span>}</p>
            {buyer.email && (
              <p><a href={`mailto:${buyer.email}?subject=${encodeURIComponent(`EESA order ${order.orderNumber}`)}`} className="inline-flex items-center gap-1.5 text-primary-500 dark:text-primary-300 hover:underline"><HiMail className="w-4 h-4" aria-hidden="true" />{buyer.email}</a></p>
            )}
            {(order.contactPhone || buyer.phone) && (
              <p><a href={`tel:${order.contactPhone || buyer.phone}`} className="inline-flex items-center gap-1.5 text-primary-500 dark:text-primary-300 hover:underline"><HiPhone className="w-4 h-4" aria-hidden="true" />{order.contactPhone || buyer.phone}</a></p>
            )}
            {order.notes && <p className="text-body pt-1">&ldquo;{order.notes}&rdquo;</p>}
          </div>
        </section>

        <section aria-labelledby="payment-heading">
          <h3 id="payment-heading" className="text-sm font-semibold text-strong mb-2">Payment</h3>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-subtle">Status</dt>
            <dd><span className={paymentState(order).badge}>{paymentState(order).label}</span></dd>
            {payment.method && (<><dt className="text-subtle">Method</dt><dd className="text-body">{payment.method === 'mpesa' ? 'M-Pesa prompt' : 'M-Pesa code sent by member'}</dd></>)}
            {payment.reference && (<><dt className="text-subtle">Code</dt><dd className="font-mono text-strong">{payment.reference}</dd></>)}
            {payment.phone && (<><dt className="text-subtle">Paid from</dt><dd className="text-body">+{payment.phone}</dd></>)}
            {payment.submittedAt && (<><dt className="text-subtle">Submitted</dt><dd className="text-body">{formatDateTime(payment.submittedAt)}</dd></>)}
            {payment.verifiedBy && (<><dt className="text-subtle">Checked by</dt><dd className="text-body">{payment.verifiedBy.firstName} {payment.verifiedBy.lastName}</dd></>)}
            {payment.rejectionReason && (<><dt className="text-subtle">Reason</dt><dd className="text-danger">{payment.rejectionReason}</dd></>)}
          </dl>
          {payment.proofUrl && (
            <a href={payment.proofUrl} target="_blank" rel="noopener noreferrer" className="btn-ghost btn-sm mt-2 -ml-3">
              <HiExternalLink className="w-4 h-4" aria-hidden="true" /> View payment screenshot
            </a>
          )}
        </section>

        <section aria-labelledby="order-items-heading">
          <h3 id="order-items-heading" className="text-sm font-semibold text-strong mb-1">Items</h3>
          <OrderItems order={order} />
        </section>

        {order.history?.length > 0 && (
          <section aria-labelledby="history-heading">
            <h3 id="history-heading" className="text-sm font-semibold text-strong mb-2">History</h3>
            <ol className="space-y-2 text-sm border-l-2 border-line pl-4">
              {order.history.map((entry, index) => (
                <li key={index}>
                  <span className={`${ORDER_STATUS[entry.status]?.badge || 'badge-neutral'} mr-2`}>{orderStatusLabel(entry.status)}</span>
                  <span className="text-subtle">{formatDateTime(entry.at)}{entry.by?.firstName ? ` · ${entry.by.firstName} ${entry.by.lastName || ''}` : ''}</span>
                  {entry.note && <p className="text-body mt-0.5">{entry.note}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </Modal>
  );
}
