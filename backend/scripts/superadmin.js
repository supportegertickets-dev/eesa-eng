const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('../models/User');
const { ROLES, ASSIGNABLE_ROLES, labelFor } = require('../utils/roles');
const { validatePassword } = require('../utils/password');
const { recordRoleChange } = require('../utils/certificates');
const { recordAudit, userTarget, nameOf } = require('../utils/audit');

/**
 * Manage superadmin accounts. This is the only way to grant the role: the API
 * refuses to, so a stolen admin session can never escalate to it.
 *
 *   npm run superadmin -- grant <email> [--first-name Jane --last-name Doe]
 *   npm run superadmin -- revoke <email> [--role admin]
 *   npm run superadmin -- reset-password <email>
 *   npm run superadmin -- list
 *
 * It uses MONGODB_URI from backend/.env, so run it from a machine that holds
 * the production connection string. A new password comes from
 * SUPERADMIN_PASSWORD, or is generated and printed once.
 */

const USAGE = `Usage:
  npm run superadmin -- grant <email> [--first-name <name>] [--last-name <name>]
      Make an account superadmin, creating it if it does not exist.
  npm run superadmin -- revoke <email> [--role <role>]
      Take the role away. The account becomes a member unless --role says otherwise.
  npm run superadmin -- reset-password <email>
      Give a superadmin a new password and lift any sign-in lock.
  npm run superadmin -- list
      Show every superadmin.`;

const SCRIPT = 'Server script';

const fail = (message) => {
  console.error(message);
  process.exitCode = 1;
};

const parseArgs = (argv) => {
  const [command, ...rest] = argv;
  const positional = [];
  const flags = {};
  for (let i = 0; i < rest.length; i += 1) {
    if (rest[i].startsWith('--')) {
      flags[rest[i].slice(2)] = rest[i + 1];
      i += 1;
    } else {
      positional.push(rest[i]);
    }
  }
  return { command, email: (positional[0] || '').toLowerCase().trim(), flags };
};

/** SUPERADMIN_PASSWORD if set and acceptable, otherwise a generated one. */
const choosePassword = () => {
  const given = process.env.SUPERADMIN_PASSWORD;
  const password = given || `Eesa${crypto.randomBytes(12).toString('base64url')}7`;
  const check = validatePassword(password);
  if (!check.valid) throw new Error(`SUPERADMIN_PASSWORD rejected: ${check.message}`);
  return { password, generated: !given };
};

const printPassword = (password) => {
  console.log('----------------------------------------------------------');
  console.log(`Password: ${password}`);
  console.log('Save it now. It is not shown again. Change it after signing in.');
  console.log('----------------------------------------------------------');
};

const grant = async (email, flags) => {
  const existing = await User.findOne({ email });

  if (existing) {
    if (existing.role === ROLES.SUPERADMIN && existing.isActive) {
      console.log(`${email} is already a superadmin. Nothing changed.`);
      return;
    }
    const previousRole = existing.role;
    existing.role = ROLES.SUPERADMIN;
    existing.isActive = true;
    existing.pendingApproval = undefined;
    await existing.save({ validateBeforeSave: false });
    // Ends any office they held, as a role change on the website would.
    await recordRoleChange(existing, previousRole, ROLES.SUPERADMIN, null);
    await recordAudit(null, {
      action: 'security.superadmin_granted',
      summary: `${nameOf(existing)} was made superadmin from the server (previously ${labelFor(previousRole)}).`,
      target: userTarget(existing),
      actor: null,
      actorName: SCRIPT,
      details: { previousRole }
    });
    console.log(`${email} is now a superadmin (was ${labelFor(previousRole)}). Their password is unchanged.`);
    return;
  }

  const { password, generated } = choosePassword();
  const usernameTaken = await User.exists({ username: 'superadmin' });
  const user = await User.create({
    firstName: flags['first-name'] || 'Platform',
    lastName: flags['last-name'] || 'Superadmin',
    username: usernameTaken ? undefined : 'superadmin',
    email,
    password,
    role: ROLES.SUPERADMIN,
    isActive: true
  });
  await recordAudit(null, {
    action: 'security.superadmin_granted',
    summary: `A superadmin account was created from the server for ${nameOf(user)}.`,
    target: userTarget(user),
    actor: null,
    actorName: SCRIPT
  });
  console.log(`Superadmin created: ${email}${user.username ? ` (username ${user.username})` : ''}`);
  if (generated) printPassword(password);
};

const revoke = async (email, flags) => {
  const role = flags.role || ROLES.MEMBER;
  if (!ASSIGNABLE_ROLES.includes(role)) {
    return fail(`--role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
  }
  const user = await User.findOne({ email });
  if (!user) return fail(`No account uses ${email}.`);
  if (user.role !== ROLES.SUPERADMIN) return fail(`${email} is not a superadmin (they are ${labelFor(user.role)}).`);

  user.role = role;
  await user.save({ validateBeforeSave: false });
  await recordRoleChange(user, ROLES.SUPERADMIN, role, null);
  await recordAudit(null, {
    action: 'security.superadmin_revoked',
    summary: `${nameOf(user)}'s superadmin role was taken away from the server; they are now ${labelFor(role)}.`,
    target: userTarget(user),
    actor: null,
    actorName: SCRIPT,
    details: { newRole: role }
  });
  console.log(`${email} is no longer a superadmin. They are now ${labelFor(role)}.`);

  if (!(await User.exists({ role: ROLES.SUPERADMIN, isActive: true }))) {
    console.warn('Warning: no active superadmin is left. Maintenance mode and the other platform controls cannot be used until you grant one.');
  }
  return undefined;
};

const resetPassword = async (email) => {
  const user = await User.findOne({ email }).select('+password +failedLoginAttempts +lockedUntil');
  if (!user) return fail(`No account uses ${email}.`);
  if (user.role !== ROLES.SUPERADMIN) {
    return fail(`${email} is not a superadmin. Other accounts reset their password from the sign-in page.`);
  }

  const { password, generated } = choosePassword();
  user.password = password;
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  // Saving a new password also signs out every session on the old one.
  await user.save();
  await recordAudit(null, {
    action: 'security.superadmin_password_reset',
    summary: `${nameOf(user)}'s superadmin password was reset from the server.`,
    target: userTarget(user),
    actor: null,
    actorName: SCRIPT
  });
  console.log(`Password reset for ${email}. Any sign-in lock is lifted and their other sessions are signed out.`);
  if (generated) printPassword(password);
  return undefined;
};

const list = async () => {
  const superadmins = await User.find({ role: ROLES.SUPERADMIN }).select('firstName lastName email isActive lastLoginAt').lean();
  if (!superadmins.length) {
    console.log('There is no superadmin. Create one with: npm run superadmin -- grant <email>');
    return;
  }
  superadmins.forEach((user) => {
    const lastSignIn = user.lastLoginAt ? user.lastLoginAt.toISOString() : 'never';
    console.log(`${nameOf(user)} <${user.email}>${user.isActive ? '' : ' [deactivated]'}  last sign-in: ${lastSignIn}`);
  });
};

const main = async () => {
  const { command, email, flags } = parseArgs(process.argv.slice(2));
  const needsEmail = ['grant', 'revoke', 'reset-password'].includes(command);

  if (!command || !(needsEmail || command === 'list')) {
    console.log(USAGE);
    process.exitCode = command ? 1 : 0;
    return;
  }
  if (needsEmail && !/^\S+@\S+\.\S+$/.test(email)) {
    fail(`Give the account's email address.\n\n${USAGE}`);
    return;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    fail('MONGODB_URI is not set. Put it in backend/.env or the environment.');
    return;
  }

  await mongoose.connect(uri);
  try {
    if (command === 'grant') await grant(email, flags);
    if (command === 'revoke') await revoke(email, flags);
    if (command === 'reset-password') await resetPassword(email);
    if (command === 'list') await list();
  } finally {
    await mongoose.disconnect();
  }
};

main().catch((error) => {
  console.error('Failed:', error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
