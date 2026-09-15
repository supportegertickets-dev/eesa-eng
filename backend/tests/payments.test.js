/**
 * Payment tests.
 *
 * Covers the fee M-Pesa charges, which Daraja environment it talks to, the
 * callback, manual submissions and who may review payments. Safaricom is
 * replaced with a stub for global fetch, so no request leaves the process, and
 * MongoDB runs in memory.
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
let Payment;

const realFetch = global.fetch;

// Every request the routes send to Safaricom, in order.
let darajaCalls = [];
let checkoutCounter = 0;

const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

/** Answer Daraja requests; `overrides` replaces the reply for a path fragment. */
const stubDaraja = (overrides = {}) => {
  global.fetch = async (url, options = {}) => {
    const call = { url: String(url), body: options.body ? JSON.parse(options.body) : null };
    darajaCalls.push(call);

    const override = Object.keys(overrides).find((fragment) => call.url.includes(fragment));
    if (override) return overrides[override];

    if (call.url.includes('/oauth/v1/generate')) {
      return reply(200, { access_token: 'daraja-token', expires_in: '3599' });
    }
    if (call.url.includes('/mpesa/stkpush/v1/processrequest')) {
      checkoutCounter += 1;
      return reply(200, {
        ResponseCode: '0',
        ResponseDescription: 'Success. Request accepted for processing',
        CheckoutRequestID: `ws_CO_test_${checkoutCounter}`,
        MerchantRequestID: `mr_test_${checkoutCounter}`
      });
    }
    throw new Error(`Unexpected request to ${call.url}`);
  };
};

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());

  User = require('../models/User');
  Payment = require('../models/Payment');

  const express = require('express');
  const { mongoSanitize } = require('../utils/sanitize');
  const { notFound, errorHandler } = require('../middleware/errorHandler');

  app = express();
  app.use(express.json());
  app.use(mongoSanitize);
  app.use('/api/auth', require('../routes/auth'));
  app.use('/api/payments', require('../routes/payments'));
  app.use(notFound);
  app.use(errorHandler);
});

beforeEach(() => {
  darajaCalls = [];
  Object.assign(process.env, MPESA_SETTINGS, { REGISTRATION_FEE: '500', RENEWAL_FEE: '300' });
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
  const res = await request(app).post('/api/auth/register').send({
    firstName: `Payer${counter}`,
    lastName: 'Test',
    email: `payments${counter}-${Date.now()}@example.com`,
    password: 'Str0ngPass1'
  });
  assert.equal(res.status, 201, res.body.message);
  if (role !== 'member') await User.updateOne({ _id: res.body._id }, { role });
  return { id: res.body._id, auth: { Authorization: `Bearer ${res.body.token}` } };
};

const stkPush = (member, fields = {}) => request(app)
  .post('/api/payments/mpesa/stkpush')
  .set(member.auth)
  .send({ phone: '0712345678', type: 'registration', ...fields });

const callback = (checkoutRequestID, resultCode, { receipt, resultDesc } = {}) => request(app)
  .post('/api/payments/mpesa/callback')
  .send({
    Body: {
      stkCallback: {
        MerchantRequestID: 'mr',
        CheckoutRequestID: checkoutRequestID,
        ResultCode: resultCode,
        ResultDesc: resultDesc || (resultCode === 0 ? 'The service request is processed successfully.' : 'Request cancelled by user'),
        ...(receipt && { CallbackMetadata: { Item: [{ Name: 'MpesaReceiptNumber', Value: receipt }] } })
      }
    }
  });

describe('fees', () => {
  test('members can see the configured fees and whether M-Pesa is available', async () => {
    const member = await makeUser();
    const res = await request(app).get('/api/payments/fees').set(member.auth);
    assert.equal(res.status, 200, res.body.message);
    assert.deepEqual(res.body, { registration: 500, renewal: 300, mpesa: true });
  });

  test('a missing or malformed fee, or an unknown environment, is reported as unavailable', async () => {
    const member = await makeUser();
    process.env.REGISTRATION_FEE = '12.5';
    process.env.RENEWAL_FEE = '';
    process.env.MPESA_ENV = 'live';

    const res = await request(app).get('/api/payments/fees').set(member.auth);
    assert.deepEqual(res.body, { registration: null, renewal: null, mpesa: false });
  });

  test('fees require a session', async () => {
    assert.equal((await request(app).get('/api/payments/fees')).status, 401);
  });
});

describe('M-Pesa STK push', () => {
  test('charges the configured fee, whatever amount the request names', async () => {
    const member = await makeUser();
    const res = await stkPush(member, { amount: 1, type: 'renewal' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.amount, 300);

    const stk = darajaCalls.find((call) => call.url.includes('/stkpush/'));
    assert.equal(stk.body.Amount, 300);
    assert.equal(stk.body.PhoneNumber, '254712345678');

    const payment = await Payment.findById(res.body.paymentId).lean();
    assert.equal(payment.amount, 300);
    assert.equal(payment.status, 'pending');
    assert.equal(payment.paymentMethod, 'mpesa');
  });

  test('talks to the sandbox unless MPESA_ENV is production', async () => {
    const member = await makeUser();

    assert.equal((await stkPush(member)).status, 201);
    assert.equal(darajaCalls.length, 2);
    assert.ok(darajaCalls.every((call) => call.url.startsWith('https://sandbox.safaricom.co.ke/')));

    darajaCalls = [];
    process.env.MPESA_ENV = 'production';
    assert.equal((await stkPush(member)).status, 201);
    assert.equal(darajaCalls.length, 2);
    assert.ok(darajaCalls.every((call) => call.url.startsWith('https://api.safaricom.co.ke/')));
  });

  test('refuses a fee that is not set, without contacting Safaricom', async () => {
    const member = await makeUser();
    delete process.env.RENEWAL_FEE;

    const res = await stkPush(member, { type: 'renewal', amount: 300 });
    assert.equal(res.status, 503);
    assert.match(res.body.message, /renewal fee has not been set up/);
    assert.equal(darajaCalls.length, 0);
    assert.equal(await Payment.countDocuments({ user: member.id }), 0);
  });

  test('refuses when M-Pesa is misconfigured, without contacting Safaricom', async () => {
    const member = await makeUser();

    process.env.MPESA_ENV = 'live';
    assert.equal((await stkPush(member)).status, 503);

    delete process.env.MPESA_ENV;
    delete process.env.MPESA_PASSKEY;
    assert.equal((await stkPush(member)).status, 503);

    assert.equal(darajaCalls.length, 0);
    assert.equal(await Payment.countDocuments({ user: member.id }), 0);
  });

  test('records nothing when Safaricom rejects the credentials', async () => {
    const member = await makeUser();
    stubDaraja({ '/oauth/v1/generate': reply(400, { errorMessage: 'Invalid credentials' }) });

    const res = await stkPush(member);
    assert.equal(res.status, 500);
    assert.equal(darajaCalls.some((call) => call.url.includes('/stkpush/')), false);
    assert.equal(await Payment.countDocuments({ user: member.id }), 0);
  });

  test('members can only check the status of their own payments', async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const { body } = await stkPush(owner);

    const own = await request(app).get(`/api/payments/mpesa/status/${body.checkoutRequestID}`).set(owner.auth);
    assert.equal(own.status, 200);
    assert.equal(own.body.status, 'pending');

    const theirs = await request(app).get(`/api/payments/mpesa/status/${body.checkoutRequestID}`).set(other.auth);
    assert.equal(theirs.status, 404);
  });
});

describe('M-Pesa callback', () => {
  test('a successful payment is verified and the member marked paid', async () => {
    const member = await makeUser();
    const { body } = await stkPush(member);

    const res = await callback(body.checkoutRequestID, 0, { receipt: 'SJK3D7HF2R' });
    assert.equal(res.status, 200);
    assert.equal(res.body.ResultCode, 0);

    const payment = await Payment.findById(body.paymentId).lean();
    assert.equal(payment.status, 'verified');
    assert.equal(payment.reference, 'SJK3D7HF2R');

    const user = await User.findById(member.id).lean();
    assert.equal(user.membershipPaid, true);
    assert.ok(user.membershipExpiry > new Date());
  });

  test('a repeated callback is acknowledged without being applied again', async () => {
    const member = await makeUser();
    const { body } = await stkPush(member);

    await callback(body.checkoutRequestID, 0, { receipt: 'SJK3D7HF2S' });
    const { membershipExpiry } = await User.findById(member.id).lean();

    const again = await callback(body.checkoutRequestID, 1032);
    assert.equal(again.status, 200);
    assert.equal((await Payment.findById(body.paymentId).lean()).status, 'verified');
    assert.equal((await User.findById(member.id).lean()).membershipExpiry.getTime(), membershipExpiry.getTime());
  });

  test('a cancelled payment is rejected with the reason and grants nothing', async () => {
    const member = await makeUser();
    const { body } = await stkPush(member);

    await callback(body.checkoutRequestID, 1032, { resultDesc: 'Request cancelled by user' });

    const payment = await Payment.findById(body.paymentId).lean();
    assert.equal(payment.status, 'rejected');
    assert.match(payment.rejectionReason, /cancelled by user/);
    assert.equal((await User.findById(member.id).lean()).membershipPaid, false);
  });
});

describe('manual payments', () => {
  const submit = (member, fields = {}) => request(app)
    .post('/api/payments')
    .set(member.auth)
    .send({ type: 'registration', amount: 500, reference: `ref${Date.now()}${counter}`, ...fields });

  test('a member submits a payment for review', async () => {
    const member = await makeUser();
    const res = await submit(member, { reference: ' qwe123rty ' });
    assert.equal(res.status, 201, res.body.message);
    assert.equal(res.body.status, 'pending');
    assert.equal(res.body.reference, 'QWE123RTY');

    const mine = await request(app).get('/api/payments/my').set(member.auth);
    assert.deepEqual(mine.body.payments.map((p) => p.reference), ['QWE123RTY']);
  });

  test('a reference can be submitted again only after it was rejected', async () => {
    const member = await makeUser();
    const admin = await makeUser('admin');

    const first = await submit(member, { reference: 'DUPL1CATE' });
    assert.equal(first.status, 201);
    assert.equal((await submit(member, { reference: 'dupl1cate' })).status, 409);

    const rejected = await request(app).put(`/api/payments/${first.body._id}/verify`).set(admin.auth)
      .send({ status: 'rejected', rejectionReason: 'Reference not found on the statement' });
    assert.equal(rejected.status, 200);

    assert.equal((await submit(member, { reference: 'DUPL1CATE' })).status, 201);
  });

  test('rejects an amount outside the allowed range', async () => {
    const member = await makeUser();
    assert.equal((await submit(member, { amount: 0 })).status, 400);
    assert.equal((await submit(member, { amount: 'five hundred' })).status, 400);
  });

  test('only administrators and the chairperson can review payments', async () => {
    const member = await makeUser();
    const treasurer = await makeUser('treasurer');
    const { body: payment } = await submit(member);

    for (const reviewer of [member, treasurer]) {
      assert.equal((await request(app).get('/api/payments').set(reviewer.auth)).status, 403);
      assert.equal((await request(app).get('/api/payments/stats').set(reviewer.auth)).status, 403);
      assert.equal((await request(app).put(`/api/payments/${payment._id}/verify`).set(reviewer.auth).send({ status: 'verified' })).status, 403);
      assert.equal((await request(app).delete(`/api/payments/${payment._id}`).set(reviewer.auth)).status, 403);
    }
    assert.equal((await Payment.findById(payment._id).lean()).status, 'pending');
  });

  test('verifying a payment marks the member paid and counts towards the totals', async () => {
    await Payment.deleteMany({});
    const member = await makeUser();
    const chairperson = await makeUser('chairperson');
    const { body: payment } = await submit(member, { amount: 500 });
    await submit(member, { amount: 300, type: 'renewal' });

    const res = await request(app).put(`/api/payments/${payment._id}/verify`).set(chairperson.auth).send({ status: 'verified' });
    assert.equal(res.status, 200, res.body.message);
    assert.equal(res.body.status, 'verified');
    assert.equal(String(res.body.verifiedBy._id), chairperson.id);
    assert.equal((await User.findById(member.id).lean()).membershipPaid, true);

    const stats = await request(app).get('/api/payments/stats').set(chairperson.auth);
    assert.deepEqual(stats.body, { total: 2, pending: 1, verified: 1, rejected: 0, totalAmount: 500 });
  });
});
