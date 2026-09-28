const crypto = require('crypto');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { ApiError } = require('./asyncHandler');
const { receiptFrom } = require('./mpesa');

// Unpaid orders hold their stock this long before they are cancelled, so an
// abandoned checkout cannot keep an item out of the shop indefinitely.
const ORDER_HOLD_HOURS = Number(process.env.ORDER_HOLD_HOURS) || 72;
const EXPIRY_CHECK_INTERVAL_MS = 10 * 60 * 1000;

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const randomCode = (length) => {
  let code = '';
  for (let i = 0; i < length; i += 1) code += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return code;
};

/** "ORD-7K3M9Q". Short enough for M-Pesa's 12-character account reference. */
const generateOrderNumber = () => `ORD-${randomCode(6)}`;

const slugify = (text) => String(text || '')
  .toLowerCase()
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60) || 'item';

/** A slug no other product uses: "eesa-hoodie", then "eesa-hoodie-2". */
const uniqueProductSlug = async (name) => {
  const base = slugify(name);
  for (let n = 1; n < 50; n += 1) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await Product.exists({ slug: candidate }))) return candidate;
  }
  return `${base}-${randomCode(4).toLowerCase()}`;
};

const addHistory = (order, status, { by, note } = {}) => {
  order.history.push({ status, at: new Date(), by, note });
};

/** Total quantity per product, for items that may repeat a product in several sizes. */
const quantitiesByProduct = (items) => {
  const totals = new Map();
  for (const item of items) {
    const id = String(item.product?._id || item.product);
    totals.set(id, (totals.get(id) || 0) + item.quantity);
  }
  return totals;
};

/**
 * Put back stock an order was holding. Products that do not count stock are
 * left alone, as are products deleted since.
 */
const releaseStock = async (items) => {
  await Promise.all([...quantitiesByProduct(items)].map(([id, quantity]) =>
    Product.updateOne({ _id: id, stock: { $ne: null } }, { $inc: { stock: quantity } })));
};

/**
 * Take an order's quantities off stock, all or nothing. Each decrement only
 * succeeds while enough remains, so two members cannot both buy the last one.
 * @param {Array} items order items
 * @param {Map<string, object>} products the ordered products by id
 */
const reserveStock = async (items, products) => {
  const taken = [];
  for (const [id, quantity] of quantitiesByProduct(items)) {
    const product = products.get(id);
    if (product.stock == null) continue;

    const result = await Product.updateOne({ _id: id, stock: { $gte: quantity } }, { $inc: { stock: -quantity } });
    if (result.modifiedCount !== 1) {
      await releaseStock(taken);
      const left = (await Product.findById(id).select('stock').lean())?.stock ?? 0;
      throw new ApiError(409, left > 0
        ? `Only ${left} ${product.name} ${left === 1 ? 'is' : 'are'} left. Reduce the quantity and try again.`
        : `${product.name} has sold out.`);
    }
    taken.push({ product: id, quantity });
  }
};

/**
 * Record the outcome of an order's STK Push. Called by the shared M-Pesa
 * callback when the checkout is not a membership payment.
 */
const applyOrderMpesaResult = async (stkCallback) => {
  const { CheckoutRequestID, ResultCode, ResultDesc } = stkCallback || {};
  if (!CheckoutRequestID) return;

  // Earlier prompts for the same order count too: a member who retried may
  // still complete the first prompt.
  const order = await Order.findOne({ 'payment.mpesaAttempts': CheckoutRequestID });
  // Safaricom retries callbacks until acknowledged; apply each result once.
  if (!order || order.payment.status === 'verified') return;

  if (ResultCode !== 0) {
    // A failed old prompt says nothing about the one the member is answering now.
    if (order.payment.mpesaCheckoutRequestID === CheckoutRequestID && order.payment.method === 'mpesa') {
      order.payment.status = 'rejected';
      order.payment.rejectionReason = `M-Pesa: ${ResultDesc || 'Payment cancelled'}`.slice(0, 300);
      await order.save();
    }
    return;
  }

  const receipt = receiptFrom(stkCallback);
  order.payment.method = 'mpesa';
  order.payment.status = 'verified';
  order.payment.mpesaCheckoutRequestID = CheckoutRequestID;
  order.payment.mpesaReceiptNumber = receipt || '';
  order.payment.reference = receipt || order.payment.reference;
  order.payment.verifiedAt = new Date();
  order.payment.rejectionReason = undefined;

  if (order.status === 'awaiting_payment') {
    order.status = 'paid';
    addHistory(order, 'paid', { note: receipt ? `M-Pesa ${receipt}` : 'Paid by M-Pesa' });
  } else if (order.status === 'cancelled') {
    // Paid after the hold expired. Reinstate it if the items are still there;
    // otherwise leave a note so the treasurer refunds the member.
    try {
      const products = new Map((await Product.find({ _id: { $in: order.items.map((i) => i.product) } }).lean())
        .map((p) => [String(p._id), p]));
      if (products.size !== quantitiesByProduct(order.items).size) throw new Error('A product was removed');
      await reserveStock(order.items, products);
      order.status = 'paid';
      order.cancelReason = undefined;
      addHistory(order, 'paid', { note: 'Payment arrived after the order was cancelled, so it was reinstated.' });
    } catch {
      addHistory(order, 'cancelled', { note: 'Payment arrived after the order was cancelled and the items are no longer available. Refund required.' });
    }
  }

  await order.save();
};

let lastExpiryCheck = 0;

/**
 * Cancel unpaid orders older than the hold period and return their stock.
 * Throttled, so calling it on every shop request costs almost nothing.
 */
const expireStaleOrders = async ({ force = false } = {}) => {
  const now = Date.now();
  if (!force && now - lastExpiryCheck < EXPIRY_CHECK_INTERVAL_MS) return 0;
  lastExpiryCheck = now;

  const cutoff = new Date(now - ORDER_HOLD_HOURS * 60 * 60 * 1000);
  const stale = await Order.find({
    status: 'awaiting_payment',
    'payment.status': { $in: ['unpaid', 'rejected'] },
    createdAt: { $lt: cutoff }
  });

  for (const order of stale) {
    // Claim the order first so two processes cannot both return its stock.
    const claimed = await Order.updateOne(
      { _id: order._id, status: 'awaiting_payment', 'payment.status': { $in: ['unpaid', 'rejected'] } },
      {
        status: 'cancelled',
        cancelReason: `Not paid within ${ORDER_HOLD_HOURS} hours`,
        $push: { history: { status: 'cancelled', at: new Date(), note: `Not paid within ${ORDER_HOLD_HOURS} hours` } }
      }
    );
    if (claimed.modifiedCount === 1) await releaseStock(order.items);
  }
  return stale.length;
};

module.exports = {
  ORDER_HOLD_HOURS,
  generateOrderNumber, uniqueProductSlug, slugify, addHistory,
  reserveStock, releaseStock, applyOrderMpesaResult, expireStaleOrders
};
