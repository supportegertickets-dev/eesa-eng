const express = require('express');
const { body, param, query } = require('express-validator');
const mongoose = require('mongoose');
const Product = require('../models/Product');
const Order = require('../models/Order');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect, optionalAuth, merchandiseOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const { validate } = require('../middleware/validate');
const { asyncHandler, ApiError } = require('../utils/asyncHandler');
const { uploadImageBuffer, uploadImageBuffers, destroyImages } = require('../utils/cloudinaryUpload');
const { buildSearchRegex, escapeRegex } = require('../utils/sanitize');
const { isMerchandise } = require('../utils/roles');
const { mpesaConfigured, normalizeKenyanPhone, requestStkPush } = require('../utils/mpesa');
const { notifyUsers } = require('../utils/membership');
const {
  ORDER_HOLD_HOURS, generateOrderNumber, uniqueProductSlug, addHistory,
  reserveStock, releaseStock, expireStaleOrders
} = require('../utils/merchandise');
const { PRODUCT_CATEGORIES, MAX_PRODUCT_IMAGES } = Product;
const { ORDER_STATUSES } = Order;

const router = express.Router();

const PRODUCT_FOLDER = 'eesa/merchandise';
const PROOF_FOLDER = 'eesa/order-payments';
const PICKUP_LOCATION = process.env.SHOP_PICKUP_LOCATION || 'the EESA office';
// Where to send money for a manual payment, such as "Paybill 123456, account:
// your order number". Shown to members beside the manual payment form.
const PAYMENT_INSTRUCTIONS = process.env.SHOP_PAYMENT_INSTRUCTIONS || '';

const ORDER_USER_FIELDS = 'firstName lastName email phone regNumber department avatar';
// Orders whose manual receipt is waiting for the treasurer.
const REVIEW_FILTER = { status: 'awaiting_payment', 'payment.status': 'pending', 'payment.method': 'manual' };

const idParam = param('id').isMongoId().withMessage('That order could not be found.');
const productIdParam = param('id').isMongoId().withMessage('That product could not be found.');

// Expiring unpaid orders is throttled internally, so it can ride on every shop request.
const sweepStaleOrders = (req, res, next) => {
  expireStaleOrders().catch((error) => console.error('Order expiry failed:', error.message));
  next();
};

router.use(sweepStaleOrders);

/* ------------------------------------------------------------------ *
 * Helpers
 * ------------------------------------------------------------------ */

/** "S, M, L" or ["S","M","L"] from a form field, trimmed and de-duplicated. */
const parseOptionList = (value) => {
  if (value === undefined) return undefined;
  let list = value;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.startsWith('[')) {
      try { list = JSON.parse(trimmed); } catch { list = []; }
    } else {
      list = trimmed.split(',');
    }
  }
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((entry) => String(entry).trim().slice(0, 30)).filter(Boolean))].slice(0, 20);
};

const parseIdList = (value) => {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(String);
  const trimmed = String(value).trim();
  if (trimmed.startsWith('[')) {
    try { return JSON.parse(trimmed).map(String); } catch { return []; }
  }
  return trimmed.split(',').map((s) => s.trim()).filter(Boolean);
};

const toBool = (value) => value === true || value === 'true' || value === '1' || value === 'on';

/** Empty means the shop does not count stock for this item. */
const parseStock = (value) => (value === '' || value === null || value === 'null' ? null : Number(value));

const productRules = (optional) => {
  const field = (name) => (optional ? body(name).optional() : body(name));
  return [
    field('name').trim().notEmpty().withMessage('Product name is required')
      .isLength({ max: 120 }).withMessage('Keep the name under 120 characters'),
    field('price').isInt({ min: 1, max: 1000000 }).withMessage('Enter a price in whole shillings').toInt(),
    body('category').optional().isIn(PRODUCT_CATEGORIES).withMessage('Choose a category'),
    body('description').optional().trim().isLength({ max: 2000 }).withMessage('Keep the description under 2000 characters'),
    body('stock').optional()
      .custom((value) => value === '' || value === null || value === 'null' || (Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 100000))
      .withMessage('Stock must be a whole number, or empty if you do not count it'),
  ];
};

const canManage = (user) => Boolean(user && isMerchandise(user.role));

/** The order if the signed-in member placed it or runs the shop; 404 otherwise. */
const loadOrder = async (req, { manage = false } = {}) => {
  const order = await Order.findById(req.params.id);
  const allowed = order && (manage ? canManage(req.user) : (String(order.user) === String(req.user._id) || canManage(req.user)));
  // A member probing someone else's order learns nothing about whether it exists.
  if (!allowed) throw new ApiError(404, 'That order could not be found.');
  return order;
};

const populateOrder = (id) => Order.findById(id)
  .populate('user', ORDER_USER_FIELDS)
  .populate('payment.verifiedBy', 'firstName lastName')
  .populate('history.by', 'firstName lastName');

/** An order can take a payment while it is unpaid, or its last attempt failed or was an unanswered prompt. */
const assertCanPay = (order) => {
  if (order.status !== 'awaiting_payment') {
    throw new ApiError(409, order.status === 'cancelled' ? 'This order was cancelled. Place a new order instead.' : 'This order has already been paid.');
  }
  if (order.payment.status === 'verified') throw new ApiError(409, 'This order has already been paid.');
  if (order.payment.status === 'pending' && order.payment.method === 'manual') {
    throw new ApiError(409, 'Your payment receipt is being checked. You will be notified once it is confirmed.');
  }
};

/* ------------------------------------------------------------------ *
 * Catalogue
 * ------------------------------------------------------------------ */

// GET /api/merchandise/settings - what checkout can offer
router.get('/settings', (req, res) => {
  res.json({
    mpesa: mpesaConfigured(),
    holdHours: ORDER_HOLD_HOURS,
    pickupLocation: PICKUP_LOCATION,
    paymentInstructions: PAYMENT_INSTRUCTIONS,
    categories: PRODUCT_CATEGORIES
  });
});

// GET /api/merchandise/products - the shop; managers may add ?all=true to include hidden items
router.get('/products', optionalAuth, [
  query('category').optional({ values: 'falsy' }).isIn(PRODUCT_CATEGORIES).withMessage('Unknown category'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  validate
], asyncHandler(async (req, res) => {
  const includeHidden = req.query.all === 'true' && canManage(req.user);
  const base = includeHidden ? {} : { isActive: true };

  const filter = { ...base };
  if (req.query.category) filter.category = req.query.category;
  const search = buildSearchRegex(req.query.search);
  if (search) filter.$or = [{ name: search }, { description: search }];

  const [products, byCategory] = await Promise.all([
    Product.find(filter).sort({ featured: -1, createdAt: -1 }).limit(200).lean(),
    Product.aggregate([{ $match: base }, { $group: { _id: '$category', count: { $sum: 1 } } }])
  ]);

  res.json({
    products,
    counts: Object.fromEntries(byCategory.map((row) => [row._id, row.count]))
  });
}));

// GET /api/merchandise/products/:key - one product by slug or id
router.get('/products/:key', optionalAuth, asyncHandler(async (req, res) => {
  const key = String(req.params.key).toLowerCase();
  const product = await Product.findOne(mongoose.isValidObjectId(key) ? { _id: key } : { slug: key }).lean();
  if (!product || (!product.isActive && !canManage(req.user))) throw new ApiError(404, 'That item is not in the shop.');
  res.json({ product });
}));

// POST /api/merchandise/products - managers: add an item
router.post('/products', protect, merchandiseOnly, uploadImage.array('images', MAX_PRODUCT_IMAGES), [
  ...productRules(false),
  validate
], asyncHandler(async (req, res) => {
  const uploaded = await uploadImageBuffers(req.files || [], { folder: PRODUCT_FOLDER, preset: 'product' });

  try {
    const product = await Product.create({
      name: req.body.name,
      slug: await uniqueProductSlug(req.body.name),
      description: req.body.description || '',
      category: req.body.category || 'apparel',
      price: req.body.price,
      stock: req.body.stock === undefined ? null : parseStock(req.body.stock),
      sizes: parseOptionList(req.body.sizes) || [],
      colors: parseOptionList(req.body.colors) || [],
      isActive: req.body.isActive === undefined ? true : toBool(req.body.isActive),
      featured: toBool(req.body.featured),
      images: uploaded.map(({ url, publicId }) => ({ url, publicId })),
      createdBy: req.user._id
    });
    res.status(201).json({ product });
  } catch (error) {
    await destroyImages(uploaded.map((image) => image.publicId));
    throw error;
  }
}));

// PUT /api/merchandise/products/:id - managers: edit an item, add photos or remove some
router.put('/products/:id', protect, merchandiseOnly, uploadImage.array('images', MAX_PRODUCT_IMAGES), [
  productIdParam,
  ...productRules(true),
  validate
], asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'That product could not be found.');

  const removeIds = new Set(parseIdList(req.body.removeImages));
  const kept = product.images.filter((image) => !removeIds.has(String(image._id)));
  const incoming = req.files || [];
  if (kept.length + incoming.length > MAX_PRODUCT_IMAGES) {
    throw new ApiError(400, `A product can have at most ${MAX_PRODUCT_IMAGES} photos. Remove some before adding more.`);
  }

  const uploaded = await uploadImageBuffers(incoming, { folder: PRODUCT_FOLDER, preset: 'product' });
  const removed = product.images.filter((image) => removeIds.has(String(image._id)));

  ['name', 'description', 'category', 'price'].forEach((field) => {
    if (req.body[field] !== undefined) product[field] = req.body[field];
  });
  if (req.body.stock !== undefined) product.stock = parseStock(req.body.stock);
  const sizes = parseOptionList(req.body.sizes);
  if (sizes) product.sizes = sizes;
  const colors = parseOptionList(req.body.colors);
  if (colors) product.colors = colors;
  if (req.body.isActive !== undefined) product.isActive = toBool(req.body.isActive);
  if (req.body.featured !== undefined) product.featured = toBool(req.body.featured);

  product.images = [...kept, ...uploaded.map(({ url, publicId }) => ({ url, publicId }))];

  // The chosen cover photo leads the list, which is what the shop shows first.
  if (req.body.coverImage) {
    const index = product.images.findIndex((image) => String(image._id) === String(req.body.coverImage));
    if (index > 0) product.images.unshift(product.images.splice(index, 1)[0]);
  }

  try {
    await product.save();
  } catch (error) {
    await destroyImages(uploaded.map((image) => image.publicId));
    throw error;
  }
  await destroyImages(removed.map((image) => image.publicId));

  res.json({ product });
}));

// DELETE /api/merchandise/products/:id - managers: remove an item nobody has ordered
router.delete('/products/:id', protect, merchandiseOnly, [productIdParam, validate], asyncHandler(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw new ApiError(404, 'That product could not be found.');

  // Orders keep a copy of the item, but its photos and history still point here.
  if (await Order.exists({ 'items.product': product._id })) {
    throw new ApiError(409, `${product.name} has been ordered, so it cannot be deleted. Hide it from the shop instead.`);
  }

  await product.deleteOne();
  await destroyImages(product.images.map((image) => image.publicId));
  res.json({ message: 'Product deleted' });
}));

/* ------------------------------------------------------------------ *
 * Orders: members
 * ------------------------------------------------------------------ */

// POST /api/merchandise/orders - place an order from the cart
router.post('/orders', protect, [
  body('items').isArray({ min: 1, max: 20 }).withMessage('Your cart is empty.'),
  body('items.*.product').isMongoId().withMessage('An item in your cart is no longer available.'),
  body('items.*.quantity').isInt({ min: 1, max: 20 }).withMessage('Quantities must be between 1 and 20.').toInt(),
  body('items.*.size').optional({ values: 'null' }).isString().trim().isLength({ max: 30 }),
  body('items.*.color').optional({ values: 'null' }).isString().trim().isLength({ max: 30 }),
  body('contactPhone').optional({ values: 'falsy' }).trim()
    .matches(/^\+?[\d\s()-]{7,20}$/).withMessage('Enter a phone number we can reach you on.'),
  body('notes').optional({ values: 'falsy' }).trim().isLength({ max: 500 }).withMessage('Keep notes under 500 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const ids = [...new Set(req.body.items.map((item) => String(item.product)))];
  const products = new Map((await Product.find({ _id: { $in: ids }, isActive: true }).lean()).map((p) => [String(p._id), p]));

  // Merge repeated lines (the same item, size and colour) into one.
  const lines = new Map();
  for (const item of req.body.items) {
    const product = products.get(String(item.product));
    if (!product) throw new ApiError(409, 'An item in your cart is no longer available. Remove it and try again.');

    const size = product.sizes.length ? String(item.size || '').trim() : '';
    const color = product.colors.length ? String(item.color || '').trim() : '';
    if (product.sizes.length && !product.sizes.includes(size)) throw new ApiError(400, `Choose a size for ${product.name}.`);
    if (product.colors.length && !product.colors.includes(color)) throw new ApiError(400, `Choose a colour for ${product.name}.`);

    const key = `${product._id}|${size}|${color}`;
    const line = lines.get(key) || {
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: 0,
      size,
      color,
      image: product.images[0]?.url || ''
    };
    line.quantity = Math.min(20, line.quantity + item.quantity);
    lines.set(key, line);
  }

  const items = [...lines.values()];
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  await reserveStock(items, products);

  let order;
  try {
    for (let attempt = 0; !order; attempt += 1) {
      try {
        order = await Order.create({
          orderNumber: generateOrderNumber(),
          user: req.user._id,
          items,
          total,
          contactPhone: req.body.contactPhone || req.user.phone || '',
          notes: req.body.notes || '',
          history: [{ status: 'awaiting_payment', at: new Date(), by: req.user._id }]
        });
      } catch (error) {
        if (error.code !== 11000 || attempt >= 4) throw error;
      }
    }
  } catch (error) {
    await releaseStock(items);
    throw error;
  }

  res.status(201).json({ order });
}));

// GET /api/merchandise/orders/my - the member's orders
router.get('/orders/my', protect, asyncHandler(async (req, res) => {
  const orders = await Order.find({ user: req.user._id }).sort({ createdAt: -1 }).limit(100).lean();
  res.json({ orders });
}));

// GET /api/merchandise/orders/:id - one order, for its owner or a shop manager
router.get('/orders/:id', protect, [idParam, validate], asyncHandler(async (req, res) => {
  const order = await loadOrder(req);
  res.json({
    order: await populateOrder(order._id).lean(),
    mpesa: mpesaConfigured(),
    pickupLocation: PICKUP_LOCATION,
    paymentInstructions: PAYMENT_INSTRUCTIONS
  });
}));

// POST /api/merchandise/orders/:id/mpesa - pay for an order by STK Push
router.post('/orders/:id/mpesa', protect, [
  idParam,
  body('phone').trim().notEmpty().withMessage('Enter the M-Pesa number to charge.'),
  validate
], asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user._id)) throw new ApiError(404, 'That order could not be found.');
  assertCanPay(order);

  if (!mpesaConfigured()) {
    throw new ApiError(503, 'M-Pesa payments are not available right now. Pay to the shop number and submit your M-Pesa code instead.');
  }
  const phone = normalizeKenyanPhone(req.body.phone);
  if (!phone) throw new ApiError(400, 'Enter a Safaricom number such as 0712 345 678.');

  let stkData;
  try {
    stkData = await requestStkPush({
      phone,
      amount: order.total,
      accountReference: order.orderNumber,
      description: `EESA shop order ${order.orderNumber}`
    });
  } catch (error) {
    if (error.rejectedByMpesa) throw new ApiError(400, error.message);
    console.error('M-Pesa STK Push error (order):', error);
    throw new ApiError(502, 'Could not reach M-Pesa. Please try again in a moment.');
  }

  order.payment.method = 'mpesa';
  order.payment.status = 'pending';
  order.payment.phone = phone;
  order.payment.mpesaCheckoutRequestID = stkData.CheckoutRequestID;
  order.payment.mpesaAttempts.push(stkData.CheckoutRequestID);
  order.payment.submittedAt = new Date();
  order.payment.rejectionReason = undefined;
  await order.save();

  res.status(201).json({
    message: 'Check your phone and enter your M-Pesa PIN to pay.',
    checkoutRequestID: stkData.CheckoutRequestID,
    order
  });
}));

// POST /api/merchandise/orders/:id/manual - submit an M-Pesa code for an order paid outside the app
router.post('/orders/:id/manual', protect, uploadImage.single('proof'), [
  idParam,
  body('reference').trim().notEmpty().withMessage('Enter the M-Pesa transaction code.')
    .isLength({ max: 60 }).withMessage('That code is too long.'),
  validate
], asyncHandler(async (req, res) => {
  const order = await Order.findById(req.params.id);
  if (!order || String(order.user) !== String(req.user._id)) throw new ApiError(404, 'That order could not be found.');
  assertCanPay(order);

  // A transaction code pays for one thing. Check orders and membership payments alike.
  const reference = req.body.reference.trim().toUpperCase();
  const exact = new RegExp(`^${escapeRegex(reference)}$`, 'i');
  const [usedByOrder, usedByPayment] = await Promise.all([
    Order.exists({ _id: { $ne: order._id }, 'payment.reference': exact, 'payment.status': { $ne: 'rejected' } }),
    Payment.exists({ reference: exact, status: { $ne: 'rejected' } })
  ]);
  if (usedByOrder || usedByPayment) throw new ApiError(409, 'That transaction code has already been used.');

  let proofUrl = '';
  if (req.file) proofUrl = (await uploadImageBuffer(req.file.buffer, { folder: PROOF_FOLDER, preset: 'photo' })).url;

  order.payment.method = 'manual';
  order.payment.status = 'pending';
  order.payment.reference = reference;
  order.payment.proofUrl = proofUrl;
  order.payment.submittedAt = new Date();
  order.payment.rejectionReason = undefined;
  await order.save();

  res.status(201).json({ order });
}));

// POST /api/merchandise/orders/:id/cancel - the member before paying, or a manager before collection
router.post('/orders/:id/cancel', protect, [
  idParam,
  body('reason').optional({ values: 'falsy' }).trim().isLength({ max: 300 }).withMessage('Keep the reason under 300 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const order = await loadOrder(req);
  const manager = canManage(req.user);
  const owner = String(order.user) === String(req.user._id);

  if (['collected', 'cancelled'].includes(order.status)) {
    throw new ApiError(409, order.status === 'cancelled' ? 'This order is already cancelled.' : 'A collected order cannot be cancelled.');
  }
  // Members may only withdraw an order nobody has paid for.
  if (!manager) {
    if (order.status !== 'awaiting_payment' || order.payment.status === 'verified') {
      throw new ApiError(409, 'This order has been paid. Contact the treasurer to cancel it.');
    }
    if (order.payment.status === 'pending') {
      throw new ApiError(409, 'A payment for this order is being processed. Wait for it to finish, or contact the treasurer.');
    }
  }

  const reason = req.body.reason || (owner && !manager ? 'Cancelled by the member' : 'Cancelled by the shop');
  const claimed = await Order.updateOne(
    { _id: order._id, status: order.status },
    {
      status: 'cancelled',
      cancelReason: reason,
      $push: { history: { status: 'cancelled', at: new Date(), by: req.user._id, note: reason } }
    }
  );
  if (claimed.modifiedCount !== 1) throw new ApiError(409, 'This order changed while you were cancelling it. Refresh and try again.');
  await releaseStock(order.items);

  if (!owner) {
    await notifyUsers([order.user], {
      title: `Order ${order.orderNumber} cancelled`,
      message: `Your shop order ${order.orderNumber} was cancelled. Reason: ${reason}${order.payment.status === 'verified' ? ' The treasurer will arrange your refund.' : ''}`,
      type: 'merchandise',
      createdBy: req.user._id
    });
  }

  res.json({ order: await populateOrder(order._id).lean() });
}));

/* ------------------------------------------------------------------ *
 * Orders: shop managers
 * ------------------------------------------------------------------ */

// GET /api/merchandise/orders - managers: every order, filtered
router.get('/orders', protect, merchandiseOnly, [
  query('status').optional({ values: 'falsy' }).isIn([...ORDER_STATUSES, 'review']).withMessage('Unknown order status'),
  query('search').optional({ values: 'falsy' }).trim().isLength({ max: 80 }),
  query('page').optional().isInt({ min: 1 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 50 }).toInt(),
  validate
], asyncHandler(async (req, res) => {
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const clauses = [];
  if (req.query.status === 'review') clauses.push(REVIEW_FILTER);
  else if (req.query.status) clauses.push({ status: req.query.status });

  const search = buildSearchRegex(req.query.search);
  if (search) {
    const buyers = await User.find({ $or: [{ firstName: search }, { lastName: search }, { email: search }, { regNumber: search }] })
      .select('_id').limit(200).lean();
    clauses.push({ $or: [{ orderNumber: search }, { 'payment.reference': search }, { user: { $in: buyers.map((u) => u._id) } }] });
  }
  const filter = clauses.length ? { $and: clauses } : {};

  const [orders, total, byStatus, review] = await Promise.all([
    Order.find(filter).populate('user', ORDER_USER_FIELDS).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Order.countDocuments(filter),
    Order.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    Order.countDocuments(REVIEW_FILTER)
  ]);

  res.json({
    orders,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    total,
    counts: { ...Object.fromEntries(byStatus.map((row) => [row._id, row.count])), review }
  });
}));

// GET /api/merchandise/summary - managers: what needs doing, and takings
router.get('/summary', protect, merchandiseOnly, asyncHandler(async (req, res) => {
  const [review, paid, ready, revenue, activeProducts, lowStock] = await Promise.all([
    Order.countDocuments(REVIEW_FILTER),
    Order.countDocuments({ status: 'paid' }),
    Order.countDocuments({ status: 'ready' }),
    Order.aggregate([
      { $match: { 'payment.status': 'verified', status: { $ne: 'cancelled' } } },
      { $group: { _id: null, total: { $sum: '$total' }, orders: { $sum: 1 } } }
    ]),
    Product.countDocuments({ isActive: true }),
    Product.countDocuments({ isActive: true, stock: { $ne: null, $lte: 5 } })
  ]);

  res.json({
    review,
    paid,
    ready,
    // Receipts to check and paid orders to pack: the menu badge.
    needsAction: review + paid,
    revenue: revenue[0]?.total || 0,
    paidOrders: revenue[0]?.orders || 0,
    activeProducts,
    lowStock
  });
}));

// PUT /api/merchandise/orders/:id/payment - managers: confirm or reject a payment
router.put('/orders/:id/payment', protect, merchandiseOnly, [
  idParam,
  body('status').isIn(['verified', 'rejected']).withMessage('Choose confirm or reject.'),
  body('reason').if(body('status').equals('rejected'))
    .trim().notEmpty().withMessage('Say why the payment was rejected, so the member can fix it.')
    .isLength({ max: 300 }).withMessage('Keep the reason under 300 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const order = await loadOrder(req, { manage: true });
  if (order.status !== 'awaiting_payment' || order.payment.status !== 'pending') {
    throw new ApiError(409, 'There is no payment waiting to be checked on this order.');
  }

  order.payment.verifiedBy = req.user._id;
  order.payment.verifiedAt = new Date();

  if (req.body.status === 'verified') {
    order.payment.status = 'verified';
    order.payment.rejectionReason = undefined;
    order.status = 'paid';
    addHistory(order, 'paid', { by: req.user._id, note: order.payment.reference ? `Payment ${order.payment.reference} confirmed` : 'Payment confirmed' });
    await order.save();

    await notifyUsers([order.user], {
      title: `Payment confirmed for ${order.orderNumber}`,
      message: `We have confirmed your payment of KES ${order.total.toLocaleString('en-KE')} for order ${order.orderNumber}. We will let you know when it is ready to collect.`,
      type: 'merchandise',
      createdBy: req.user._id
    });
  } else {
    order.payment.status = 'rejected';
    order.payment.rejectionReason = req.body.reason;
    await order.save();

    await notifyUsers([order.user], {
      title: `Payment not confirmed for ${order.orderNumber}`,
      message: `We could not confirm the payment for order ${order.orderNumber}. Reason: ${req.body.reason} Open the order in My Orders to pay again.`,
      type: 'merchandise',
      createdBy: req.user._id
    });
  }

  res.json({ order: await populateOrder(order._id).lean() });
}));

const NEXT_STATUSES = { paid: ['ready', 'collected'], ready: ['collected'] };

// PUT /api/merchandise/orders/:id/status - managers: ready for collection, then collected
router.put('/orders/:id/status', protect, merchandiseOnly, [
  idParam,
  body('status').isIn(['ready', 'collected']).withMessage('Choose ready or collected.'),
  body('note').optional({ values: 'falsy' }).trim().isLength({ max: 300 }).withMessage('Keep the note under 300 characters.'),
  validate
], asyncHandler(async (req, res) => {
  const order = await loadOrder(req, { manage: true });
  const { status, note } = req.body;

  if (!(NEXT_STATUSES[order.status] || []).includes(status)) {
    throw new ApiError(409, order.status === 'awaiting_payment'
      ? 'This order has not been paid yet.'
      : `An order that is ${order.status.replace('_', ' ')} cannot be marked ${status}.`);
  }

  order.status = status;
  addHistory(order, status, { by: req.user._id, note });
  await order.save();

  if (status === 'ready') {
    await notifyUsers([order.user], {
      title: `Order ${order.orderNumber} is ready to collect`,
      message: `Your order ${order.orderNumber} is ready. Collect it from ${PICKUP_LOCATION}.${note ? ` ${note}` : ''}`,
      type: 'merchandise',
      createdBy: req.user._id
    });
  }

  res.json({ order: await populateOrder(order._id).lean() });
}));

module.exports = router;
