const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

process.env.NODE_ENV = 'test';
process.env.FRONTEND_URL = 'https://eesa-en.vercel.app';

const express = require('express');
const request = require('supertest');
const { errorHandler } = require('../middleware/errorHandler');
const { corsMiddleware } = require('../middleware/cors');

const app = express();
app.use(corsMiddleware);
app.get('/health', (req, res) => res.json({ ok: true }));
app.use(errorHandler);

describe('CORS origins', () => {
  for (const origin of ['https://eesa.co.ke', 'https://eesa.egerton.ac.ke']) {
    test(`allows ${origin}`, async () => {
      const response = await request(app).get('/health').set('Origin', origin);
      assert.equal(response.status, 200);
      assert.equal(response.headers['access-control-allow-origin'], origin);
      assert.equal(response.headers['access-control-allow-credentials'], 'true');
    });
  }

  test('continues to reject origins outside the allowlist', async () => {
    const response = await request(app).get('/health').set('Origin', 'https://unapproved.example');
    assert.equal(response.status, 403);
    assert.equal(response.body.code, 'cors_blocked');
  });
});