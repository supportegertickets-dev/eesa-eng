const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const crypto = require('crypto');
const mongoose = require('mongoose');
const User = require('./models/User');
const { ROLES } = require('./utils/roles');
const { validatePassword } = require('./utils/password');

/**
 * Create the first administrator.
 *
 * The credentials come from the environment. The previous version hard-coded a
 * password in a file committed to the repository, which meant every deployment
 * of this codebase shipped with the same known admin login.
 */
const seed = async () => {
  const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase().trim();
  if (!email) {
    console.error('Set SEED_ADMIN_EMAIL (and optionally SEED_ADMIN_PASSWORD) before seeding.');
    process.exit(1);
  }

  // A generated password is safer than a default one, and it is printed once so
  // the operator can sign in and change it.
  const generated = !process.env.SEED_ADMIN_PASSWORD;
  const password = process.env.SEED_ADMIN_PASSWORD
    || `Eesa${crypto.randomBytes(9).toString('base64url')}1`;

  const check = validatePassword(password);
  if (!check.valid) {
    console.error(`SEED_ADMIN_PASSWORD rejected: ${check.message}`);
    process.exit(1);
  }

  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB.');

    const existing = await User.findOne({ email });
    if (existing) {
      // Never silently reset an existing account's password.
      if (existing.role !== ROLES.ADMIN) {
        existing.role = ROLES.ADMIN;
        await existing.save({ validateBeforeSave: false });
        console.log(`Promoted existing account ${email} to admin.`);
      } else {
        console.log(`Admin already exists: ${email} (no changes made).`);
      }
    } else {
      await User.create({
        firstName: process.env.SEED_ADMIN_FIRST_NAME || 'EESA',
        lastName: process.env.SEED_ADMIN_LAST_NAME || 'Administrator',
        username: process.env.SEED_ADMIN_USERNAME || 'admin',
        email,
        password,
        role: ROLES.ADMIN,
        department: 'Electrical Engineering',
        membershipPaid: true,
        isActive: true
      });

      console.log(`Admin created: ${email}`);
      if (generated) {
        console.log('----------------------------------------------------------');
        console.log(`Generated password: ${password}`);
        console.log('Save it now and change it after your first sign-in.');
        console.log('----------------------------------------------------------');
      }
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
};

seed();
