/**
 * Image helpers shared by upload forms and galleries.
 */

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // Matches the API's limit.

const formatBytes = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)}MB`;

/**
 * Check a file before uploading, so the member hears about a wrong type or an
 * oversized photo immediately rather than after a slow upload fails.
 * @returns {string|null} an error message, or null when the file is acceptable
 */
export const validateImageFile = (file) => {
  if (!file) return 'No file selected.';
  if (!IMAGE_TYPES.includes(file.type)) {
    return `"${file.name}" is not a supported image. Use JPG, PNG, WebP or GIF.`;
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return `"${file.name}" is ${formatBytes(file.size)}. Images must be ${formatBytes(MAX_IMAGE_BYTES)} or smaller.`;
  }
  return null;
};

/**
 * Ask Cloudinary for a copy sized for where it is shown, in the best format the
 * browser supports.
 *
 * Stored images can be up to 1920px wide. Serving that into a 400px card wastes
 * most of the download on a phone connection. Non-Cloudinary URLs pass through
 * unchanged.
 */
export const cloudinaryImage = (url, { width, height, crop = 'fill' } = {}) => {
  if (typeof url !== 'string' || !url.includes('res.cloudinary.com') || !url.includes('/upload/')) {
    return url;
  }

  const parts = ['f_auto', 'q_auto'];
  if (width) parts.push(`w_${Math.round(width)}`);
  if (height) parts.push(`h_${Math.round(height)}`);
  if (width || height) parts.push(`c_${crop}`);

  // Chained after any transformation already in the URL, which Cloudinary
  // applies in order.
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
};
