const crypto = require('crypto');
const User = require('../models/User');
const Notification = require('../models/Notification');

// No 0/O or 1/I, so a number read off a printed card cannot be mistyped.
const NUMBER_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const NUMBER_LENGTH = 6;
const MEMBER_NUMBER_PATTERN = /^EESA-\d{2}-[A-HJ-NP-Z2-9]{6}$/;

/**
 * A query for members whose subscription is current, expired, or never paid.
 *
 * Verifying a payment sets `membershipPaid` and an expiry, but nothing clears
 * the flag when the expiry passes, so the expiry decides whether it is current.
 * Accounts marked paid with no expiry predate expiries and count as current.
 */
const membershipClause = (state, now = new Date()) => {
  if (state === 'current') return { membershipPaid: true, $or: [{ membershipExpiry: { $gt: now } }, { membershipExpiry: null }] };
  if (state === 'expired') return { membershipPaid: true, membershipExpiry: { $lte: now } };
  if (state === 'none') return { membershipPaid: { $ne: true } };
  return null;
};

/** Whether one member's subscription is current, by the same rule as membershipClause. */
const isMembershipCurrent = (user, now = new Date()) =>
  Boolean(user?.membershipPaid) && (!user.membershipExpiry || new Date(user.membershipExpiry) > now);

/** Random characters from an alphabet that cannot be misread off paper. */
const randomCode = (length = NUMBER_LENGTH) => {
  let code = '';
  for (let i = 0; i < length; i += 1) code += NUMBER_ALPHABET[crypto.randomInt(NUMBER_ALPHABET.length)];
  return code;
};

/** "EESA-26-7K3M9Q": the year it was issued and six random characters. */
const generateMemberNumber = (now = new Date()) => `EESA-${String(now.getFullYear()).slice(-2)}-${randomCode()}`;

const normalizeMemberNumber = (value) => String(value || '').trim().toUpperCase().replace(/\s+/g, '');

/**
 * Give a member a card number if they do not have one yet. Numbers are never
 * reissued, so a printed card stays valid through renewals.
 * @returns {Promise<string>} the member's number
 */
const ensureMemberNumber = async (user) => {
  if (user.memberNumber) return user.memberNumber;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const updated = await User.findOneAndUpdate(
        { _id: user._id, memberNumber: { $in: [null, ''] } },
        { memberNumber: generateMemberNumber() },
        { new: true }
      ).select('memberNumber');
      // Someone else's request may have assigned one first; use theirs.
      const number = updated?.memberNumber || (await User.findById(user._id).select('memberNumber').lean())?.memberNumber;
      user.memberNumber = number;
      return number;
    } catch (error) {
      if (error.code !== 11000) throw error;
      // A collision in a billion-number space: draw again.
    }
  }
  throw new Error('Could not allocate a member number.');
};

/** Everything printed on a member's card. */
const cardDetails = (user) => ({
  memberNumber: user.memberNumber,
  firstName: user.firstName,
  lastName: user.lastName,
  fullName: [user.firstName, user.lastName].filter(Boolean).join(' '),
  regNumber: user.regNumber || '',
  department: user.department,
  yearOfStudy: user.yearOfStudy,
  academicStatus: user.academicStatus,
  photo: user.passportPhoto,
  validUntil: user.membershipExpiry || null,
  memberSince: user.createdAt
});

/**
 * Tell specific accounts about something. Failures are logged, never thrown:
 * a missed notification must not undo the action that caused it.
 */
const notifyUsers = (userIds, { title, message, type, createdBy }) => {
  const targetUsers = [...new Set(userIds.map(String))];
  if (!targetUsers.length) return Promise.resolve();
  return Notification.create({ title, message, type, target: 'specific', targetUsers, createdBy })
    .catch((error) => console.warn(`Could not create notification "${title}":`, error.message));
};

const formatDay = (date) => new Date(date).toLocaleDateString('en-KE', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * Tell a member their membership is now paid, and what that means for their
 * card: ready to download if a photo is on file, otherwise the photo to add.
 */
const activatedMessage = (member) => [
  member.membershipExpiry ? `Your EESA membership is paid until ${formatDay(member.membershipExpiry)}.` : 'Your EESA membership is paid.',
  member.passportPhoto
    ? 'Your membership card is valid. Open Membership Card in the portal to download or print it.'
    : 'Upload a passport photo under Membership Card in the portal to get your membership card.'
].join(' ');

const membershipActivatedNotice = (member, createdBy) => notifyUsers([member._id], {
  title: 'Membership active',
  message: activatedMessage(member),
  type: 'membership',
  createdBy
});

/**
 * The same notice for many members at once. Members whose message is the same
 * share one notification, so marking a whole class paid writes a couple of
 * records rather than one per member.
 */
const membershipActivatedNotices = (members, createdBy) => {
  const groups = new Map();
  for (const member of members) {
    const message = activatedMessage(member);
    groups.set(message, [...(groups.get(message) || []), member._id]);
  }
  return Promise.all([...groups].map(([message, ids]) => notifyUsers(ids, { title: 'Membership active', message, type: 'membership', createdBy })));
};

const FEE_SETTINGS = { registration: 'REGISTRATION_FEE', renewal: 'RENEWAL_FEE' };

/**
 * The fee for a payment type in whole shillings, or null when it is not set.
 *
 * Payments recorded automatically (M-Pesa, or marking members paid together)
 * take the amount from here rather than from the browser.
 */
const membershipFee = (type) => {
  const fee = Number(process.env[FEE_SETTINGS[type]]);
  return Number.isInteger(fee) && fee > 0 ? fee : null;
};

module.exports = {
  membershipClause, isMembershipCurrent, randomCode, generateMemberNumber, normalizeMemberNumber, ensureMemberNumber, cardDetails, notifyUsers,
  membershipActivatedNotice, membershipActivatedNotices, membershipFee, FEE_SETTINGS, MEMBER_NUMBER_PATTERN
};
