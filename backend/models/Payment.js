const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['registration', 'renewal'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  semester: { type: String, trim: true },
  academicYear: { type: String, trim: true },
  reference: { type: String, trim: true },
  proofScreenshot: { type: String, default: '' },
  paymentMethod: {
    type: String,
    enum: ['manual', 'mpesa'],
    default: 'manual'
  },
  mpesaCheckoutRequestID: { type: String },
  mpesaMerchantRequestID: { type: String },
  mpesaReceiptNumber: { type: String },
  mpesaPhoneNumber: { type: String },
  status: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  verifiedAt: { type: Date },
  rejectionReason: { type: String, maxlength: 500 },
  notes: { type: String, maxlength: 500 }
}, { timestamps: true });

module.exports = mongoose.model('Payment', paymentSchema);
