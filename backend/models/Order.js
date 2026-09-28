const mongoose = require('mongoose');

/**
 * Order lifecycle. Orders are collected in person, so there is no shipping step.
 *
 *   awaiting_payment -> paid -> ready -> collected
 *           \------------\-------\----> cancelled
 */
const ORDER_STATUSES = ['awaiting_payment', 'paid', 'ready', 'collected', 'cancelled'];

/** unpaid: nothing submitted; pending: an STK Push or a receipt awaiting a result. */
const PAYMENT_STATUSES = ['unpaid', 'pending', 'verified', 'rejected'];

// Items copy the product's name, price and photo at the time of ordering, so
// later edits to the catalogue never change what a member agreed to pay.
const itemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 0 },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  size: { type: String, default: '' },
  color: { type: String, default: '' },
  image: { type: String, default: '' }
}, { _id: false });

const historySchema = new mongoose.Schema({
  status: { type: String, enum: ORDER_STATUSES, required: true },
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  note: { type: String, maxlength: 300 }
}, { _id: false });

const orderSchema = new mongoose.Schema({
  orderNumber: { type: String, required: true, unique: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  items: {
    type: [itemSchema],
    validate: { validator: (list) => list.length > 0 && list.length <= 20, message: 'An order needs between 1 and 20 items.' }
  },
  total: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ORDER_STATUSES, default: 'awaiting_payment' },
  contactPhone: { type: String, trim: true, maxlength: 20 },
  notes: { type: String, trim: true, maxlength: 500 },
  payment: {
    method: { type: String, enum: ['mpesa', 'manual'] },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'unpaid' },
    reference: { type: String, trim: true, uppercase: true },
    proofUrl: { type: String, default: '' },
    phone: { type: String },
    // The latest STK Push, and every one sent for this order, since a member
    // who asked for a second prompt may still answer the first.
    mpesaCheckoutRequestID: { type: String },
    mpesaAttempts: { type: [String], default: [] },
    mpesaReceiptNumber: { type: String },
    submittedAt: { type: Date },
    verifiedAt: { type: Date },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    rejectionReason: { type: String, maxlength: 300 }
  },
  cancelReason: { type: String, maxlength: 300 },
  history: { type: [historySchema], default: [] }
}, { timestamps: true });

orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ 'payment.status': 1, status: 1 });
orderSchema.index({ 'payment.mpesaAttempts': 1 });
orderSchema.index({ 'payment.reference': 1 }, { sparse: true });

module.exports = mongoose.model('Order', orderSchema);
module.exports.ORDER_STATUSES = ORDER_STATUSES;
module.exports.PAYMENT_STATUSES = PAYMENT_STATUSES;
