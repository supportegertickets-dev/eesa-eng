const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const User = require('../models/User');
const Notification = require('../models/Notification');
const { POWER_ROLES, ROLES, labelFor } = require('./roles');
const { notifyUsers } = require('./membership');

/**
 * Sign-up approval and the removal of junk accounts.
 */

const APPLICANT_NOTICE_TITLE = 'New member awaiting approval';

/**
 * Tell the administrators and the chairperson that a sign-up is waiting. The
 * notice is from the applicant and is removed with their account if they are
 * turned away.
 */
const announceApplicant = async (applicant) => {
  const approvers = await User.find({ role: { $in: POWER_ROLES }, isActive: true }).select('_id').lean();
  await notifyUsers(approvers.map((approver) => approver._id), {
    title: APPLICANT_NOTICE_TITLE,
    message: `${applicant.firstName} ${applicant.lastName} (${applicant.regNumber}, ${applicant.department}) has registered. `
      + 'Approve or delete the account under Manage members.',
    type: 'membership',
    createdBy: applicant._id
  });
};

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

// How each collection reads in "Their account has …, so it cannot be deleted".
const HISTORY_LABELS = {
  Album: 'gallery albums',
  AuditLog: 'audit log entries',
  Certificate: 'certificates',
  Constitution: 'constitution edits',
  Election: 'election records',
  Event: 'event records',
  LeadershipTerm: 'leadership terms',
  News: 'news articles',
  Order: 'shop orders',
  PassportPhoto: 'passport photos',
  Payment: 'payments',
  Photo: 'gallery photos',
  PlatformSetting: 'platform settings changes',
  Product: 'shop products',
  Project: 'projects',
  Resource: 'library uploads',
  Signatory: 'certificate signatory records',
  Sponsor: 'sponsor records',
  Unit: 'library units',
  User: 'approvals of other members',
  Vote: 'votes'
};

let modelsLoaded = false;

/**
 * Every model, so the history check covers collections no route has loaded
 * yet, and any collection added later without anyone remembering this file.
 */
const allModels = () => {
  if (!modelsLoaded) {
    const dir = path.join(__dirname, '..', 'models');
    fs.readdirSync(dir).filter((file) => file.endsWith('.js')).forEach((file) => require(path.join(dir, file)));
    modelsLoaded = true;
  }
  return mongoose.modelNames().map((name) => mongoose.model(name));
};

/** The paths in a schema, nested ones included, that hold a reference to a member. */
const memberPaths = (schema, prefix = '') => {
  const paths = [];
  schema.eachPath((name, type) => {
    const ref = type.options?.ref || type.caster?.options?.ref || type.embeddedSchemaType?.options?.ref;
    if (ref === 'User') paths.push(prefix + name);
    if (type.schema) paths.push(...memberPaths(type.schema, `${prefix}${name}.`));
  });
  return paths;
};

/**
 * Everything that makes an account worth keeping, as short descriptions, or
 * an empty list for an account that can go without a trace. Notifications
 * are not history: they are cleaned up with the account, except ones the
 * member sent as an office holder.
 */
const accountHistory = async (user) => {
  const id = user._id;
  const reasons = [];
  if (user.role && user.role !== ROLES.MEMBER) reasons.push(`the ${labelFor(user.role)} role`);
  if (user.membershipPaid || user.memberNumber) reasons.push('a membership');

  const found = await Promise.all(allModels().map(async (Model) => {
    if (Model.modelName === 'Notification') {
      return (await Notification.exists({ createdBy: id, title: { $ne: APPLICANT_NOTICE_TITLE } })) ? 'sent notifications' : null;
    }
    const paths = memberPaths(Model.schema);
    if (!paths.length) return null;
    const filter = { $or: paths.map((p) => ({ [p]: id })) };
    if (Model.modelName === 'User') filter._id = { $ne: id };
    return (await Model.exists(filter)) ? (HISTORY_LABELS[Model.modelName] || Model.collection.name) : null;
  }));

  return [...reasons, ...found.filter(Boolean)];
};

/**
 * Remove an account with no history, and the notifications that only
 * concerned it. The caller checks accountHistory first.
 */
const deleteAccount = async (user) => {
  const id = user._id;
  await Notification.deleteMany({ $or: [{ createdBy: id }, { target: 'specific', targetUsers: [id] }] });
  await Notification.updateMany({ $or: [{ targetUsers: id }, { readBy: id }] }, { $pull: { targetUsers: id, readBy: id } });
  await User.deleteOne({ _id: id });
};

module.exports = { APPLICANT_NOTICE_TITLE, announceApplicant, accountHistory, deleteAccount };
