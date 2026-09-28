/**
 * M-Pesa Daraja helpers shared by membership payments and shop orders.
 *
 * Both send an STK Push to the same shortcode and receive the result on the
 * same callback URL (MPESA_CALLBACK_URL), so the callback in routes/payments.js
 * looks the checkout up among membership payments first and then among orders.
 */

const MPESA_HOSTS = {
  sandbox: 'https://sandbox.safaricom.co.ke',
  production: 'https://api.safaricom.co.ke'
};

const MPESA_SETTINGS = ['MPESA_CONSUMER_KEY', 'MPESA_CONSUMER_SECRET', 'MPESA_SHORTCODE', 'MPESA_PASSKEY', 'MPESA_CALLBACK_URL'];

/**
 * The Daraja host for MPESA_ENV. Unset means the sandbox. Any other value is
 * treated as a mistake rather than quietly sending live payments to the sandbox.
 */
const mpesaHost = () => MPESA_HOSTS[process.env.MPESA_ENV || 'sandbox'] || null;

const mpesaConfigured = () => Boolean(mpesaHost()) && MPESA_SETTINGS.every((key) => process.env[key]);

const getMpesaToken = async () => {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(
    `${mpesaHost()}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = await res.json().catch(() => ({}));
  // Credentials for the wrong environment fail here; say so instead of sending
  // the STK request with an undefined token.
  if (!res.ok || !data.access_token) {
    throw new Error(`M-Pesa authentication failed with status ${res.status}`);
  }
  return data.access_token;
};

const formatPhone = (phone) => String(phone || '').replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');

/**
 * A Safaricom number in the 2547XXXXXXXX or 2541XXXXXXXX form Daraja expects,
 * or null when the input is not one.
 */
const normalizeKenyanPhone = (phone) => {
  const digits = formatPhone(phone).replace(/[-()]/g, '');
  const local = digits.replace(/^254/, '');
  return /^[17]\d{8}$/.test(local) ? `254${local}` : null;
};

/**
 * Send an STK Push. Resolves with Daraja's reply when the request was
 * accepted; rejects with a message fit to show the member when it was not.
 * @returns {Promise<{ CheckoutRequestID: string, MerchantRequestID: string }>}
 */
const requestStkPush = async ({ phone, amount, accountReference, description }) => {
  const token = await getMpesaToken();
  const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
  const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

  const stkRes = await fetch(`${mpesaHost()}/mpesa/stkpush/v1/processrequest`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      BusinessShortCode: process.env.MPESA_SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: formatPhone(phone),
      PartyB: process.env.MPESA_SHORTCODE,
      PhoneNumber: formatPhone(phone),
      CallBackURL: process.env.MPESA_CALLBACK_URL,
      AccountReference: accountReference,
      TransactionDesc: description,
    }),
  });

  const stkData = await stkRes.json();

  if (stkData.ResponseCode !== '0') {
    const error = new Error(stkData.errorMessage || stkData.ResponseDescription || 'STK Push failed');
    error.rejectedByMpesa = true;
    throw error;
  }

  return stkData;
};

/** The receipt number from a successful callback's metadata, if present. */
const receiptFrom = (stkCallback) =>
  (stkCallback?.CallbackMetadata?.Item || []).find((item) => item.Name === 'MpesaReceiptNumber')?.Value;

module.exports = {
  mpesaHost, mpesaConfigured, getMpesaToken, formatPhone, normalizeKenyanPhone, requestStkPush, receiptFrom
};
