const mongoose = require('mongoose');

const hubPaymentSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: ['registration', 'renewal', 'order'], required: true },
  membershipPayment: { type: mongoose.Schema.Types.ObjectId, ref: 'Payment' },
  order: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },
  amount: { type: Number, required: true, min: 1 },
  // The local attempt ID is also the Hub idempotency key and client-safe status token.
  reference: { type: String, required: true },
  providerPaymentId: { type: String, trim: true },
  status: { type: String, enum: ['pending', 'verified', 'rejected', 'disputed'], default: 'pending', index: true },
  initiationStatus: { type: String, enum: ['prepared', 'accepted', 'uncertain', 'rejected'], default: 'prepared' },
  phone: { type: String, select: false },
  phoneMasked: { type: String, default: '' },
  paidAmount: { type: Number },
  receipt: { type: String, trim: true },
  resultCode: { type: mongoose.Schema.Types.Mixed },
  resultMessage: { type: String, maxlength: 300 },
  verifiedAt: { type: Date },
  fulfilledAt: { type: Date },
  lastCheckedAt: { type: Date },
  reconciliationLockUntil: { type: Date }
}, { timestamps: true });

hubPaymentSchema.index({ providerPaymentId: 1 }, { unique: true, sparse: true });
hubPaymentSchema.index({ status: 1, providerPaymentId: 1, updatedAt: 1 });
hubPaymentSchema.index({ order: 1, createdAt: -1 });

module.exports = mongoose.model('HubPayment', hubPaymentSchema);
