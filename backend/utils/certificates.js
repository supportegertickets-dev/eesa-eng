const Certificate = require('../models/Certificate');
const LeadershipTerm = require('../models/LeadershipTerm');
const Signatory = require('../models/Signatory');
const Payment = require('../models/Payment');
const User = require('../models/User');
const { OFFICE_ROLES, isOffice, labelFor } = require('./roles');
const { randomCode, isMembershipCurrent } = require('./membership');

const { MAX_SIGNATORIES_PER_TYPE } = Signatory;

/* ------------------------------------------------------------------ *
 * Numbers
 * ------------------------------------------------------------------ */

const CERTIFICATE_NUMBER_PATTERN = /^EESA-CERT-\d{2}-[A-HJ-NP-Z2-9]{6}$/;

/** "EESA-CERT-26-7K3M9Q": random, like member numbers, so they cannot be enumerated. */
const generateCertificateNumber = (now = new Date()) => `EESA-CERT-${String(now.getFullYear()).slice(-2)}-${randomCode()}`;

/* ------------------------------------------------------------------ *
 * Academic years
 * ------------------------------------------------------------------ */

// Kenya keeps East Africa Time all year, so the year turns over at midnight in Nairobi.
const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;
const ACADEMIC_YEAR_PATTERN = /^(\d{4})\/(\d{4})$/;

/** The month the academic year starts in, 1 to 12. September unless configured. */
const academicYearStartMonth = () => {
  const month = Number.parseInt(process.env.ACADEMIC_YEAR_START_MONTH, 10);
  return month >= 1 && month <= 12 ? month : 9;
};

/** The academic year a moment falls in, as "2026/2027". */
const academicYearOf = (date = new Date()) => {
  const local = new Date(new Date(date).getTime() + EAT_OFFSET_MS);
  const year = local.getUTCFullYear();
  const startYear = local.getUTCMonth() + 1 >= academicYearStartMonth() ? year : year - 1;
  return `${startYear}/${startYear + 1}`;
};

const isAcademicYearLabel = (value) => {
  const match = ACADEMIC_YEAR_PATTERN.exec(String(value || ''));
  return Boolean(match) && Number(match[2]) === Number(match[1]) + 1;
};

/**
 * The academic years a member can have a membership certificate for, newest
 * first: every year they had a payment verified in, and the current year while
 * their subscription is current (which covers members an administrator marked
 * as paid without recording a payment).
 */
const membershipYears = async (user, now = new Date()) => {
  const years = new Set();
  if (isMembershipCurrent(user, now)) years.add(academicYearOf(now));
  if (user.lastPaymentDate) years.add(academicYearOf(user.lastPaymentDate));

  const payments = await Payment.find({ user: user._id, status: 'verified' }).select('verifiedAt createdAt').lean();
  for (const payment of payments) years.add(academicYearOf(payment.verifiedAt || payment.createdAt));

  return [...years].sort().reverse();
};

/* ------------------------------------------------------------------ *
 * Issuing
 * ------------------------------------------------------------------ */

const fullName = (user) => [user.firstName, user.lastName].filter(Boolean).join(' ');

/** How a member is named on a certificate. "Other" is not worth printing as a department. */
const recipientFields = (user) => ({
  user: user._id,
  recipientName: fullName(user),
  regNumber: user.regNumber || '',
  department: user.department && user.department !== 'Other' ? user.department : ''
});

/** Who signs a kind of certificate, as copied onto each one issued. */
const signatoriesFor = async (type) => {
  const signatories = await Signatory.find({ certificateTypes: type })
    .sort({ order: 1, createdAt: 1 })
    .limit(MAX_SIGNATORIES_PER_TYPE)
    .lean();
  return signatories.map(({ name, title, signatureUrl }) => ({ name, title, signatureUrl }));
};

/**
 * Save a certificate under a fresh number. A clash on the number is retried;
 * a clash on the one-valid-certificate rules is left for the caller.
 */
const createCertificate = async (fields) => {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      return await Certificate.create({ ...fields, number: generateCertificateNumber() });
    } catch (error) {
      if (error.code !== 11000 || !error.keyPattern?.number) throw error;
    }
  }
  throw new Error('Could not allocate a certificate number.');
};

/** Everything needed to draw a certificate, and to list it. */
const certificateDetails = (certificate) => {
  const c = typeof certificate.toObject === 'function' ? certificate.toObject() : certificate;
  const person = (value) => (value && value.firstName ? { _id: value._id, name: fullName(value) } : undefined);
  return {
    _id: c._id,
    number: c.number,
    type: c.type,
    user: c.user && c.user._id ? c.user._id : c.user || null,
    recipientName: c.recipientName,
    regNumber: c.regNumber || '',
    department: c.department || '',
    term: c.term || null,
    office: c.office || '',
    startDate: c.startDate || null,
    endDate: c.endDate || null,
    academicYear: c.academicYear || '',
    signatories: c.signatories || [],
    issuedAt: c.issuedAt,
    issuedBy: person(c.issuedBy),
    status: c.status,
    revokedAt: c.revokedAt || null,
    revokedBy: person(c.revokedBy),
    revokeReason: c.revokeReason || ''
  };
};

/**
 * What the public verification page may show. A revoked certificate is
 * reported as such without describing the person it was issued to.
 */
const publicCertificate = (c) => {
  if (c.status !== 'valid') return { number: c.number, type: c.type, valid: false, status: 'revoked' };
  return {
    number: c.number,
    type: c.type,
    valid: true,
    status: 'valid',
    recipientName: c.recipientName,
    department: c.department || '',
    office: c.office || '',
    startDate: c.startDate || null,
    endDate: c.endDate || null,
    academicYear: c.academicYear || '',
    issuedAt: c.issuedAt
  };
};

/* ------------------------------------------------------------------ *
 * Leadership terms
 * ------------------------------------------------------------------ */

/**
 * Keep leadership terms in step with a role change: taking an office away ends
 * its open term today, and giving one opens a term from today. Failures are
 * logged, never thrown, because the role change itself is already saved.
 */
const recordRoleChange = async (user, previousRole, newRole, actor) => {
  if (previousRole === newRole) return;
  const now = new Date();
  try {
    if (isOffice(previousRole)) {
      await LeadershipTerm.updateMany({ user: user._id, role: previousRole, endDate: null }, { endDate: now });
    }
    if (isOffice(newRole) && !(await LeadershipTerm.exists({ user: user._id, role: newRole, endDate: null }))) {
      await LeadershipTerm.create({
        user: user._id,
        name: fullName(user),
        role: newRole,
        office: labelFor(newRole),
        startDate: now,
        source: 'recorded',
        createdBy: actor?._id
      });
    }
  } catch (error) {
    console.warn(`Could not record the leadership term for ${user._id}:`, error.message);
  }
};

/**
 * Open a term for every current office holder who has never had one for their
 * office: people who already held it before terms were recorded. Their start
 * date stays empty until an administrator enters it.
 */
const syncExistingTerms = async () => {
  const holders = await User.find({ role: { $in: OFFICE_ROLES }, isActive: true }).select('firstName lastName role').lean();
  if (!holders.length) return;

  const known = await LeadershipTerm.find({ user: { $in: holders.map((h) => h._id) }, role: { $ne: null } }).select('user role').lean();
  const held = new Set(known.map((term) => `${term.user}:${term.role}`));
  const missing = holders.filter((h) => !held.has(`${h._id}:${h.role}`));
  if (!missing.length) return;

  try {
    await LeadershipTerm.insertMany(
      missing.map((h) => ({ user: h._id, name: fullName(h), role: h.role, office: labelFor(h.role), source: 'existing' })),
      { ordered: false }
    );
  } catch (error) {
    // Two administrators loading the list at once both try; the unique index keeps one.
    if (error.code !== 11000) throw error;
  }
};

/** A term is served until its end date has passed. */
const termStatus = (term, now = new Date()) => (term.endDate && new Date(term.endDate) <= now ? 'ended' : 'serving');

module.exports = {
  CERTIFICATE_NUMBER_PATTERN,
  generateCertificateNumber,
  academicYearOf,
  academicYearStartMonth,
  isAcademicYearLabel,
  membershipYears,
  fullName,
  recipientFields,
  signatoriesFor,
  createCertificate,
  certificateDetails,
  publicCertificate,
  recordRoleChange,
  syncExistingTerms,
  termStatus
};
