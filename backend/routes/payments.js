const express = require('express');
const { body } = require('express-validator');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');
const { uploadImage } = require('../middleware/upload');
const cloudinary = require('../config/cloudinary');

const { validate } = require('../middleware/validate');

const router = express.Router();

const PAYMENT_TYPES = ['registration', 'renewal'];

// ─── Fees ───────────────────────────────────────────────────────────

const FEE_SETTINGS = { registration: 'REGISTRATION_FEE', renewal: 'RENEWAL_FEE' };

/**
 * The fee for a payment type in whole shillings, or null when it is not set.
 *
 * M-Pesa payments are verified automatically, so the amount charged has to come
 * from the server. It used to be whatever the browser sent, which let a member
 * pay KES 1 for a full membership term.
 */
const feeFor = (type) => {
  const fee = Number(process.env[FEE_SETTINGS[type]]);
  return Number.isInteger(fee) && fee > 0 ? fee : null;
};

// ─── M-Pesa helpers ─────────────────────────────────────────────────

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

const formatPhone = (phone) => {
  let p = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
  return p;
};

// GET /api/payments/fees - the amounts members pay, and whether M-Pesa is available
router.get('/fees', protect, (req, res) => {
  res.json({
    registration: feeFor('registration'),
    renewal: feeFor('renewal'),
    mpesa: mpesaConfigured()
  });
});

// POST /api/payments/mpesa/stkpush - initiate M-Pesa STK Push
router.post('/mpesa/stkpush', protect, [
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('type').isIn(PAYMENT_TYPES).withMessage('Invalid payment type'),
  body('semester').optional().trim(),
  body('academicYear').optional().trim(),
  validate
], async (req, res) => {
  try {
    // Any amount in the request is ignored; the member pays the configured fee.
    const { phone, type, semester, academicYear } = req.body;

    if (!mpesaConfigured()) {
      if (!mpesaHost()) console.error(`MPESA_ENV must be "sandbox" or "production", not "${process.env.MPESA_ENV}".`);
      return res.status(503).json({ message: 'M-Pesa payments are not available right now. Please submit your payment manually.' });
    }

    const amount = feeFor(type);
    if (!amount) {
      return res.status(503).json({ message: `The ${type} fee has not been set up yet, so it cannot be paid by M-Pesa. Please contact the treasurer.` });
    }

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
        AccountReference: `EESA-${type.toUpperCase()}`,
        TransactionDesc: `EESA ${type} payment`,
      }),
    });

    const stkData = await stkRes.json();

    if (stkData.ResponseCode !== '0') {
      return res.status(400).json({ message: stkData.errorMessage || stkData.ResponseDescription || 'STK Push failed' });
    }

    // Create pending payment
    const payment = await Payment.create({
      user: req.user._id,
      type,
      amount,
      paymentMethod: 'mpesa',
      mpesaCheckoutRequestID: stkData.CheckoutRequestID,
      mpesaMerchantRequestID: stkData.MerchantRequestID,
      mpesaPhoneNumber: formatPhone(phone),
      semester,
      academicYear,
      reference: `MPESA-${stkData.CheckoutRequestID}`,
    });

    res.status(201).json({
      message: 'STK Push sent. Check your phone to complete payment.',
      checkoutRequestID: stkData.CheckoutRequestID,
      paymentId: payment._id,
      amount,
    });
  } catch (error) {
    console.error('M-Pesa STK Push error:', error);
    res.status(500).json({ message: 'Failed to initiate M-Pesa payment' });
  }
});

// POST /api/payments/mpesa/callback - M-Pesa callback (no auth — called by Safaricom)
router.post('/mpesa/callback', async (req, res) => {
  try {
    const { Body } = req.body;
    const { stkCallback } = Body || {};

    if (!stkCallback) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const { CheckoutRequestID, ResultCode, CallbackMetadata } = stkCallback;

    const payment = await Payment.findOne({ mpesaCheckoutRequestID: CheckoutRequestID });
    if (!payment) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    // Safaricom retries callbacks until it receives an acknowledgement, so the
    // same result can arrive several times. Acknowledge repeats without
    // reapplying them, which previously could extend a membership twice or flip
    // an already-verified payment back to rejected.
    if (payment.status === 'verified') {
      return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
    }

    if (ResultCode === 0) {
      // Successful payment
      const meta = CallbackMetadata?.Item || [];
      const receipt = meta.find(i => i.Name === 'MpesaReceiptNumber')?.Value;

      payment.status = 'verified';
      payment.mpesaReceiptNumber = receipt || '';
      payment.reference = receipt || payment.reference;
      payment.verifiedAt = new Date();
      await payment.save();

      // Update membership
      await User.findByIdAndUpdate(payment.user, {
        membershipPaid: true,
        membershipExpiry: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        lastPaymentDate: new Date(),
      });
    } else {
      payment.status = 'rejected';
      payment.rejectionReason = `M-Pesa error: ${stkCallback.ResultDesc || 'Payment cancelled'}`;
      await payment.save();
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (error) {
    console.error('M-Pesa callback error:', error);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

// GET /api/payments/mpesa/status/:checkoutRequestId - check STK push status
router.get('/mpesa/status/:checkoutRequestId', protect, async (req, res) => {
  try {
    const payment = await Payment.findOne({
      mpesaCheckoutRequestID: req.params.checkoutRequestId,
      user: req.user._id,
    });
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    res.json({ status: payment.status, payment });
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
});

// POST /api/payments - submit payment
router.post('/', protect, uploadImage.single('proofScreenshot'), [
  body('type').isIn(PAYMENT_TYPES).withMessage('Invalid payment type'),
  body('amount').isFloat({ min: 1, max: 1000000 }).withMessage('Enter a valid amount between KES 1 and 1,000,000').toFloat(),
  body('reference').trim().notEmpty().withMessage('Payment reference is required')
    .isLength({ max: 60 }).withMessage('Payment reference is too long'),
  body('semester').optional().trim(),
  body('academicYear').optional().trim(),
  validate
], async (req, res) => {
  try {
    const { type, amount, reference, semester, academicYear, notes } = req.body;

    // An M-Pesa reference identifies one transaction. Rejecting repeats stops a
    // member submitting the same receipt twice, by accident or otherwise.
    const duplicate = await Payment.findOne({
      reference: reference.trim().toUpperCase(),
      status: { $ne: 'rejected' }
    }).select('_id').lean();
    if (duplicate) {
      return res.status(409).json({ message: 'That payment reference has already been submitted.' });
    }

    let proofScreenshot = '';
    if (req.file) {
      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: 'eesa/payments' },
          (err, result) => err ? reject(err) : resolve(result)
        );
        stream.end(req.file.buffer);
      });
      proofScreenshot = result.secure_url;
    }

    const payment = await Payment.create({
      user: req.user._id,
      type,
      amount,
      reference: reference.trim().toUpperCase(),
      semester,
      academicYear,
      notes,
      proofScreenshot
    });

    res.status(201).json(payment);
  } catch (error) {
    console.error('Payment submit error:', error);
    res.status(500).json({ message: 'Server error submitting payment' });
  }
});

// GET /api/payments/my - get user's payments
router.get('/my', protect, async (req, res) => {
  try {
    const payments = await Payment.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json({ payments });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching payments' });
  }
});

// GET /api/payments - admin: all payments
router.get('/', protect, adminOnly, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const skip = (page - 1) * limit;
    const status = req.query.status;

    const filter = {};
    if (status) filter.status = status;

    const [payments, total] = await Promise.all([
      Payment.find(filter)
        .populate('user', 'firstName lastName email regNumber department')
        .populate('verifiedBy', 'firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(filter)
    ]);

    res.json({ payments, page, totalPages: Math.ceil(total / limit), total });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching payments' });
  }
});

// PUT /api/payments/:id/verify - admin: verify/reject
router.put('/:id/verify', protect, adminOnly, [
  body('status').isIn(['verified', 'rejected']).withMessage('Invalid status'),
  body('rejectionReason').optional().trim(),
  validate
], async (req, res) => {
  try {
    const { status, rejectionReason } = req.body;

    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });

    payment.status = status;
    payment.verifiedBy = req.user._id;
    payment.verifiedAt = new Date();
    if (status === 'rejected' && rejectionReason) {
      payment.rejectionReason = rejectionReason;
    }

    await payment.save();

    // If verified, update user's membership status
    if (status === 'verified') {
      await User.findByIdAndUpdate(payment.user, {
        membershipPaid: true,
        membershipExpiry: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000), // ~6 months
        lastPaymentDate: new Date()
      });
    }

    const populated = await Payment.findById(payment._id)
      .populate('user', 'firstName lastName email regNumber department')
      .populate('verifiedBy', 'firstName lastName');

    res.json(populated);
  } catch (error) {
    res.status(500).json({ message: 'Server error verifying payment' });
  }
});

// DELETE /api/payments/:id - admin: delete payment
router.delete('/:id', protect, adminOnly, async (req, res) => {
  try {
    const payment = await Payment.findById(req.params.id);
    if (!payment) return res.status(404).json({ message: 'Payment not found' });
    await payment.deleteOne();
    res.json({ message: 'Payment deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error deleting payment' });
  }
});

// GET /api/payments/stats - admin: payment stats
router.get('/stats', protect, adminOnly, async (req, res) => {
  try {
    const [total, pending, verified, rejected, totalAmount] = await Promise.all([
      Payment.countDocuments(),
      Payment.countDocuments({ status: 'pending' }),
      Payment.countDocuments({ status: 'verified' }),
      Payment.countDocuments({ status: 'rejected' }),
      Payment.aggregate([
        { $match: { status: 'verified' } },
        { $group: { _id: null, total: { $sum: '$amount' } } }
      ])
    ]);

    res.json({
      total, pending, verified, rejected,
      totalAmount: totalAmount[0]?.total || 0
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error fetching payment stats' });
  }
});

module.exports = router;
