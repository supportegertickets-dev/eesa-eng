'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiLocationMarker, HiX } from 'react-icons/hi';
import { cancelOrder, getOrder } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDateTime } from '@/lib/dates';
import { ORDER_STATUS, formatKES, paymentState } from '@/lib/merchandise';
import OrderItems from '@/components/merchandise/OrderItems';
import OrderPayment from '@/components/merchandise/OrderPayment';
import OrderProgress from '@/components/merchandise/OrderProgress';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton } from '@/components/ui/Skeleton';

export default function OrderPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await getOrder(id));
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Payment calls return the order alone; keep the shop settings from the first load.
  const setOrder = useCallback((order) => setData((current) => ({ ...current, order: { ...current.order, ...order } })), []);

  const cancel = async () => {
    setCancelling(true);
    try {
      const result = await cancelOrder(id);
      setOrder(result.order);
      toast.success('Order cancelled.');
      setConfirmCancel(false);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setCancelling(false);
    }
  };

  if (error) {
    return (
      <div>
        <Link href="/portal/orders" className="btn-ghost btn-sm mb-4"><HiArrowLeft className="w-4 h-4" aria-hidden="true" /> My orders</Link>
        <ErrorState error={error} onRetry={error.status === 404 ? undefined : load} title={error.status === 404 ? 'Order not found' : undefined} />
      </div>
    );
  }

  if (!data) {
    return (
      <LoadingRegion label="Loading order">
        <Skeleton className="h-8 w-56 mb-6" />
        <Skeleton className="h-24 w-full rounded-xl mb-4" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </LoadingRegion>
    );
  }

  const { order } = data;
  const status = ORDER_STATUS[order.status] || {};
  const payment = paymentState(order);
  const awaitingPayment = order.status === 'awaiting_payment' && order.payment?.status !== 'verified';
  const canCancel = order.status === 'awaiting_payment' && ['unpaid', 'rejected'].includes(order.payment?.status);
  const readyNote = [...(order.history || [])].reverse().find((entry) => entry.status === 'ready')?.note;

  return (
    <div className="max-w-3xl">
      <Link href="/portal/orders" className="btn-ghost btn-sm mb-4 -ml-3"><HiArrowLeft className="w-4 h-4" aria-hidden="true" /> My orders</Link>

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <p className="text-sm text-subtle">Order</p>
          <h1 className="page-title tracking-wide">{order.orderNumber}</h1>
          <p className="text-sm text-subtle mt-1">Placed {formatDateTime(order.createdAt)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className={status.badge}>{status.label}</span>
          <span className={payment.badge}>{payment.label}</span>
        </div>
      </div>

      <div className="space-y-6">
        <section className="card" aria-label="Progress">
          <OrderProgress order={order} />
        </section>

        {awaitingPayment && (
          <section className="card border-2 border-primary-200 dark:border-primary-500/30" aria-labelledby="pay-heading">
            <h2 id="pay-heading" className="font-heading text-lg font-semibold text-strong mb-1">Pay {formatKES(order.total)}</h2>
            <p className="text-sm text-muted-fg mb-4">Your items are set aside for you. Pay to confirm the order.</p>
            <OrderPayment
              order={order}
              mpesaAvailable={data.mpesa}
              paymentInstructions={data.paymentInstructions}
              defaultPhone={order.contactPhone || user?.phone}
              onChange={setOrder}
            />
          </section>
        )}

        {order.status === 'ready' && (
          <section className="rounded-xl border border-success/40 bg-success-soft p-4 flex gap-3" aria-label="Collection">
            <HiLocationMarker className="w-6 h-6 text-success shrink-0" aria-hidden="true" />
            <div>
              <p className="font-semibold text-strong">Ready to collect</p>
              <p className="text-sm text-body mt-0.5">
                Collect your order from {data.pickupLocation}. Bring your student ID or membership card and quote <span className="font-mono font-semibold">{order.orderNumber}</span>.
              </p>
              {readyNote && <p className="text-sm text-body mt-1">{readyNote}</p>}
            </div>
          </section>
        )}

        <section className="card" aria-labelledby="items-heading">
          <h2 id="items-heading" className="font-heading text-lg font-semibold text-strong mb-2">Items</h2>
          <OrderItems order={order} />
          {order.notes && <p className="text-sm text-muted-fg mt-4"><span className="font-medium text-body">Your notes:</span> {order.notes}</p>}
          {order.payment?.status === 'verified' && order.payment.reference && (
            <p className="text-sm text-muted-fg mt-2">Payment reference <span className="font-mono">{order.payment.reference}</span></p>
          )}
        </section>

        {canCancel && (
          <button type="button" className="btn-ghost text-danger" onClick={() => setConfirmCancel(true)}>
            <HiX className="w-4 h-4" aria-hidden="true" /> Cancel this order
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title="Cancel this order?"
        description="The items go back on sale. You can place a new order later."
        confirmLabel="Cancel order"
        cancelLabel="Keep order"
        busy={cancelling}
        onConfirm={cancel}
        onCancel={() => setConfirmCancel(false)}
      />
    </div>
  );
}
