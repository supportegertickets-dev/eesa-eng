'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HiChevronRight, HiShoppingBag } from 'react-icons/hi';
import { getMyOrders } from '@/lib/api';
import { formatDate } from '@/lib/dates';
import { cloudinaryImage } from '@/lib/images';
import { ORDER_STATUS, formatKES, paymentState } from '@/lib/merchandise';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

export default function MyOrdersPage() {
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setOrders((await getMyOrders()).orders || []);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <h1 className="page-title">My Orders</h1>
          <p className="text-muted-fg mt-1">Merchandise you have ordered from the EESA shop.</p>
        </div>
        <Link href="/merchandise" className="btn-primary">
          <HiShoppingBag className="w-4 h-4" aria-hidden="true" /> Visit the shop
        </Link>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !orders ? (
        <LoadingRegion label="Loading your orders"><SkeletonList count={3} /></LoadingRegion>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={HiShoppingBag}
          title="No orders yet"
          description="Hoodies, T-shirts and more are waiting in the shop."
          action="Browse merchandise"
          actionHref="/merchandise"
        />
      ) : (
        <ul className="space-y-3">
          {orders.map((order) => {
            const status = ORDER_STATUS[order.status] || {};
            const payment = paymentState(order);
            const needsPayment = order.status === 'awaiting_payment' && ['unpaid', 'rejected'].includes(order.payment?.status);
            const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
            return (
              <li key={order._id}>
                <Link href={`/portal/orders/${order._id}`} className="card p-4 flex items-center gap-4 hover:shadow-raised transition-shadow">
                  <span className="flex -space-x-3 shrink-0">
                    {order.items.slice(0, 3).map((item, index) => (
                      <span key={index} className="w-12 h-12 rounded-lg overflow-hidden bg-muted border-2 border-surface">
                        {item.image && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={cloudinaryImage(item.image, { width: 96, height: 96 })} alt="" className="w-full h-full object-cover" />
                        )}
                      </span>
                    ))}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-mono font-semibold text-strong">{order.orderNumber}</span>
                      <span className={status.badge}>{status.label}</span>
                      {order.status === 'awaiting_payment' && <span className={payment.badge}>{payment.label}</span>}
                    </span>
                    <span className="block text-sm text-subtle truncate mt-0.5">
                      {count} {count === 1 ? 'item' : 'items'} · {formatKES(order.total)} · {formatDate(order.createdAt)}
                    </span>
                    {needsPayment && <span className="block text-sm font-medium text-primary-500 dark:text-primary-300 mt-1">Pay now to confirm this order</span>}
                  </span>
                  <HiChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
