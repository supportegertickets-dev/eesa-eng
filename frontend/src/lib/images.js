/**
 * Image helpers shared by upload forms and galleries.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Matches the API's limit.

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/**
 * Check a file before uploading, so the member hears about a wrong type or an
 * oversized photo immediately rather than after a slow upload fails.
 *
 * `maxBytes` can be raised where the photo is shrunk in the browser before it
 * is sent, as the gallery uploader does.
 * @returns {string|null} an error message, or null when the file is acceptable
 */
export const validateImageFile = (file, { maxBytes = MAX_IMAGE_BYTES } = {}) => {
  if (!file) return 'No file selected.';
  if (!IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image. Use JPG, PNG, WebP or GIF.`;
  }
  if (file.size > maxBytes) {
    return `"${file.name}" is ${formatBytes(file.size)}. Images must be ${formatBytes(maxBytes)} or smaller.`;
  }
  return null;
};

const isCloudinary = (url) =>
  typeof url === 'string' && url.includes('res.cloudinary.com') && url.includes('/upload/');

// Chained after any transformation already in the URL, which Cloudinary
// applies in order.
const withTransformation = (url, parts) => url.replace('/upload/', `/upload/${parts.join(',')}/`);

/**
 * Ask Cloudinary for a copy sized for where it is shown, in the best format the
 * browser supports.
 *
 * Stored images can be up to 1920px wide. Serving that into a 400px card wastes
 * most of the download on a phone connection. Non-Cloudinary URLs pass through
 * unchanged.
 */
export const cloudinaryImage = (url, { width, height, crop = 'fill' } = {}) => {
  if (!isCloudinary(url)) return url;

  const parts = ['f_auto', 'q_auto'];
  if (width) parts.push(`w_${Math.round(width)}`);
  if (height) parts.push(`h_${Math.round(height)}`);
  if (width || height) parts.push(`c_${crop}`);

  return withTransformation(url, parts);
};

/**
 * A `srcset` of widths, keeping the original proportions, so the browser picks
 * the smallest copy that stays sharp on the member's screen.
 * @returns {string|undefined}
 */
export const cloudinarySrcSet = (url, widths = [320, 480, 640, 960, 1280, 1920]) => {
  if (!isCloudinary(url)) return undefined;
  return widths.map((width) => `${cloudinaryImage(url, { width, crop: 'limit' })} ${width}w`).join(', ');
};

/** A tiny blurred copy, well under a kilobyte, to show while the photo loads. */
export const cloudinaryPlaceholder = (url) =>
  (isCloudinary(url) ? withTransformation(url, ['f_auto', 'q_auto:low', 'w_32', 'e_blur:400']) : '');

/**
 * A link that downloads the full-size photo instead of opening it. Browsers
 * ignore the `download` attribute across origins, so Cloudinary is asked to
 * send it as an attachment.
 */
export const cloudinaryDownload = (url, name = 'photo') => {
  if (!isCloudinary(url)) return url;
  const safeName = String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'photo';
  return withTransformation(url, [`fl_attachment:${safeName}`]);
};
