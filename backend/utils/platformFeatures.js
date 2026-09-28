/**
 * The parts of the platform the superadmin can switch off one at a time.
 *
 * Each feature lists the requests it covers, matched against the path below
 * /api. Everything is case-insensitive and allows a trailing slash, because
 * Express routes do, and a switch that "/API/Auth/Register/" slipped past
 * would be no switch at all. Sign-in is not listed: the gate cannot tell a
 * superadmin's sign-in from anyone else's, so routes/auth.js checks it after
 * the password.
 */

const ID = '[a-f0-9]{24}';

const FEATURES = [
  {
    key: 'registration',
    label: 'New sign-ups',
    description: 'The registration form. Existing members are not affected.',
    message: 'New sign-ups are paused for now. Please try again later.',
    routes: [{ method: 'POST', path: /^\/auth\/register\/?$/i }]
  },
  {
    key: 'login',
    label: 'Sign-ins',
    description: 'Signing in, for everyone but you. People already signed in stay signed in.',
    message: 'Signing in is paused for now. Please try again later.',
    routes: []
  },
  {
    key: 'payments',
    label: 'Payments',
    description: 'M-Pesa prompts and payment submissions, for membership fees and shop orders. Payments already made are still recorded.',
    message: 'Payments are paused for now. Nothing has been charged. Please try again later.',
    routes: [
      { method: 'POST', path: /^\/payments\/?$/i },
      { method: 'POST', path: /^\/payments\/mpesa\/stkpush\/?$/i },
      { method: 'POST', path: new RegExp(`^/merchandise/orders/${ID}/(mpesa|manual)/?$`, 'i') }
    ]
  },
  {
    key: 'shop',
    label: 'Shop orders',
    description: 'Placing new shop orders. Shop managers can still manage products and existing orders.',
    message: 'The shop is not taking new orders right now. Please try again later.',
    routes: [{ method: 'POST', path: /^\/merchandise\/orders\/?$/i }]
  },
  {
    key: 'libraryUploads',
    label: 'Library uploads',
    description: 'Uploading files to the resource library.',
    message: 'Library uploads are paused for now. Please try again later.',
    routes: [{ method: 'POST', path: /^\/resources\/?$/i }]
  },
  {
    key: 'galleryUploads',
    label: 'Gallery uploads',
    description: 'Adding photos to gallery albums.',
    message: 'Gallery uploads are paused for now. Please try again later.',
    routes: [{ method: 'POST', path: new RegExp(`^/gallery/albums/${ID}/photos/?$`, 'i') }]
  },
  {
    key: 'voting',
    label: 'Election voting',
    description: 'Casting votes in open elections. Elections stay open; only the ballot box is closed.',
    message: 'Voting is paused for now. Your vote has not been cast. Please try again later.',
    routes: [{ method: 'POST', path: new RegExp(`^/elections/${ID}/vote/${ID}/?$`, 'i') }]
  },
  {
    key: 'contactForm',
    label: 'Contact form',
    description: 'The public contact form, for example during a spam attack.',
    message: 'The contact form is unavailable right now. Please try again later.',
    routes: [{ method: 'POST', path: /^\/contact\/?$/i }]
  }
];

const FEATURE_KEYS = FEATURES.map((feature) => feature.key);
const featureByKey = new Map(FEATURES.map((feature) => [feature.key, feature]));

/** The feature a request belongs to, or null. `path` is relative to /api. */
const featureForRequest = (method, path) => FEATURES.find((feature) => feature.routes
  .some((route) => route.method === method && route.path.test(path))) || null;

/** The catalogue as the API returns it: no route patterns. */
const describeFeature = ({ key, label, description, message }) => ({ key, label, description, message });

module.exports = { FEATURES, FEATURE_KEYS, featureByKey, featureForRequest, describeFeature };
