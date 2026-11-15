/** ISA Tech Hub payment integration tests (provider requests are stubbed). */
const { test, before, beforeEach, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-definitely-long-enough-32';
process.env.FRONTEND_URL = 'http://localhost:3000';
delete process.env.BREVO_API_KEY;
delete process.env.SMTP_HOST;

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const request = require('supertest');
const { registerApproved } = require('./helpers');
const { signWebhookForTest } = require('../utils/isaTechHub');

const HUB_SETTINGS = {
  ISA_HUB_ENABLED: 'true',
  ISA_HUB_BASE_URL: 'https://hub.example.test',
  ISA_HUB_API_KEY: 'test-server-key',
  ISA_HUB_WEBHOOK_SECRET: 'test-webhook-secret',
  ISA_HUB_WEBHOOK_TOLERANCE_SECONDS: '300'
};
const MPESA_SETTINGS = {
  MPESA_CONSUMER_KEY: 'consumer-key', MPESA_CONSUMER_SECRET: 'consumer-secret',
  MPESA_SHORTCODE: '174379', MPESA_PASSKEY: 'passkey',
  MPESA_CALLBACK_URL: 'https://api.example.test/api/payments/mpesa/callback'
};

let mongod;
let app;
let User;
let Payment;
let Order;
let Product;
let HubPayment;
let Notification;
let realFetch;
let calls;
let nextHubId;
let createBehavior;
let getBehavior;
let capturedWebhookBody;

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

const stubFetch = () => {
  global.fetch = async (url, options = {}) => {
    const call = {
      url: String(url), method: options.method || 'GET',
      headers: options.headers || {}, body: options.body ? JSON.parse(options.body) : null
    };
    calls.push(call);
    if (call.url.endsWith('/v1/config')) return reply(200, { configured: true });
    if (call.url.endsWith('/v1/payments') && call.method === 'POST') {
      if (createBehavior) return createBehavior(call);
      return reply(201, { payment: { id: `hub-payment-${crypto.randomUUID()}`, status: 'pending' }, replayed: false });
    }
    if (call.url.includes('/v1/payments?')) {
      if (getBehavior) return getBehavior(call);
      return reply(200, { payments: [] });
    }
    if (call.url.includes('/v1/payments/')) {
      if (getBehavior) return getBehavior(call);
      return reply(200, { payment: { id: decodeURIComponent(call.url.split('/').pop()), status: 'pending' } });
    }
    if (call.url.includes('/oauth/v1/generate')) return reply(200, { access_token: 'daraja-token', expires_in: '3599' });
    if (call.url.includes('/mpesa/stkpush/v1/processrequest')) {
      nextHubId += 1;
      return reply(200, { ResponseCode: '0', CheckoutRequestID: `daraja-${nextHubId}`, MerchantRequestID: `merchant-${nextHubId}` });
    }
    throw new Error(`Unexpected provider request ${call.method} ${call.url}`);
  };
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  User = require('../models/User');
  Payment = require('../models/Payment');
  Order = require('../models/Order');
  Product = require('../models/Product');
  HubPayment = require('../models/HubPayment');
  Notification = require('../models/Notification');

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');
  app = express();
  app.use(express.json({
    verify: (req, res, buffer) => {
      if (req.originalUrl.split('?')[0] === '/api/payments/isa-hub/webhook') {
        req.rawBody = Buffer.from(buffer);
        capturedWebhookBody = Buffer.from(buffer);
      }
    }
  }));
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/payments', require('../routes/payments'));
  app.use('/api/merchandise', require('../routes/merchandise'));
  app.use(notFound);
  app.use(errorHandler);
  realFetch = global.fetch;
});

beforeEach(() => {
  Object.assign(process.env, HUB_SETTINGS, MPESA_SETTINGS, { REGISTRATION_FEE: '500', RENEWAL_FEE: '300' });
  calls = [];
  nextHubId = 0;
  createBehavior = null;
  getBehavior = null;
  stubFetch();
});

after(async () => {
  global.fetch = realFetch;
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

const startMembership = (member, body = {}) => request(app)
  .post('/api/payments/mpesa/stkpush').set(member.auth)
  .send({ phone: '0712345678', type: 'registration', ...body });

const event = (type, payment) => ({ type, data: { payment } });
const signedWebhook = (body, timestamp = Math.floor(Date.now() / 1000), signature = null) => {
  const raw = Buffer.from(JSON.stringify(body));
  const sig = signature || `t=${timestamp},v1=${signWebhookForTest(String(timestamp), raw)}`;
  return request(app).post('/api/payments/isa-hub/webhook')
    .set('Content-Type', 'application/json').set('ISA-Signature', sig).send(raw.toString('utf8'));
};

const membershipAttempt = async (member) => {
  const res = await startMembership(member);
  assert.ok([201, 202].includes(res.status), res.body.message);
  const attempt = await HubPayment.findById(res.body.checkoutRequestID);
  return { res, attempt };
};

describe('ISA Tech Hub membership payments', () => {
  test('persists pending local payment before create and uses stable idempotency key on retry', async () => {
    const member = await registerApproved(app);
    let pendingWasSaved = false;
    createBehavior = async (call) => {
      const attempt = await HubPayment.findOne({ reference: call.body.reference });
      const payment = await Payment.findById(attempt.membershipPayment);
      pendingWasSaved = attempt.status === 'pending' && payment.status === 'pending';
      throw Object.assign(new Error('timeout'), { name: 'AbortError' });
    };
    const first = await startMembership(member);
    assert.equal(first.status, 202);
    assert.equal(pendingWasSaved, true);
    const firstCall = calls.find((call) => call.method === 'POST');
    const attemptId = first.body.checkoutRequestID;

    createBehavior = async (call) => {
      assert.equal(call.headers['Idempotency-Key'], attemptId);
      return reply(201, { payment: { id: 'hub-uncertain-accepted', status: 'pending' }, replayed: true });
    };
    const retry = await startMembership(member);
    assert.equal(retry.status, 201);
    assert.equal(retry.body.checkoutRequestID, attemptId);
    assert.equal(firstCall.headers['Idempotency-Key'], attemptId);
    assert.equal(await HubPayment.countDocuments({ user: member.id }), 1);
    assert.equal(firstCall.headers.Authorization, `Bearer ${HUB_SETTINGS.ISA_HUB_API_KEY}`);
    assert.equal(firstCall.body.amount, 500);
    assert.equal(firstCall.body.phone, '254712345678');
    const payment = await Payment.findById(retry.body.paymentId).lean();
    assert.equal(payment.status, 'pending');
    assert.match(payment.mpesaPhoneNumber, /^\*+5678$/);
  });

  test('a definite provider rejection is persisted and does not claim that a prompt was sent', async () => {
    const member = await registerApproved(app);
    createBehavior = async () => reply(422, { message: 'Rejected' });
    const res = await startMembership(member);
    assert.equal(res.status, 400);
    assert.match(res.body.message, /could not start/);
    const payment = await Payment.findOne({ user: member.id }).lean();
    const attempt = await HubPayment.findOne({ user: member.id }).lean();
    assert.equal(payment.status, 'rejected');
    assert.equal(attempt.status, 'rejected');
    assert.equal(attempt.initiationStatus, 'rejected');
    assert.equal(res.body.checkoutRequestID, undefined);
  });

  test('valid paid webhook verifies once; duplicate and late failure cannot downgrade or re-fulfill', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    const paid = event('payment.paid', {
      id: attempt.providerPaymentId, status: 'paid', paidAmount: 500, receipt: 'HUB-RCPT-1'
    });
    assert.equal((await signedWebhook(paid)).status, 200);
    const expiry = (await User.findById(member.id).lean()).membershipExpiry;
    assert.equal((await signedWebhook(paid)).status, 200);
    assert.equal((await signedWebhook(event('payment.failed', { id: attempt.providerPaymentId, status: 'failed' }))).status, 200);
    const local = await Payment.findById(attempt.membershipPayment).lean();
    assert.equal(local.status, 'verified');
    assert.equal(local.reference, 'HUB-RCPT-1');
    assert.equal((await User.findById(member.id).lean()).membershipExpiry.getTime(), expiry.getTime());
    assert.equal(await Notification.countDocuments({ targetUsers: member.id, title: 'Membership active' }), 1);
  });

  test('amount mismatch and disputed events are held and do not activate membership', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    const mismatch = await signedWebhook(event('payment.paid', {
      id: attempt.providerPaymentId, status: 'paid', paidAmount: 499, receipt: 'HUB-WRONG'
    }));
    assert.equal(mismatch.status, 200);
    assert.equal((await HubPayment.findById(attempt._id)).status, 'disputed');
    assert.equal((await Payment.findById(attempt.membershipPayment)).status, 'disputed');
    assert.equal((await User.findById(member.id)).membershipPaid, false);

    const other = await registerApproved(app);
    const { attempt: disputed } = await membershipAttempt(other);
    assert.equal((await signedWebhook(event('payment.disputed', { id: disputed.providerPaymentId, status: 'disputed' }))).status, 200);
    assert.equal((await HubPayment.findById(disputed._id)).status, 'disputed');
    assert.equal((await User.findById(other.id)).membershipPaid, false);
  });

  test('pending events remain pending and a later paid event overrides an earlier failure', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    assert.equal((await signedWebhook(event('payment.failed', { id: attempt.providerPaymentId, status: 'failed' }))).status, 200);
    assert.equal((await Payment.findById(attempt.membershipPayment)).status, 'rejected');
    assert.equal((await signedWebhook(event('payment.paid', {
      id: attempt.providerPaymentId, status: 'paid', paidAmount: 500, receipt: 'LATE-PAID'
    }))).status, 200);
    assert.equal((await Payment.findById(attempt.membershipPayment)).status, 'verified');
    assert.equal((await User.findById(member.id)).membershipPaid, true);

    const another = await registerApproved(app);
    const { attempt: pendingAttempt } = await membershipAttempt(another);
    getBehavior = async () => reply(200, { payment: { id: pendingAttempt.providerPaymentId, status: 'pending' } });
    const checked = await request(app).get(`/api/payments/isa-hub/verify/${pendingAttempt._id}`).set(another.auth);
    assert.equal(checked.status, 200);
    assert.equal((await HubPayment.findById(pendingAttempt._id)).status, 'pending');
    assert.equal((await User.findById(another.id)).membershipPaid, false);
  });

  test('rejects invalid, tampered, and stale signatures; safely acknowledges ping and unknown events', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    const paid = event('payment.paid', { id: attempt.providerPaymentId, status: 'paid', paidAmount: 500 });
    const raw = Buffer.from(JSON.stringify(paid));
    const timestamp = Math.floor(Date.now() / 1000);
    const valid = signWebhookForTest(String(timestamp), raw);
    assert.equal((await signedWebhook(paid, timestamp, `t=${timestamp},v1=${'0'.repeat(64)}`)).status, 401);
    assert.equal((await signedWebhook(paid, timestamp - 1000)).status, 401);
    assert.equal((await signedWebhook(paid, timestamp, `t=${timestamp},v1=${valid}`)).status, 200);
    assert.equal((await signedWebhook({ type: 'ping' })).status, 200);
    assert.equal((await signedWebhook({ type: 'some.future.event', data: {} })).status, 200);
    assert.equal((await Payment.findById(attempt.membershipPayment)).status, 'verified');
  });

  test('returns a retryable error when verified webhook processing fails, then accepts provider retry', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    const originalFindOne = HubPayment.findOne;
    HubPayment.findOne = () => Promise.reject(new Error('simulated database read failure'));
    try {
      const failed = await signedWebhook(event('payment.paid', { id: attempt.providerPaymentId, status: 'paid', paidAmount: 500 }));
      assert.equal(failed.status, 500);
    } finally {
      HubPayment.findOne = originalFindOne;
    }
    const retry = await signedWebhook(event('payment.paid', {
      id: attempt.providerPaymentId, status: 'paid', paidAmount: 500,
      metadata: { hubPaymentAttemptId: String(attempt._id) }
    }));
    assert.equal(retry.status, 200);
    assert.equal((await Payment.findById(attempt.membershipPayment)).status, 'verified');
  });

  test('status verification recovers a timeout by searching the local reference', async () => {
    const member = await registerApproved(app);
    createBehavior = async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); };
    const initiated = await startMembership(member);
    assert.equal(initiated.status, 202);
    const attempt = await HubPayment.findById(initiated.body.checkoutRequestID);
    getBehavior = async (call) => {
      assert.ok(call.url.includes(`/v1/payments?reference=${encodeURIComponent(attempt.reference)}`));
      return reply(200, { payments: [{
        id: 'hub-recovered-id', reference: attempt.reference, status: 'paid', paidAmount: 500,
        metadata: { hubPaymentAttemptId: String(attempt._id) }, receipt: 'RECOVERED-1'
      }] });
    };
    const checked = await request(app).get(`/api/payments/isa-hub/verify/${attempt._id}`).set(member.auth);
    assert.equal(checked.status, 200);
    assert.equal(checked.body.status, 'verified');
    assert.equal((await HubPayment.findById(attempt._id)).providerPaymentId, 'hub-recovered-id');
  });

  test('authenticated verification uses the Hub status endpoint and exposes no secret or full phone', async () => {
    const member = await registerApproved(app);
    const { attempt } = await membershipAttempt(member);
    const admin = await registerApproved(app);
    await User.updateOne({ _id: admin.id }, { role: 'admin' });
    const health = await request(app).get('/api/payments/isa-hub/health').set(admin.auth);
    assert.deepEqual(health.body, { enabled: true, reachable: true });
    const manualRace = await request(app).put(`/api/payments/${attempt.membershipPayment}/verify`)
      .set(admin.auth).send({ status: 'verified' });
    assert.equal(manualRace.status, 409);
    getBehavior = async (call) => reply(200, { payment: { id: attempt.providerPaymentId, status: 'paid', paidAmount: 500, receipt: 'VERIFY-1' } });
    process.env.ISA_HUB_ENABLED = 'false';
    const status = await request(app).get(`/api/payments/isa-hub/verify/${attempt._id}`).set(member.auth);
    assert.equal(status.status, 200, status.body.message);
    assert.equal(status.body.status, 'verified');
    assert.ok(calls.some((call) => call.url.includes(`/v1/payments/${attempt.providerPaymentId}`)));
    assert.equal(JSON.stringify(status.body).includes(HUB_SETTINGS.ISA_HUB_API_KEY), false);
    assert.equal(JSON.stringify(status.body).includes('254712345678'), false);
    const stranger = await registerApproved(app);
    assert.equal((await request(app).get(`/api/payments/isa-hub/verify/${attempt._id}`).set(stranger.auth)).status, 404);
  });

  test('feature switch rollback keeps legacy Daraja checkout available', async () => {
    const member = await registerApproved(app);
    process.env.ISA_HUB_ENABLED = 'false';
    const res = await startMembership(member);
    assert.equal(res.status, 201, res.body.message);
    assert.match(res.body.checkoutRequestID, /^daraja-/);
    assert.ok(calls.some((call) => call.url.includes('/mpesa/stkpush/v1/processrequest')));
    assert.equal(calls.some((call) => call.url.endsWith('/v1/payments')), false);
  });
});

describe('ISA Tech Hub merchandise payments', () => {
  test('order paid webhook confirms once; a repeated webhook cannot duplicate order history or notification', async () => {
    const member = await registerApproved(app);
    const product = await Product.create({ name: 'Hub test item', slug: `hub-item-${crypto.randomUUID()}`, price: 600, category: 'other', stock: null });
    const placed = await request(app).post('/api/merchandise/orders').set(member.auth).send({ items: [{ product: product._id, quantity: 1 }] });
    assert.equal(placed.status, 201, placed.body.message);
    const pushed = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    assert.equal(pushed.status, 201, pushed.body.message);
    const attempt = await HubPayment.findById(pushed.body.checkoutRequestID);
    const paid = event('payment.paid', { id: attempt.providerPaymentId, status: 'paid', paidAmount: 600, receipt: 'ORDER-HUB-1' });
    assert.equal((await signedWebhook(paid)).status, 200);
    assert.equal((await signedWebhook(paid)).status, 200);
    const order = await Order.findById(placed.body.order._id).lean();
    assert.equal(order.status, 'paid');
    assert.equal(order.payment.status, 'verified');
    assert.equal(order.history.filter((entry) => entry.status === 'paid').length, 1);
    assert.equal(await Notification.countDocuments({ targetUsers: member.id, title: `Payment confirmed for ${order.orderNumber}` }), 1);
    assert.match(order.payment.phone, /^\*+5678$/);
  });

  test('an order amount mismatch is visible to the shop and stays unpaid until a manager reviews it', async () => {
    const member = await registerApproved(app);
    const treasurer = await registerApproved(app);
    await User.updateOne({ _id: treasurer.id }, { role: 'treasurer' });
    const product = await Product.create({ name: 'Dispute item', slug: `dispute-${crypto.randomUUID()}`, price: 800, category: 'other', stock: null });
    const placed = await request(app).post('/api/merchandise/orders').set(member.auth).send({ items: [{ product: product._id, quantity: 1 }] });
    const pushed = await request(app).post(`/api/merchandise/orders/${placed.body.order._id}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    const attempt = await HubPayment.findById(pushed.body.checkoutRequestID);
    assert.equal((await signedWebhook(event('payment.paid', {
      id: attempt.providerPaymentId, status: 'paid', paidAmount: 799
    }))).status, 200);
    assert.equal((await Order.findById(placed.body.order._id)).status, 'awaiting_payment');
    const review = await request(app).get('/api/merchandise/orders?status=review').set(treasurer.auth);
    assert.equal(review.status, 200);
    assert.ok(review.body.orders.some((order) => order._id === placed.body.order._id));
    const confirm = await request(app).put(`/api/merchandise/orders/${placed.body.order._id}/payment`)
      .set(treasurer.auth).send({ status: 'verified' });
    assert.equal(confirm.status, 200, confirm.body.message);
    assert.equal(confirm.body.order.status, 'paid');
    assert.equal((await HubPayment.findById(attempt._id)).status, 'disputed');
  });

  test('uncertain Hub initiation reuses its idempotency key after switch rollback without moving payouts', async () => {
    const member = await registerApproved(app);
    const product = await Product.create({ name: 'Hub retry item', slug: `hub-retry-${crypto.randomUUID()}`, price: 700, category: 'other', stock: null });
    const placed = await request(app).post('/api/merchandise/orders').set(member.auth).send({ items: [{ product: product._id, quantity: 1 }] });
    createBehavior = async () => { throw Object.assign(new Error('timeout'), { name: 'AbortError' }); };
    const orderId = placed.body.order._id;
    const first = await request(app).post(`/api/merchandise/orders/${orderId}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    assert.equal(first.status, 202);
    const key = calls.find((call) => call.method === 'POST').headers['Idempotency-Key'];
    process.env.ISA_HUB_ENABLED = 'false';
    const blocked = await request(app).post(`/api/merchandise/orders/${orderId}/mpesa`).set(member.auth).send({ phone: '0712345678' });
    assert.equal(blocked.status, 409);
    assert.ok(key);
    assert.equal(calls.filter((call) => call.url.endsWith('/v1/payments')).length, 1);
    assert.equal(calls.some((call) => call.url.includes('/mpesa/stkpush/')), false);
  });
});
