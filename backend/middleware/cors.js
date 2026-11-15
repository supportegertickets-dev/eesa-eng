const cors = require('cors');

const EESA_ORIGINS = [
  'https://eesa.co.ke',
  'https://www.eesa.co.ke',
  'https://eesa.egerton.ac.ke'
];

const allowedOrigins = [
  ...(process.env.FRONTEND_URL ? process.env.FRONTEND_URL.split(',').map((url) => url.trim()) : []),
  ...EESA_ORIGINS,
  'http://localhost:3000'
].filter(Boolean);

const corsMiddleware = cors({
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
});

module.exports = { allowedOrigins, corsMiddleware };