const HubPayment = require('../models/HubPayment');
const Payment = require('../models/Payment');
const Order = require('../models/Order');
const User = require('../models/User');
const { membershipActivatedNotice, notifyUsers } = require('./membership');
const hub = require('./isaTechHub');
const { addHistory } = require('./merchandise');

const unwrapPayment = (payload) => payload?.payment || payload?.data?.payment || payload;
const providerStatus = (value) => ({ paid: 'paid', pending: 'pending', failed: 'failed', disputed: 'disputed' })[String(value || '').toLowerCase()];

const saveProviderPayment = async (attempt, payment) => {
  const normalized = unwrapPayment(payment);
  if (!normalized || !normalized.id) return null;
  attempt.providerPaymentId = String(normalized.id);
  if (normalized.phone) attempt.phoneMasked = hub.maskPhone(normalized.phone);
  await attempt.save();
  if (attempt.membershipPayment) {
    await Payment.updateOne({ _id: attempt.membershipPayment }, { hubProviderPaymentId: attempt.providerPaymentId });
  }
  if (attempt.order) {
    await Order.updateOne({ _id: attempt.order }, { 'payment.hubProviderPaymentId': attempt.providerPaymentId });
  }
  return normalized;
};

const applyHubPayment = async (attempt, payload) => {
  const payment = unwrapPayment(payload);
  if (!payment) return { ignored: true, reason: 'missing_payment' };
  if (payment.id && attempt.providerPaymentId && String(payment.id) !== String(attempt.providerPaymentId)) {
    return { ignored: true, reason: 'payment_id_mismatch' };
  }
  if (payment.id && !attempt.providerPaymentId) await saveProviderPayment(attempt, payment);
  const status = providerStatus(payment.status);
  if (!status || status === 'pending') {
    const pendingClaim = await HubPayment.updateOne({ _id: attempt._id, status: { $nin: ['verified', 'disputed'] } }, {
      status: 'pending', lastCheckedAt: new Date()
    });
    if (pendingClaim.modifiedCount !== 1) {
      const current = await HubPayment.findById(attempt._id).select('status');
      return { applied: true, status: current?.status || attempt.status, ignored: true };
    }
    return { applied: true, status: 'pending' };
  }
  if (status === 'disputed') {
    if (attempt.status !== 'verified') {
      const resultMessage = String(payment.message || 'Payment disputed; held for review').slice(0, 300);
      const claim = await HubPayment.updateOne({ _id: attempt._id, status: { $nin: ['verified', 'disputed'] } }, {
        status: 'disputed', resultCode: payment.resultCode, resultMessage, lastCheckedAt: new Date()
      });
      if (claim.modifiedCount !== 1) return { applied: true, status: attempt.status, ignored: true };
      if (attempt.membershipPayment) await Payment.updateOne({ _id: attempt.membershipPayment, status: { $ne: 'verified' } }, { status: 'disputed', rejectionReason: resultMessage });
      if (attempt.order) await Order.updateOne({ _id: attempt.order, 'payment.status': { $ne: 'verified' } }, { 'payment.status': 'disputed', 'payment.rejectionReason': resultMessage });
    }
    return { applied: true, status: 'disputed' };
  }
  if (attempt.status === 'verified' && attempt.fulfilledAt) return { applied: true, status: 'verified', duplicate: true };

  const now = new Date();
  const paidAmount = Number(payment.paidAmount);
  if (status === 'paid' && (!Number.isFinite(paidAmount) || paidAmount !== attempt.amount)) {
    const resultMessage = `Paid amount mismatch or missing amount; expected ${attempt.amount}.`;
    const claim = await HubPayment.updateOne({ _id: attempt._id, status: { $nin: ['verified', 'disputed'] } }, {
      status: 'disputed', paidAmount: Number.isFinite(paidAmount) ? paidAmount : undefined,
      receipt: payment.receipt || '', resultCode: payment.resultCode,
      resultMessage, verifiedAt: now, lastCheckedAt: now
    });
    if (claim.modifiedCount !== 1) return { applied: true, status: attempt.status, ignored: true };
    if (attempt.membershipPayment) {
      await Payment.updateOne({ _id: attempt.membershipPayment, status: { $ne: 'verified' } }, {
        status: 'disputed', rejectionReason: resultMessage
      });
    }
    if (attempt.order) {
      await Order.updateOne({ _id: attempt.order, 'payment.status': { $ne: 'verified' } }, {
        'payment.status': 'disputed', 'payment.rejectionReason': resultMessage
      });
    }
    return { applied: true, status: 'disputed', amountMismatch: true };
  }

  if (status === 'failed') {
    const resultMessage = String(payment.message || 'Payment failed').slice(0, 300);
    const failed = await HubPayment.updateOne({ _id: attempt._id, status: { $nin: ['verified', 'disputed'] } }, {
      status: 'rejected', lastCheckedAt: now, resultCode: payment.resultCode, resultMessage
    });
    if (failed.modifiedCount !== 1) return { applied: true, status: attempt.status, ignored: true };
    if (attempt.membershipPayment) {
      await Payment.updateOne({ _id: attempt.membershipPayment, status: 'pending' }, {
        status: 'rejected', rejectionReason: resultMessage
      });
    }
    if (attempt.order) {
      await Order.updateOne({ _id: attempt.order, 'payment.status': 'pending', 'payment.hubPayment': attempt._id }, {
        'payment.status': 'rejected', 'payment.rejectionReason': resultMessage
      });
    }
    return { applied: true, status: 'rejected' };
  }

  // A verified paid result is authoritative over any earlier failure.
  const paidClaim = await HubPayment.updateOne({ _id: attempt._id, status: { $nin: ['verified', 'disputed'] } }, {
    status: 'verified', paidAmount, receipt: payment.receipt || '', resultCode: payment.resultCode,
    resultMessage: String(payment.message || '').slice(0, 300), verifiedAt: now, lastCheckedAt: now
  });
  if (paidClaim.modifiedCount !== 1) {
    const current = await HubPayment.findById(attempt._id);
    if (current?.status === 'disputed') return { applied: true, status: 'disputed', held: true };
    if (current?.status === 'verified' && current.fulfilledAt) return { applied: true, status: 'verified', duplicate: true };
  }
  attempt.status = 'verified';
  attempt.paidAmount = paidAmount;
  attempt.receipt = payment.receipt || '';
  attempt.resultCode = payment.resultCode;
  attempt.resultMessage = String(payment.message || '').slice(0, 300);
  attempt.verifiedAt = attempt.verifiedAt || now;
  attempt.lastCheckedAt = now;

  if (attempt.membershipPayment) {
    const claimed = await Payment.findOneAndUpdate(
      { _id: attempt.membershipPayment, status: { $ne: 'verified' } },
      { $set: { status: 'verified', reference: payment.receipt || attempt.reference, verifiedAt: now, mpesaReceiptNumber: payment.receipt || undefined } },
      { new: true }
    );
    if (claimed) {
      const member = await User.findByIdAndUpdate(attempt.user, {
        membershipPaid: true,
        membershipExpiry: new Date(now.getTime() + 180 * 24 * 60 * 60 * 1000),
        lastPaymentDate: now
      }, { new: true });
      if (member) await membershipActivatedNotice(member, member._id);
    }
  }

  if (attempt.order) {
    const order = await Order.findById(attempt.order);
    if (order && order.payment.status !== 'verified' && order.status === 'awaiting_payment') {
      // Atomic claim ensures webhook, manual verification and reconciliation
      // cannot transition/notify the same order more than once.
      const claimed = await Order.updateOne({
        _id: order._id,
        status: 'awaiting_payment',
        'payment.status': { $ne: 'verified' },
        'payment.hubPayment': attempt._id
      }, {
        $set: {
          'payment.method': 'isa_hub',
          'payment.status': 'verified',
          'payment.reference': payment.receipt || attempt.reference,
          'payment.hubProviderPaymentId': attempt.providerPaymentId,
          'payment.verifiedAt': now,
          'payment.rejectionReason': undefined,
          status: 'paid'
        },
        $push: { history: { status: 'paid', at: now, note: payment.receipt ? `ISA Tech Hub receipt ${payment.receipt}` : 'Paid through ISA Tech Hub' } }
      });
      if (claimed.modifiedCount === 1) {
        await notifyUsers([order.user], {
          title: `Payment confirmed for ${order.orderNumber}`,
          message: `We have confirmed your payment of KES ${order.total.toLocaleString('en-KE')} for order ${order.orderNumber}. We will let you know when it is ready to collect.`,
          type: 'merchandise',
          createdBy: order.user
        });
      }
    } else if (order && order.status === 'cancelled' && order.payment.status !== 'verified') {
      await Order.updateOne({ _id: order._id, status: 'cancelled', 'payment.status': { $ne: 'verified' } }, {
        $set: {
          'payment.method': 'isa_hub', 'payment.status': 'verified',
          'payment.reference': payment.receipt || attempt.reference,
          'payment.hubProviderPaymentId': attempt.providerPaymentId, 'payment.verifiedAt': now
        },
        $push: { history: { status: 'cancelled', at: now, note: 'ISA Tech Hub payment arrived after cancellation; refund or manual review required.' } }
      });
    }
  }
  attempt.fulfilledAt = attempt.fulfilledAt || now;
  await attempt.save();
  return { applied: true, status: 'verified' };
};

const findAttempt = async (payment, metadata = {}) => {
  const localId = metadata.hubPaymentAttemptId;
  if (localId && /^[a-f\d]{24}$/i.test(String(localId))) {
    const found = await HubPayment.findById(localId);
    if (found) return found;
  }
  const membershipId = metadata.localPaymentId || metadata.paymentId;
  if (membershipId && /^[a-f\d]{24}$/i.test(String(membershipId))) {
    const found = await HubPayment.findOne({ membershipPayment: membershipId });
    if (found) return found;
  }
  if (metadata.orderId && /^[a-f\d]{24}$/i.test(String(metadata.orderId))) {
    const found = await HubPayment.findOne({ order: metadata.orderId }).sort({ createdAt: -1 });
    if (found) return found;
  }
  if (payment?.id) return HubPayment.findOne({ providerPaymentId: String(payment.id) });
  if (payment?.reference) return HubPayment.findOne({ reference: String(payment.reference) });
  return null;
};

const recoverProviderPayment = async (attempt) => {
  if (attempt.providerPaymentId) {
    const response = await hub.request(`/v1/payments/${encodeURIComponent(attempt.providerPaymentId)}`);
    return unwrapPayment(response);
  }
  const response = await hub.request(`/v1/payments?reference=${encodeURIComponent(attempt.reference)}&limit=20`);
  const candidates = response?.payments || response?.data?.payments || response?.data || [];
  const list = Array.isArray(candidates) ? candidates : [];
  const match = list.find((item) => {
    const metadata = item?.metadata || {};
    return String(metadata.hubPaymentAttemptId || metadata.localPaymentId || '') === String(attempt._id)
      || String(item.reference || '') === attempt.reference;
  });
  return match || null;
};

const verifyAttempt = async (attempt, { force = false } = {}) => {
  const now = new Date();
  const cooldownMs = Math.max(1000, Number(process.env.ISA_HUB_STATUS_CHECK_COOLDOWN_MS) || 8000);
  const lockUntil = new Date(now.getTime() + 30000);
  let claimed = attempt;

  if (!force) {
    claimed = await HubPayment.findOneAndUpdate({
      _id: attempt._id,
      status: { $in: ['pending', 'rejected'] },
      $and: [
        { $or: [{ lastCheckedAt: null }, { lastCheckedAt: { $lt: new Date(now.getTime() - cooldownMs) } }] },
        { $or: [{ reconciliationLockUntil: null }, { reconciliationLockUntil: { $lt: now } }] }
      ]
    }, { $set: { reconciliationLockUntil: lockUntil, lastCheckedAt: now } }, { new: true });

    if (!claimed) {
      const current = await HubPayment.findById(attempt._id).select('status lastCheckedAt');
      return { applied: true, status: current?.status || attempt.status, checked: false };
    }
  }

  try {
    const remote = await recoverProviderPayment(claimed);
    return remote
      ? { ...(await applyHubPayment(claimed, remote)), checked: true }
      : { applied: true, status: claimed.status, found: false, checked: true };
  } finally {
    if (!force) {
      await HubPayment.updateOne({ _id: claimed._id, reconciliationLockUntil: lockUntil }, {
        $unset: { reconciliationLockUntil: 1 }
      });
    }
  }
};

const reconcilePendingPayments = async ({ limit = 20 } = {}) => {
  const now = new Date();
  const attempts = await HubPayment.find({
    status: { $in: ['pending', 'rejected'] },
    initiationStatus: { $in: ['accepted', 'uncertain'] },
    createdAt: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
    $or: [{ reconciliationLockUntil: null }, { reconciliationLockUntil: { $lt: now } }]
  }).sort({ updatedAt: 1 }).limit(limit).select('_id').lean();
  let checked = 0;
  for (const { _id } of attempts) {
    try {
      const attempt = await HubPayment.findById(_id);
      if (!attempt) continue;
      const result = await verifyAttempt(attempt);
      if (result.checked) checked += 1;
    } catch (error) {
      console.error('ISA Tech Hub reconciliation failed:', error.message);
    }
  }
  return checked;
};

module.exports = { applyHubPayment, findAttempt, saveProviderPayment, verifyAttempt, reconcilePendingPayments, unwrapPayment, providerStatus };
