const PlatformSetting = require('../models/PlatformSetting');
const { featureByKey } = require('./platformFeatures');
const { ApiError } = require('./asyncHandler');

/**
 * The platform's kill switch: maintenance mode, read-only mode, feature
 * switches and scheduled maintenance, read from the single PlatformSetting
 * document.
 *
 * Every request consults this, so the document is cached briefly. A change
 * made through the API refreshes this process's cache at once; another
 * process (if the API is ever scaled out) catches up within CACHE_MS.
 */

const CACHE_MS = 5000;

const DEFAULT_MESSAGES = {
  maintenance: 'EESA is down for maintenance. We will be back shortly.',
  read_only: 'EESA is in read-only mode while we carry out maintenance. You can look around, but changes are paused.'
};

const DEFAULTS = Object.freeze({
  mode: 'normal',
  message: '',
  expectedBackAt: null,
  disabledFeatures: [],
  window: null,
  announcement: null,
  sessionEpoch: 0,
  sessionsRevokedAt: null,
  updatedBy: null,
  updatedAt: null
});

const normalize = (doc) => (doc ? {
  mode: doc.mode || 'normal',
  message: doc.message || '',
  expectedBackAt: doc.expectedBackAt || null,
  disabledFeatures: (doc.disabledFeatures || []).filter((key) => featureByKey.has(key)),
  window: doc.window?.startsAt ? { startsAt: doc.window.startsAt, endsAt: doc.window.endsAt || null, message: doc.window.message || '' } : null,
  announcement: doc.announcement?.message
    ? { message: doc.announcement.message, tone: doc.announcement.tone || 'info', expiresAt: doc.announcement.expiresAt || null }
    : null,
  sessionEpoch: doc.sessionEpoch || 0,
  sessionsRevokedAt: doc.sessionsRevokedAt || null,
  updatedBy: doc.updatedBy || null,
  updatedAt: doc.updatedAt || null
} : { ...DEFAULTS });

let cached = null;
let cachedAt = 0;
let inFlight = null;

/**
 * The current settings. If the database cannot be read, the last known
 * settings stand, so a blip cannot silently lift maintenance mode.
 */
const getPlatformSettings = async () => {
  if (cached && Date.now() - cachedAt < CACHE_MS) return cached;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const doc = await PlatformSetting.findOne({ key: 'platform' }).lean();
      cached = normalize(doc);
      cachedAt = Date.now();
      return cached;
    } catch (error) {
      console.error('Platform settings could not be read:', error.message);
      return cached || { ...DEFAULTS };
    } finally {
      inFlight = null;
    }
  })();
  return inFlight;
};

/** Apply a change and refresh the cache with the result. */
const updatePlatformSettings = async (update, actor) => {
  // No setDefaultsOnInsert: it would clash with $inc on sessionEpoch when the
  // document is first created, and normalize() fills in anything missing.
  const doc = await PlatformSetting.findOneAndUpdate(
    { key: 'platform' },
    { ...update, $set: { ...(update.$set || {}), ...(actor && { updatedBy: actor._id }) } },
    { upsert: true, new: true, runValidators: true }
  ).lean();
  cached = normalize(doc);
  cachedAt = Date.now();
  return cached;
};

/** Forget the cached settings, for tests that change the document directly. */
const invalidatePlatformCache = () => {
  cached = null;
  cachedAt = 0;
};

/* ------------------------------------------------------------------ *
 * The server override
 * ------------------------------------------------------------------ */

const OVERRIDE_VALUES = {
  on: 'maintenance',
  maintenance: 'maintenance',
  read_only: 'read_only',
  'read-only': 'read_only',
  readonly: 'read_only',
  off: 'normal',
  normal: 'normal'
};

let warnedAbout = null;

/**
 * MAINTENANCE_OVERRIDE, set on the host, beats the database: the way back in
 * if the superadmin is locked out, and the way to lock the platform down if
 * the database itself cannot be trusted. Read on every call so a restart with
 * a new value takes effect at once.
 */
const readOverride = () => {
  const raw = (process.env.MAINTENANCE_OVERRIDE || '').trim().toLowerCase();
  if (!raw) return null;
  const mode = OVERRIDE_VALUES[raw];
  if (!mode && warnedAbout !== raw) {
    warnedAbout = raw;
    console.warn(`MAINTENANCE_OVERRIDE="${raw}" is not recognised. Use on, read_only or off.`);
  }
  return mode || null;
};

/* ------------------------------------------------------------------ *
 * The state in force
 * ------------------------------------------------------------------ */

const windowActive = (window, now) => Boolean(window?.startsAt
  && new Date(window.startsAt) <= now
  && (!window.endsAt || now < new Date(window.endsAt)));

const windowUpcoming = (window, now) => Boolean(window?.startsAt && new Date(window.startsAt) > now);

/**
 * What is in force right now: the override, then scheduled maintenance, then
 * the mode the superadmin chose.
 * @returns {{ mode: string, source: string, message: string, expectedBackAt: Date|null }}
 */
const effectiveState = (settings, now = new Date()) => {
  const override = readOverride();
  if (override) {
    return { mode: override, source: 'override', message: override === 'normal' ? '' : settings.message || DEFAULT_MESSAGES[override], expectedBackAt: null };
  }
  if (settings.mode !== 'maintenance' && windowActive(settings.window, now)) {
    return {
      mode: 'maintenance',
      source: 'scheduled',
      message: settings.window.message || settings.message || DEFAULT_MESSAGES.maintenance,
      expectedBackAt: settings.window.endsAt
    };
  }
  if (settings.mode === 'normal') return { mode: 'normal', source: 'manual', message: '', expectedBackAt: null };
  return {
    mode: settings.mode,
    source: 'manual',
    message: settings.message || DEFAULT_MESSAGES[settings.mode],
    expectedBackAt: settings.expectedBackAt
  };
};

const isFeatureDisabled = (settings, key) => settings.disabledFeatures.includes(key);

/** The switched-off features with the words to show for each. */
const disabledFeatureList = (settings) => settings.disabledFeatures
  .map((key) => featureByKey.get(key))
  .filter(Boolean)
  .map(({ key, label, message }) => ({ key, label, message }));

const liveAnnouncement = (settings, now) => {
  const { announcement } = settings;
  if (!announcement) return null;
  if (announcement.expiresAt && new Date(announcement.expiresAt) <= now) return null;
  return { message: announcement.message, tone: announcement.tone };
};

/** What anyone may know about the platform's state: the frontend shows it. */
const publicStatus = (settings, now = new Date()) => {
  const state = effectiveState(settings, now);
  return {
    mode: state.mode,
    message: state.message,
    expectedBackAt: state.expectedBackAt,
    disabledFeatures: disabledFeatureList(settings),
    announcement: liveAnnouncement(settings, now),
    // Announced in read-only mode too; during maintenance nobody sees banners.
    scheduledMaintenance: state.mode !== 'maintenance' && windowUpcoming(settings.window, now)
      ? { startsAt: settings.window.startsAt, endsAt: settings.window.endsAt }
      : null,
    serverTime: now
  };
};

/** A 503 carrying the platform's words and code, for routes that check the state themselves. */
const unavailableError = (message, code) => {
  const error = new ApiError(503, message);
  error.code = code;
  error.platformBlocked = true;
  return error;
};

module.exports = {
  DEFAULT_MESSAGES,
  getPlatformSettings, updatePlatformSettings, invalidatePlatformCache,
  readOverride, effectiveState, isFeatureDisabled, disabledFeatureList, publicStatus,
  windowActive, windowUpcoming, unavailableError
};
