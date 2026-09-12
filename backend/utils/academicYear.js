const User = require('../models/User');

const ACADEMIC_YEAR_MS = 365.25 * 24 * 60 * 60 * 1000;
const ROLLOVER_CHECK_MS = 60 * 60 * 1000;
const FINAL_YEAR = 5;

let lastRolloverCheck = 0;
let inFlight = null;

/**
 * Advance every student's year of study once their current year has elapsed,
 * graduating them to alumni after the final year.
 *
 * Called from the auth middleware on every authenticated request, so it is
 * throttled to once an hour and de-duplicated across concurrent requests.
 */
const advanceAcademicYears = async ({ force = false } = {}) => {
  if (!force && Date.now() - lastRolloverCheck < ROLLOVER_CHECK_MS) return 0;

  // Concurrent requests arriving in the same tick would otherwise each launch
  // their own pass over the collection.
  if (inFlight) return inFlight;

  lastRolloverCheck = Date.now();

  inFlight = (async () => {
    const now = Date.now();
    const cutoff = new Date(now - ACADEMIC_YEAR_MS);

    const dueUsers = await User.find({
      academicStatus: 'student',
      $or: [
        { academicYearStartedAt: { $lte: cutoff } },
        { academicYearStartedAt: { $exists: false }, createdAt: { $lte: cutoff } }
      ]
    }).select('yearOfStudy academicStatus academicYearStartedAt createdAt');

    let updated = 0;

    for (const user of dueUsers) {
      const startedAt = (user.academicYearStartedAt || user.createdAt || new Date()).getTime();

      // A member who has not signed in for several years must catch up by that
      // many years, not by one. The previous single-step version reset the clock
      // each pass, so a three-year absence advanced only one year.
      const elapsedYears = Math.floor((now - startedAt) / ACADEMIC_YEAR_MS);
      if (elapsedYears < 1) continue;

      const targetYear = user.yearOfStudy + elapsedYears;

      if (targetYear > FINAL_YEAR) {
        user.academicStatus = 'alumni';
        user.yearOfStudy = FINAL_YEAR;
      } else {
        user.yearOfStudy = targetYear;
        // Carry the remainder forward so the anniversary does not drift later
        // every year.
        user.academicYearStartedAt = new Date(startedAt + elapsedYears * ACADEMIC_YEAR_MS);
      }

      await user.save({ validateBeforeSave: false });
      updated += 1;
    }

    if (updated > 0) {
      console.log(`Academic year rollover processed for ${updated} member(s).`);
    }
    return updated;
  })();

  try {
    return await inFlight;
  } finally {
    inFlight = null;
  }
};

module.exports = { advanceAcademicYears, ACADEMIC_YEAR_MS, FINAL_YEAR };
