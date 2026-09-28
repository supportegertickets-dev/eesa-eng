/**
 * Merchandise shop tests.
 *
 * Covers the catalogue and who may manage it, placing orders against stock,
 * paying by STK Push through the shared M-Pesa callback, manual receipts,
 * collection and cancellation. Safaricom and Cloudinary are stubbed and MongoDB
 * runs in memory.
 */
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { registerApproved } = require('./helpers');

const cloudinary = require('../config/cloudinary');

let uploadCount = 0;
const destroyed = [];
cloudinary.uploader.upload_stream = (options, callback) => ({
  end: () => {
    uploadCount += 1;
    const publicId = `${options.folder}/test-${uploadCount}`;
    setImmediate(() => callback(null, {
      secure_url: `https://res.cloudinary.com/demo/image/upload/v1/${publicId}.png`,
      public_id: publicId,
      width: 1200,
      height: 1200
    }));
  }
});
cloudinary.uploader.destroy = async (publicId) => {
  destroyed.push(publicId);
  return { result: 'ok' };
};

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const MPESA_SETTINGS = {
  MPESA_CONSUMER_KEY: 'consumer-key',
  MPESA_CONSUMER_SECRET: 'consumer-secret',
  MPESA_SHORTCODE: '174379',
  MPESA_PASSKEY: 'passkey',
  MPESA_CALLBACK_URL: 'https://api.example.com/api/payments/mpesa/callback'
};

let mongod;
let app;
let User;
let Product;
let Order;
let Payment;
let Notification;
let expireStaleOrders;

const realFetch = global.fetch;
let darajaCalls = [];
let checkoutCounter = 0;

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const stubDaraja = () => {
  global.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body ? JSON.parse(options.body) : null };
    darajaCalls.push(call);
    if (call.url.includes('/oauth/v1/generate')) return reply(200, { access_token: 'daraja-token' });
    if (call.url.includes('/mpesa/stkpush/v1/processrequest')) {
      checkoutCounter += 1;
      return reply(200, {
        ResponseCode: '0',
        CheckoutRequestID: `ws_CO_shop_${checkoutCounter}`,
        MerchantRequestID: `mr_shop_${checkoutCounter}`
      });
    }
    throw new Error(`Unexpected request to ${call.url}`);
  };
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Product = require('../models/Product');
  Order = require('../models/Order');
  Payment = require('../models/Payment');
  Notification = require('../models/Notification');
  ({ expireStaleOrders } = require('../utils/merchandise'));

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/merchandise', require('../routes/merchandise'));
  app.use(notFound);
  app.use(errorHandler);
});

beforeEach(() => {
  darajaCalls = [];
  Object.assign(process.env, MPESA_SETTINGS);
  delete process.env.MPESA_ENV;
  stubDaraja();
});

after(async () => {
  global.fetch = realFetch;
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

let counter = 0;
const makeUser = async (role = 'member') => {
  counter += 1;
  const user = await registerApproved(app);
  if (role !== 'member') await User.updateOne({ _id: user.id }, { role });
  return user;
};

/** A product straight in the database, for tests about ordering rather than the catalogue. */
const makeProduct = (fields = {}) => Product.create({
  name: `Item ${counter += 1}`,
  slug: `item-${counter}-${Date.now()}`,
  price: 1200,
  category: 'apparel',
  ...fields
});

const placeOrder = (member, items, extra = {}) => request(app)
  .post('/api/merchandise/orders')
  .set(member.auth)
  .send({ items, ...extra });

const callback = (checkoutRequestID, resultCode, receipt) => request(app)
  .post('/api/payments/mpesa/callback')
  .send({
    Body: {
      stkCallback: {
        MerchantRequestID: 'mr',
        CheckoutRequestID: checkoutRequestID,
        ResultCode: resultCode,
        ResultDesc: resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user',
        ...(receipt && { CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: receipt }] } })
      }
    }
  });

/** An order that has been paid by M-Pesa. */
const paidOrder = async (member, product) => {
  const placed = await placeOrder(member, [{ product: product._id, quantity: 1, size: product.sizes[0] }]);
  assert.equal(placed.status, 201, placed.body.message);
  const push = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });
  assert.equal(push.status, 201, push.body.message);
  await callback(push.body.checkoutRequestID, 0, `RCPT${counter += 1}`);
  return Order.findById(placed.body.order._id);
};

describe('catalogue', () => {
  test('only the treasurer, admins and the chairperson can add products', async () => {
    const member = await makeUser();
    const publicity = await makeUser('publicity_manager');
    for (const user of [member, publicity]) {
      const res = await request(app).post('/api/merchandise/products').set(user.auth).field('name', 'Hoodie').field('price', '1500');
      assert.equal(res.status, 403);
    }
  });

  test('a manager adds a product with photos, sizes and stock', async () => {
    const treasurer = await makeUser('treasurer');
    const res = await request(app)
      .post('/api/merchandise/products')
      .set(treasurer.auth)
      .field('name', 'EESA Hoodie')
      .field('price', '1500')
      .field('category', 'apparel')
      .field('sizes', 'S, M, L, M')
      .field('colors', '["Maroon","Black"]')
      .field('stock', '10')
      .attach('images', PNG, { filename: 'front.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'back.png', contentType: 'image/png' });

    assert.equal(res.status, 201, res.body.message);
    const { product } = res.body;
    assert.equal(product.slug, 'eesa-hoodie');
    assert.deepEqual(product.sizes, ['S', 'M', 'L'], 'duplicates are dropped');
    assert.deepEqual(product.colors, ['Maroon', 'Black']);
    assert.equal(product.stock, 10);
    assert.equal(product.images.length, 2);

    // The same name gets its own address.
    const second = await request(app).post('/api/merchandise/products').set(treasurer.auth).field('name', 'EESA Hoodie').field('price', '1500');
    assert.equal(second.body.product.slug, 'eesa-hoodie-2');
    assert.equal(second.body.product.stock, null, 'stock is not counted unless given');
  });

  test('prices must be whole shillings', async () => {
    const admin = await makeUser('admin');
    const res = await request(app).post('/api/merchandise/products').set(admin.auth).field('name', 'Mug').field('price', '299.50');
    assert.equal(res.status, 400);
  });

  test('hidden products stay out of the shop except for managers who ask for them', async () => {
    const admin = await makeUser('admin');
    const member = await makeUser();
    const hidden = await makeProduct({ name: 'Secret Scarf', isActive: false });

    const anonymous = await request(app).get('/api/merchandise/products?all=true');
    assert.ok(!anonymous.body.products.some((p) => p._id === String(hidden._id)));
    const asMember = await request(app).get('/api/merchandise/products?all=true').set(member.auth);
    assert.ok(!asMember.body.products.some((p) => p._id === String(hidden._id)));
    const asAdmin = await request(app).get('/api/merchandise/products?all=true').set(admin.auth);
    assert.ok(asAdmin.body.products.some((p) => p._id === String(hidden._id)));

    assert.equal((await request(app).get(`/api/merchandise/products/${hidden.slug}`)).status, 404);
  });

  test('editing replaces chosen photos and moves the cover first', async () => {
    const admin = await makeUser('admin');
    const created = await request(app)
      .post('/api/merchandise/products')
      .set(admin.auth)
      .field('name', 'Cap')
      .field('price', '700')
      .attach('images', PNG, { filename: 'a.png', contentType: 'image/png' })
      .attach('images', PNG, { filename: 'b.png', contentType: 'image/png' });
    const [first, second] = created.body.product.images;

    const res = await request(app)
      .put(`/api/merchandise/products/${created.body.product._id}`)
      .set(admin.auth)
      .field('removeImages', JSON.stringify([first._id]))
      .field('price', '650')
      .attach('images', PNG, { filename: 'c.png', contentType: 'image/png' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.product.price, 650);
    assert.equal(res.body.product.images.length, 2);
    assert.equal(res.body.product.images[0]._id, second._id);
    assert.ok(destroyed.includes(first.publicId));

    const newest = res.body.product.images[1];
    const cover = await request(app).put(`/api/merchandise/products/${created.body.product._id}`).set(admin.auth).send({ coverImage: newest._id });
    assert.equal(cover.body.product.images[0]._id, newest._id);
  });

  test('a product that has been ordered cannot be deleted', async () => {
    const admin = await makeUser('admin');
    const member = await makeUser();
    const ordered = await makeProduct();
    const unordered = await makeProduct();
    await placeOrder(member, [{ product: ordered._id, quantity: 1 }]);

    assert.equal((await request(app).delete(`/api/merchandise/products/${ordered._id}`).set(admin.auth)).status, 409);
    assert.equal((await request(app).delete(`/api/merchandise/products/${unordered._id}`).set(admin.auth)).status, 200);
  });
});

describe('paying outside the app', () => {
  test('checkout and every order show the association\'s paybill', async () => {
    const paybill = { businessNumber: '522522', accountNumber: '1286744210' };
    const settings = await request(app).get('/api/merchandise/settings');
    assert.deepEqual(settings.body.paybill, paybill);

    const member = await makeUser();
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const order = await request(app).get(`/api/merchandise/orders/${placed.body.order._id}`).set(member.auth);
    assert.deepEqual(order.body.paybill, paybill);
  });
});

describe('placing orders', () => {
  test('signing in is required', async () => {
    const product = await makeProduct();
    const res = await request(app).post('/api/merchandise/orders').send({ items: [{ product: product._id, quantity: 1 }] });
    assert.equal(res.status, 401);
  });

  test('the server sets prices, merges repeated lines and totals the order', async () => {
    const member = await makeUser();
    const shirt = await makeProduct({ price: 900, sizes: ['M', 'L'] });
    const mug = await makeProduct({ price: 450, category: 'accessories' });

    const res = await placeOrder(member, [
      { product: shirt._id, quantity: 1, size: 'M', price: 1 },
      { product: shirt._id, quantity: 2, size: 'M' },
      { product: shirt._id, quantity: 1, size: 'L' },
      { product: mug._id, quantity: 2 }
    ]);

    assert.equal(res.status, 201, res.body.message);
    const { order } = res.body;
    assert.match(order.orderNumber, /^ORD-[A-HJ-NP-Z2-9]{6}$/);
    assert.equal(order.items.length, 3);
    assert.equal(order.items.find((i) => i.size === 'M').quantity, 3);
    assert.equal(order.total, 900 * 4 + 450 * 2);
    assert.equal(order.status, 'awaiting_payment');
    assert.equal(order.payment.status, 'unpaid');
  });

  test('a size is required when the product has sizes, and must be one of them', async () => {
    const member = await makeUser();
    const shirt = await makeProduct({ sizes: ['M', 'L'] });
    assert.equal((await placeOrder(member, [{ product: shirt._id, quantity: 1 }])).status, 400);
    assert.equal((await placeOrder(member, [{ product: shirt._id, quantity: 1, size: 'XXL' }])).status, 400);
  });

  test('hidden products cannot be ordered', async () => {
    const member = await makeUser();
    const hidden = await makeProduct({ isActive: false });
    assert.equal((await placeOrder(member, [{ product: hidden._id, quantity: 1 }])).status, 409);
  });

  test('ordering takes stock, and nobody can buy more than is left', async () => {
    const member = await makeUser();
    const other = await makeUser();
    const scarf = await makeProduct({ stock: 3 });
    const pen = await makeProduct({ stock: 5 });

    assert.equal((await placeOrder(member, [{ product: scarf._id, quantity: 2 }])).status, 201);
    assert.equal((await Product.findById(scarf._id)).stock, 1);

    // Nothing is taken when any item in the order is short.
    const short = await placeOrder(other, [{ product: pen._id, quantity: 2 }, { product: scarf._id, quantity: 2 }]);
    assert.equal(short.status, 409);
    assert.match(short.body.message, /Only 1/);
    assert.equal((await Product.findById(pen._id)).stock, 5);
    assert.equal((await Product.findById(scarf._id)).stock, 1);
  });

  test('members only see their own orders', async () => {
    const owner = await makeUser();
    const stranger = await makeUser();
    const treasurer = await makeUser('treasurer');
    const product = await makeProduct();
    const placed = await placeOrder(owner, [{ product: product._id, quantity: 1 }]);
    const id = placed.body.order._id;

    assert.equal((await request(app).get(`/api/merchandise/orders/${id}`).set(owner.auth)).status, 200);
    assert.equal((await request(app).get(`/api/merchandise/orders/${id}`).set(stranger.auth)).status, 404);
    assert.equal((await request(app).get(`/api/merchandise/orders/${id}`).set(treasurer.auth)).status, 200);

    const mine = await request(app).get('/api/merchandise/orders/my').set(stranger.auth);
    assert.ok(!mine.body.orders.some((o) => o._id === id));
    assert.equal((await request(app).get('/api/merchandise/orders').set(owner.auth)).status, 403);
  });
});

describe('paying by M-Pesa', () => {
  test('the STK Push charges the order total against the order number', async () => {
    const member = await makeUser();
    const product = await makeProduct({ price: 750 });
    const placed = await placeOrder(member, [{ product: product._id, quantity: 2 }]);

    const res = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712 345 678', amount: 1 });
    assert.equal(res.status, 201, res.body.message);

    const stk = darajaCalls.find((call) => call.url.includes('processrequest')).body;
    assert.equal(stk.Amount, 1500);
    assert.equal(stk.AccountReference, placed.body.order.orderNumber);
    assert.equal(stk.PhoneNumber, '254712345678');
    assert.equal(res.body.order.payment.status, 'pending');
  });

  test('non-Safaricom numbers are rejected before calling M-Pesa', async () => {
    const member = await makeUser();
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const res = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '12345' });
    assert.equal(res.status, 400);
    assert.equal(darajaCalls.length, 0);
  });

  test('a successful callback marks the order paid, once', async () => {
    const member = await makeUser();
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const push = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });

    await callback(push.body.checkoutRequestID, 0, 'SHOP123');
    await callback(push.body.checkoutRequestID, 0, 'SHOP123');

    const order = await Order.findById(placed.body.order._id).lean();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment.status, 'verified');
    assert.equal(order.payment.mpesaReceiptNumber, 'SHOP123');
    assert.equal(order.history.filter((h) => h.status === 'paid').length, 1);
    assert.equal(await Payment.countDocuments({ mpesaCheckoutRequestID: push.body.checkoutRequestID }), 0, 'no membership payment is created');
  });

  test('a cancelled prompt lets the member try again, and the first prompt still counts if answered', async () => {
    const member = await makeUser();
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const url = `/api/merchandise/orders/${placed.body.order._id}/mpesa`;

    const first = await request(app).post(url).set(member.auth).send({ phone: '0712345678' });
    const second = await request(app).post(url).set(member.auth).send({ phone: '0712345678' });
    assert.equal(second.status, 201);

    // The first prompt failing does not overrule the second, still open.
    await callback(first.body.checkoutRequestID, 1032);
    assert.equal((await Order.findById(placed.body.order._id)).payment.status, 'pending');

    await callback(second.body.checkoutRequestID, 1032);
    assert.equal((await Order.findById(placed.body.order._id)).payment.status, 'rejected');

    // The member finally answers the first prompt.
    await callback(first.body.checkoutRequestID, 0, 'LATE001');
    const order = await Order.findById(placed.body.order._id);
    assert.equal(order.status, 'paid');
    assert.equal(order.payment.mpesaReceiptNumber, 'LATE001');
  });

  test('a paid order cannot be paid again', async () => {
    const member = await makeUser();
    const product = await makeProduct();
    const order = await paidOrder(member, product);
    const res = await request(app).post(`/api/merchandise/orders/${order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    assert.equal(res.status, 409);
  });
});

describe('manual payments', () => {
  test('a receipt waits for the treasurer, who confirms it and notifies the member', async () => {
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const id = placed.body.order._id;

    const submitted = await request(app)
      .post(`/api/merchandise/orders/${id}/manual`)
      .set(member.auth)
      .field('reference', 'sjk3d7hf2r')
      .attach('proof', PNG, { filename: 'receipt.png', contentType: 'image/png' });
    assert.equal(submitted.status, 201, submitted.body.message);
    assert.equal(submitted.body.order.payment.reference, 'SJK3D7HF2R');
    assert.ok(submitted.body.order.payment.proofUrl);

    const queue = await request(app).get('/api/merchandise/orders?status=review').set(treasurer.auth);
    assert.ok(queue.body.orders.some((o) => o._id === id));
    assert.ok(queue.body.counts.review >= 1);

    // An STK Push cannot start while the receipt is being checked.
    assert.equal((await request(app).post(`/api/merchandise/orders/${id}/mpesa`).set(member.auth).send({ phone: '0712345678' })).status, 409);

    const confirmed = await request(app).put(`/api/merchandise/orders/${id}/payment`).set(treasurer.auth).send({ status: 'verified' });
    assert.equal(confirmed.status, 200, confirmed.body.message);
    assert.equal(confirmed.body.order.status, 'paid');
    assert.ok(await Notification.findOne({ targetUsers: member.id, type: 'merchandise', title: /Payment confirmed/ }));
  });

  test('a rejected receipt needs a reason and lets the member pay again', async () => {
    const member = await makeUser();
    const admin = await makeUser('admin');
    const product = await makeProduct();
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const id = placed.body.order._id;
    await request(app).post(`/api/merchandise/orders/${id}/manual`).set(member.auth).field('reference', 'BADCODE01');

    assert.equal((await request(app).put(`/api/merchandise/orders/${id}/payment`).set(admin.auth).send({ status: 'rejected' })).status, 400);
    const rejected = await request(app).put(`/api/merchandise/orders/${id}/payment`).set(admin.auth).send({ status: 'rejected', reason: 'Code not found' });
    assert.equal(rejected.body.order.payment.status, 'rejected');
    assert.equal(rejected.body.order.status, 'awaiting_payment');

    const retry = await request(app).post(`/api/merchandise/orders/${id}/manual`).set(member.auth).field('reference', 'GOODCODE1');
    assert.equal(retry.status, 201);
  });

  test('a transaction code already used for a membership payment or another order is refused', async () => {
    const member = await makeUser();
    const product = await makeProduct();
    await Payment.create({ user: member.id, type: 'registration', amount: 500, reference: 'MEMBER0001' });
    const first = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const second = await placeOrder(member, [{ product: product._id, quantity: 1 }]);

    const reused = await request(app).post(`/api/merchandise/orders/${first.body.order._id}/manual`).set(member.auth).field('reference', 'member0001');
    assert.equal(reused.status, 409);

    assert.equal((await request(app).post(`/api/merchandise/orders/${first.body.order._id}/manual`).set(member.auth).field('reference', 'SHOPCODE9')).status, 201);
    assert.equal((await request(app).post(`/api/merchandise/orders/${second.body.order._id}/manual`).set(member.auth).field('reference', 'SHOPCODE9')).status, 409);
  });
});

describe('collection and cancellation', () => {
  test('a paid order goes to ready, with a notice to collect, then collected', async () => {
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const product = await makeProduct();
    const unpaid = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const order = await paidOrder(member, product);

    assert.equal((await request(app).put(`/api/merchandise/orders/${unpaid.body.order._id}/status`).set(treasurer.auth).send({ status: 'ready' })).status, 409);

    const ready = await request(app).put(`/api/merchandise/orders/${order._id}/status`).set(treasurer.auth).send({ status: 'ready', note: 'Room 12, 2-5pm.' });
    assert.equal(ready.status, 200, ready.body.message);
    const notice = await Notification.findOne({ targetUsers: member.id, title: /ready to collect/ }).lean();
    assert.match(notice.message, /Room 12/);

    const collected = await request(app).put(`/api/merchandise/orders/${order._id}/status`).set(treasurer.auth).send({ status: 'collected' });
    assert.equal(collected.body.order.status, 'collected');
    assert.equal((await request(app).put(`/api/merchandise/orders/${order._id}/status`).set(treasurer.auth).send({ status: 'ready' })).status, 409);

    const summary = await request(app).get('/api/merchandise/summary').set(treasurer.auth);
    assert.ok(summary.body.revenue >= product.price);
  });

  test('a member can cancel an unpaid order and its stock returns; a paid one needs the treasurer', async () => {
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const product = await makeProduct({ stock: 4 });

    const placed = await placeOrder(member, [{ product: product._id, quantity: 3 }]);
    assert.equal((await Product.findById(product._id)).stock, 1);
    const cancelled = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/cancel`).set(member.auth);
    assert.equal(cancelled.status, 200, cancelled.body.message);
    assert.equal(cancelled.body.order.status, 'cancelled');
    assert.equal((await Product.findById(product._id)).stock, 4);
    assert.equal((await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/cancel`).set(member.auth)).status, 409);

    const order = await paidOrder(member, product);
    assert.equal((await request(app).post(`/api/merchandise/orders/${order._id}/cancel`).set(member.auth)).status, 409);
    const byTreasurer = await request(app).post(`/api/merchandise/orders/${order._id}/cancel`).set(treasurer.auth).send({ reason: 'Out of this colour' });
    assert.equal(byTreasurer.status, 200);
    assert.equal((await Product.findById(product._id)).stock, 4);
    const notice = await Notification.findOne({ targetUsers: member.id, title: /cancelled/ }).lean();
    assert.match(notice.message, /refund/);
  });

  test('unpaid orders expire after the hold period and release their stock', async () => {
    const member = await makeUser();
    const product = await makeProduct({ stock: 2 });
    const stale = await placeOrder(member, [{ product: product._id, quantity: 2 }]);
    // createdAt is immutable to Mongoose, so the order is aged through the driver.
    const longAgo = new Date(Date.now() - 100 * 60 * 60 * 1000);
    await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(stale.body.order._id) }, { $set: { createdAt: longAgo } });

    // An order with a receipt under review is left alone however old it is.
    const reviewing = await placeOrder(member, [{ product: (await makeProduct())._id, quantity: 1 }]);
    await request(app).post(`/api/merchandise/orders/${reviewing.body.order._id}/manual`).set(member.auth).field('reference', 'WAITING01');
    await Order.collection.updateOne({ _id: new mongoose.Types.ObjectId(reviewing.body.order._id) }, { $set: { createdAt: longAgo } });

    await expireStaleOrders({ force: true });

    const expired = await Order.findById(stale.body.order._id).lean();
    assert.equal(expired.status, 'cancelled');
    assert.match(expired.cancelReason, /Not paid within/);
    assert.equal((await Product.findById(product._id)).stock, 2);
    assert.equal((await Order.findById(reviewing.body.order._id)).status, 'awaiting_payment');
  });

  test('a payment arriving after expiry reinstates the order when stock allows', async () => {
    const member = await makeUser();
    const product = await makeProduct({ stock: 1 });
    const placed = await placeOrder(member, [{ product: product._id, quantity: 1 }]);
    const push = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    // Expired while the prompt was unanswered, as if the prompt had failed first.
    await Order.updateOne({ _id: placed.body.order._id }, { status: 'cancelled' });
    await Product.updateOne({ _id: product._id }, { stock: 1 });

    await callback(push.body.checkoutRequestID, 0, 'AFTER001');
    const order = await Order.findById(placed.body.order._id);
    assert.equal(order.status, 'paid');
    assert.equal((await Product.findById(product._id)).stock, 0);
  });
});
