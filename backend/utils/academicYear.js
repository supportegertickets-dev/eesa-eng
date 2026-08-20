const User = require('../models/User');

const ACADEMIC_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const ROLLOVER_CHECK_MS = 60 * 60 * 1000;
let lastRolloverCheck = 0;

const advanceAcademicYears = async () => {
  if (Date.now() - lastRolloverCheck < ROLLOVER_CHECK_MS) return;
  lastRolloverCheck = Date.now();
  const cutoff = new Date(Date.now() - ACADEMIC_YEAR_MS);
  const dueUsers = await User.find({
    academicStatus: 'student',
    $or: [
      { academicYearStartedAt: { $lte: cutoff } },
      { academicYearStartedAt: { $exists: false }, createdAt: { $lte: cutoff } }
    ]
  });

  for (const user of dueUsers) {
    if (user.yearOfStudy >= 5) {
      user.academicStatus = 'alumni';
    } else {
      user.yearOfStudy += 1;
      user.academicYearStartedAt = new Date();
    }
    await user.save({ validateBeforeSave: false });
  }

  if (dueUsers.length > 0) {
    console.log(`Academic year rollover processed for ${dueUsers.length} user(s)`);
  }
};

module.exports = { advanceAcademicYears };