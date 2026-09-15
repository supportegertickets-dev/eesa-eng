const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { createLimiter } = require('./utils/rateLimit');
const mongoose = require('mongoose');

const connectDB = require('./config/db');
const { advanceAcademicYears } = require('./utils/academicYear');
const { mongoSanitize } = require('./utils/sanitize');
const { notFound, errorHandler } = require('./middleware/errorHandler');

/* ------------------------------------------------------------------ *
 * Configuration checks
 * ------------------------------------------------------------------ */

// Fail fast and loudly rather than starting a server that will mint
// unverifiable tokens or reject every database call.
const REQUIRED_ENV = ['MONGODB_URI', 'JWT_SECRET'];
const missing = REQUIRED_ENV.filter((key) => !process.env[key] && !(key === 'MONGODB_URI' && process.env.MONGO_URI));

if (missing.length) {
  console.error(`FATAL: missing required environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET.length < 32) {
  console.error('FATAL: JWT_SECRET must be at least 32 characters in production.');
  process.exit(1);
}

const app = express();

// Render and most PaaS hosts sit behind a single reverse proxy. This makes
// req.ip the real client address, which the rate limiters depend on.
app.set('trust proxy', 1);
app.disable('x-powered-by');

/* ------------------------------------------------------------------ *
 * Database
 * ------------------------------------------------------------------ */

connectDB().then(() => {
  const runRollover = () =>
    advanceAcademicYears().catch((error) => console.error('Academic year rollover failed:', error.message));
  runRollover();
  // Backstop for a long-lived process with no traffic; the routine is
  // internally throttled so this cannot double-apply.
  setInterval(runRollover, 24 * 60 * 60 * 1000).unref();
});

/* ------------------------------------------------------------------ *
 * Security and transport
 * ------------------------------------------------------------------ */

app.use(helmet({
  // Cloudinary assets and the Next.js frontend are served from other origins.
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
  // This is a JSON API, not an HTML origin; a CSP here protects nothing and
  // breaks the proxied file previews.
  contentSecurityPolicy: false
}));

// Gzip JSON responses. The member directory and library listings are the
// largest payloads and compress by roughly an order of magnitude.
app.use(compression());

const allowedOrigins = [
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((u) => u.trim()) : []),
  'http://localhost:3000'
].filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    // A missing Origin header means a same-origin, curl or mobile-app request.
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn('CORS blocked origin:', origin);
    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  // Cache preflight results for a day to cut a round trip off every mutation.
  maxAge: 86400
}));

/* ------------------------------------------------------------------ *
 * Rate limiting
 * ------------------------------------------------------------------ */

// Gallery photos upload one request per file, so a leader adding a few hundred
// photos from an event would exhaust the general budgets below. They get a
// budget of their own instead. The route itself requires a leadership session.
const GALLERY_PHOTO_UPLOAD = /^\/gallery\/albums\/[a-f0-9]{24}\/photos\/?$/i;
const isGalleryPhotoUpload = (req) => req.method === 'POST' && GALLERY_PHOTO_UPLOAD.test(req.path);

// A portal page can legitimately fire a dozen requests on load, so the global
// budget is generous. Credential endpoints impose their own far tighter limits
// inside routes/auth.js.
const globalLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_MAX) || 600,
  // Health checks come from uptime monitors and must never be throttled.
  skip: (req) => req.path === '/health' || isGalleryPhotoUpload(req),
  message: 'Too many requests. Please slow down and try again shortly.'
});

// Writes are rarer and more expensive than reads, so they get their own budget.
const writeLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.WRITE_RATE_LIMIT_MAX) || 150,
  skip: (req) => req.method === 'GET' || req.method === 'OPTIONS' || isGalleryPhotoUpload(req),
  message: 'Too many changes submitted. Please wait a moment and try again.'
});

const galleryUploadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.GALLERY_UPLOAD_RATE_LIMIT_MAX) || 600,
  skip: (req) => !isGalleryPhotoUpload(req),
  message: 'Too many photos uploaded in a short time. Please wait a few minutes and retry the rest.'
});

app.use('/api/', globalLimiter);
app.use('/api/', writeLimiter);
app.use('/api/', galleryUploadLimiter);

/* ------------------------------------------------------------------ *
 * Body parsing
 * ------------------------------------------------------------------ */

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// Strip Mongo operators from every request before any route reads them.
app.use(mongoSanitize);

/* ------------------------------------------------------------------ *
 * Routes
 * ------------------------------------------------------------------ */

app.use('/api/auth', require('./routes/auth'));
app.use('/api/users', require('./routes/users'));
app.use('/api/events', require('./routes/events'));
app.use('/api/news', require('./routes/news'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/contact', require('./routes/contact'));
app.use('/api/elections', require('./routes/elections'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/resources', require('./routes/resources'));
app.use('/api/units', require('./routes/units'));
app.use('/api/sponsors', require('./routes/sponsors'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/gallery', require('./routes/gallery'));
app.use('/api/admin', require('./routes/admin'));

/**
 * Health check. Reports database connectivity so a failed Mongo connection
 * surfaces as an unhealthy service instead of a healthy one that 500s on
 * every request.
 */
app.get('/api/health', (req, res) => {
  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';
  const healthy = mongoose.connection.readyState === 1;

  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'degraded',
    database: dbState,
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  });
});

app.use(notFound);
app.use(errorHandler);

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => {
  console.log(`EESA API listening on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
  console.log('Allowed CORS origins:', allowedOrigins.join(', '));
});

/**
 * Close the listener and the database pool before exiting so in-flight requests
 * finish and Mongo does not log an abrupt disconnect on every deploy.
 */
const shutdown = (signal) => {
  console.log(`${signal} received, shutting down.`);
  server.close(() => {
    mongoose.connection.close(false).finally(() => process.exit(0));
  });
  // Do not let a stuck connection block the deploy indefinitely.
  setTimeout(() => process.exit(1), 10000).unref();
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  console.error('Unhandled promise rejection:', reason);
});

module.exports = app;
