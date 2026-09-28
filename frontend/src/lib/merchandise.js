/**
 * Labels and formatting for the merchandise shop, shared by the shop, the
 * member's orders and the treasurer's screens.
 */

export const CATEGORIES = [
  { id: 'apparel', label: 'Apparel' },
  { id: 'accessories', label: 'Accessories' },
  { id: 'stationery', label: 'Stationery' },
  { id: 'gadgets', label: 'Gadgets' },
  { id: 'other', label: 'Other' },
];

export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id;

export const ORDER_STATUS = {
  awaiting_payment: { label: 'Awaiting payment', badge: 'badge-warning' },
  paid: { label: 'Paid, being prepared', badge: 'badge-info' },
  ready: { label: 'Ready to collect', badge: 'badge-success' },
  collected: { label: 'Collected', badge: 'badge-neutral' },
  cancelled: { label: 'Cancelled', badge: 'badge-danger' },
};

export const orderStatusLabel = (status) => ORDER_STATUS[status]?.label || status;

/** What the member or treasurer needs to know about an order's payment. */
export const paymentState = (order) => {
  const { payment = {}, status } = order;
  if (payment.status === 'verified') return { label: payment.method === 'mpesa' ? 'Paid by M-Pesa' : 'Payment confirmed', badge: 'badge-success' };
  if (status === 'cancelled') return { label: 'Not paid', badge: 'badge-neutral' };
  if (payment.status === 'pending') {
    return payment.method === 'manual'
      ? { label: 'Receipt being checked', badge: 'badge-warning' }
      : { label: 'Waiting for M-Pesa', badge: 'badge-warning' };
  }
  if (payment.status === 'rejected') return { label: 'Payment failed', badge: 'badge-danger' };
  return { label: 'Not paid', badge: 'badge-neutral' };
};

export const formatKES = (amount) => `KES ${Number(amount || 0).toLocaleString('en-KE')}`;

/** Stock to show in the shop, or null when the item is not counted. */
export const stockNote = (product) => {
  if (product.stock == null) return null;
  if (product.stock <= 0) return { text: 'Sold out', tone: 'badge-danger', soldOut: true };
  if (product.stock <= 5) return { text: `Only ${product.stock} left`, tone: 'badge-warning', soldOut: false };
  return null;
};

export const itemOptions = (item) => [item.size && `Size ${item.size}`, item.color].filter(Boolean).join(' · ');
