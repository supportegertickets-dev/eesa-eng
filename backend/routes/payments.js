const express = require('express');
const { body, validationResult } = require('express-validator');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { protect, adminOnly } = require('../middleware/auth');

const router = express.Router();

const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });
  next();
};

// ─── M-Pesa helpers ─────────────────────────────────────────────────
const getMpesaToken = async () => {
  const auth = Buffer.from(`${process.env.MPESA_CONSUMER_KEY}:${process.env.MPESA_CONSUMER_SECRET}`).toString('base64');
  const res = await fetch(
    'https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials',
    { headers: { Authorization: `Basic ${auth}` } }
  );
  const data = await res.json();
  return data.access_token;
};

const formatPhone = (phone) => {
  let p = phone.replace(/\s+/g, '').replace(/^0/, '254').replace(/^\+/, '');
  return p;
};

// POST /api/payments/mpesa/stkpush - initiate M-Pesa STK Push
router.post('/mpesa/stkpush', protect, [
  body('phone').trim().notEmpty().withMessage('Phone number is required'),
  body('amount').isNumeric().withMessage('Amount is required'),
  body('type').isIn(['registration', 'renewal']).withMessage('Invalid payment type'),
  body('semester').optional().trim().escape(),
  body('academicYear').optional().trim().escape(),
  validate
], async (req, res) => {
  try {
    const { phone, amount, type, semester, academicYear } = req.body;
    const token = await getMpesaToken();
    const timestamp = new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14);
    const password = Buffer.from(`${process.env.MPESA_SHORTCODE}${process.env.MPESA_PASSKEY}${timestamp}`).toString('base64');

    const stkRes = await fetch('https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest', {
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
        Amount: Math.round(amount),
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
      amount: Math.round(amount),
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
router.post('/', protect, [
  body('type').isIn(['registration', 'renewal']).withMessage('Invalid payment type'),
  body('amount').isNumeric().withMessage('Amount is required'),
  body('reference').trim().notEmpty().withMessage('Payment reference is required').escape(),
  body('semester').optional().trim().escape(),
  body('academicYear').optional().trim().escape(),
  validate
], async (req, res) => {
  try {
    const { type, amount, reference, semester, academicYear, notes } = req.body;

    const payment = await Payment.create({
      user: req.user._id,
      type,
      amount,
      reference,
      semester,
      academicYear,
      notes
    });

    res.status(201).json(payment);
  } catch (error) {
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
  body('rejectionReason').optional().trim().escape(),
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
