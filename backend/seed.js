require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

const ADMIN = {
  firstName: 'Admin',
  lastName: 'EESA',
  username: 'admin',
  email: 'momaisa003@gmail.com',
  password: 'Admin@2024',
  role: 'admin',
  department: 'Electrical Engineering',
  membershipPaid: true,
  isActive: true,
};

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');

    const existing = await User.findOne({ $or: [{ email: ADMIN.email }, { username: ADMIN.username }] });
    if (existing) {
      console.log('Admin user already exists:', existing.email);
    } else {
      const admin = await User.create(ADMIN);
      console.log('Admin user created:', admin.email);
    }

    await mongoose.disconnect();
    console.log('Done');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err.message);
    process.exit(1);
  }
};

seed();
