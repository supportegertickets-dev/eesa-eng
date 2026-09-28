'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiMinus, HiPlus, HiShoppingBag, HiTrash, HiLocationMarker } from 'react-icons/hi';
import { placeOrder } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { cloudinaryImage } from '@/lib/images';
import { formatKES, itemOptions } from '@/lib/merchandise';
import Modal from '@/components/ui/Modal';

/**
 * The cart and checkout. Placing an order reserves the items; payment happens
 * on the order's own page, where it can also be retried.
 */
export default function CartPanel({ open, onClose, cart, settings }) {
  const { user } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [notes, setNotes] = useState('');
  const [placing, setPlacing] = useState(false);

  useEffect(() => {
    if (user?.phone) setPhone((current) => current || user.phone);
  }, [user]);

  const checkout = async (event) => {
    event.preventDefault();
    setPlacing(true);
    try {
      const { order } = await placeOrder({
        items: cart.items.map((item) => ({ product: item.productId, quantity: item.quantity, size: item.size, color: item.color })),
        contactPhone: phone.trim(),
        notes: notes.trim(),
      });
      cart.clear();
      toast.success(`Order ${order.orderNumber} placed. Now pay to confirm it.`);
      router.push(`/portal/orders/${order._id}`);
    } catch (error) {
      toast.error(error.message);
      setPlacing(false);
    }
  };

  const loginHref = `/login?next=${encodeURIComponent('/merchandise?cart=open')}`;

  return (
    <Modal
      open={open}
      title="Your cart"
      description={cart.count ? `${cart.count} ${cart.count === 1 ? 'item' : 'items'}` : undefined}
      onClose={onClose}
      busy={placing}
      size="lg"
      footer={cart.items.length > 0 && (
        user ? (
          <button type="submit" form="checkout-form" className="btn-primary w-full sm:w-auto" disabled={placing}>
            {placing ? 'Placing order…' : `Place order · ${formatKES(cart.subtotal)}`}
          </button>
        ) : (
          <>
            <Link href="/register" className="btn-ghost">Create an account</Link>
            <Link href={loginHref} className="btn-primary">Sign in to order</Link>
          </>
        )
      )}
    >
      {cart.items.length === 0 ? (
        <div className="text-center py-10">
          <HiShoppingBag className="w-12 h-12 mx-auto text-faint" aria-hidden="true" />
          <p className="mt-3 font-semibold text-strong">Your cart is empty</p>
          <p className="text-sm text-muted-fg mt-1">Browse the shop and add something you like.</p>
        </div>
      ) : (
        <>
          <ul className="divide-y divide-line -mt-2">
            {cart.items.map((item) => (
              <li key={item.key} className="py-3 flex gap-3">
                <span className="w-16 h-16 rounded-lg overflow-hidden bg-muted shrink-0">
                  {item.image && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={cloudinaryImage(item.image, { width: 128, height: 128 })} alt="" className="w-full h-full object-cover" />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-strong truncate">{item.name}</p>
                  {itemOptions(item) && <p className="text-xs text-subtle">{itemOptions(item)}</p>}
                  <p className="text-sm text-body tabular-nums mt-0.5">{formatKES(item.price)}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="inline-flex items-center rounded-lg border border-line" role="group" aria-label={`Quantity of ${item.name}`}>
                    <button type="button" className="p-1.5 hover:bg-muted rounded-l-lg" onClick={() => cart.setQuantity(item.key, item.quantity - 1)} aria-label="One fewer">
                      <HiMinus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold tabular-nums">{item.quantity}</span>
                    <button
                      type="button"
                      className="p-1.5 hover:bg-muted rounded-r-lg disabled:opacity-40"
                      onClick={() => cart.setQuantity(item.key, item.quantity + 1)}
                      disabled={item.quantity >= (item.limit || 20)}
                      aria-label="One more"
                    >
                      <HiPlus className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  </div>
                  <button type="button" className="text-xs text-subtle hover:text-danger inline-flex items-center gap-1" onClick={() => cart.remove(item.key)}>
                    <HiTrash className="w-3.5 h-3.5" aria-hidden="true" /> Remove
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between border-t border-line pt-3 mt-1">
            <span className="text-sm text-muted-fg">Total</span>
            <span className="font-heading text-xl font-bold text-strong tabular-nums">{formatKES(cart.subtotal)}</span>
          </div>

          <p className="mt-4 text-sm text-muted-fg flex items-start gap-2 bg-muted rounded-lg p-3">
            <HiLocationMarker className="w-5 h-5 shrink-0 text-primary-500 dark:text-primary-300" aria-hidden="true" />
            <span>
              Orders are collected from {settings?.pickupLocation || 'the EESA office'}. You pay by M-Pesa after placing the order
              {settings?.holdHours ? `, and unpaid orders are released after ${settings.holdHours} hours` : ''}.
            </span>
          </p>

          {user && (
            <form id="checkout-form" onSubmit={checkout} className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="checkout-phone" className="form-label">Phone number</label>
                <input
                  id="checkout-phone"
                  type="tel"
                  className="input-field"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0712 345 678"
                  autoComplete="tel"
                />
                <p className="form-hint">So we can reach you when it is ready.</p>
              </div>
              <div>
                <label htmlFor="checkout-notes" className="form-label">Notes (optional)</label>
                <textarea
                  id="checkout-notes"
                  className="input-field"
                  rows={2}
                  maxLength={500}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Anything we should know"
                />
              </div>
            </form>
          )}
        </>
      )}
    </Modal>
  );
}
