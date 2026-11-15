const crypto = require('crypto');

const DEFAULT_TOLERANCE_SECONDS = 300;
const config = () => ({
  enabled: process.env.ISA_HUB_ENABLED === 'true',
  baseUrl: (process.env.ISA_HUB_BASE_URL || '').replace(/\/+$/, ''),
  apiKey: process.env.ISA_HUB_API_KEY || '',
  webhookSecret: process.env.ISA_HUB_WEBHOOK_SECRET || ''
});

const configured = () => {
  const { baseUrl, apiKey, webhookSecret } = config();
  if (!baseUrl || !apiKey || !webhookSecret) return false;
  try {
    const url = new URL(baseUrl);
    return ['http:', 'https:'].includes(url.protocol)
      && (process.env.NODE_ENV !== 'production' || url.protocol === 'https:');
  } catch {
    return false;
  }
};

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length < 4 ? '' : `${'*'.repeat(Math.max(0, digits.length - 4))}${digits.slice(-4)}`;
};

const request = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
  const { baseUrl, apiKey } = config();
  if (!configured()) throw Object.assign(new Error('ISA Tech Hub is not configured'), { code: 'hub_not_configured' });
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {})
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(Number(process.env.ISA_HUB_TIMEOUT_MS) || 15000)
  });
  let payload;
  try { payload = await response.json(); } catch { payload = null; }
  if (!response.ok) {
    const error = new Error(`ISA Hub request failed (${response.status})`);
    error.status = response.status;
    error.providerCode = payload?.code;
    throw error;
  }
  return payload;
};

const parseSignature = (header) => {
  const fields = Object.fromEntries(String(header || '').split(',').map((part) => {
    const separator = part.indexOf('=');
    return separator < 0 ? ['', ''] : [part.slice(0, separator).trim(), part.slice(separator + 1).trim()];
  }));
  return { timestamp: fields.t, signature: fields.v1 };
};

const verifyWebhook = (header, rawBody, now = Date.now()) => {
  const { webhookSecret } = config();
  if (!webhookSecret || !Buffer.isBuffer(rawBody)) return false;
  const { timestamp, signature } = parseSignature(header);
  if (!/^\d{1,12}$/.test(timestamp || '') || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  const seconds = Number(timestamp);
  const tolerance = Number(process.env.ISA_HUB_WEBHOOK_TOLERANCE_SECONDS) || DEFAULT_TOLERANCE_SECONDS;
  if (!Number.isFinite(seconds) || Math.abs(Math.floor(now / 1000) - seconds) > tolerance) return false;
  const expected = crypto.createHmac('sha256', webhookSecret).update(`${timestamp}.`).update(rawBody).digest();
  const received = Buffer.from(signature, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
};

const signWebhookForTest = (timestamp, rawBody, secret = config().webhookSecret) =>
  crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex');

module.exports = { config, configured, maskPhone, request, verifyWebhook, signWebhookForTest };
