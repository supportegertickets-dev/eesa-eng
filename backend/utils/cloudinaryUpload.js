const cloudinary = require('../config/cloudinary');

/**
 * Incoming transformations applied at upload time, so an oversized phone photo
 * is stored at a sensible size instead of being served at full resolution.
 * Format selection (WebP/AVIF) is left to delivery URLs, where it can adapt to
 * each browser.
 */
const PRESETS = {
  // Event banners: wide, capped rather than cropped so nothing important is lost.
  cover: [{ width: 1920, height: 1080, crop: 'limit', quality: 'auto' }],
  // Event gallery photos.
  photo: [{ width: 1920, height: 1920, crop: 'limit', quality: 'auto' }],
  // Candidate portraits: a consistent 3:4 frame centred on the face, so ballot
  // cards line up regardless of what was uploaded.
  portrait: [{ width: 600, height: 800, crop: 'fill', gravity: 'face', quality: 'auto' }]
};

/**
 * Upload an in-memory image to Cloudinary.
 * @returns {Promise<{ url: string, publicId: string, width?: number, height?: number }>}
 */
const uploadImageBuffer = (buffer, { folder, preset = 'photo' }) =>
  new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image', transformation: PRESETS[preset] || PRESETS.photo },
      (error, result) => {
        if (error) return reject(error);
        return resolve({
          url: result.secure_url,
          publicId: result.public_id,
          width: result.width,
          height: result.height
        });
      }
    );
    stream.end(buffer);
  });

/**
 * Upload several images, all or nothing.
 *
 * If any upload fails, the ones that succeeded are deleted before the error is
 * rethrown, so a failed request never leaves orphaned files in storage.
 */
const uploadImageBuffers = async (files = [], options) => {
  const results = await Promise.allSettled(files.map((file) => uploadImageBuffer(file.buffer, options)));
  const failed = results.find((r) => r.status === 'rejected');

  if (failed) {
    await destroyImages(results.filter((r) => r.status === 'fulfilled').map((r) => r.value.publicId));
    throw failed.reason;
  }

  return results.map((r) => r.value);
};

/**
 * Delete an image. Failures are logged, never thrown: a storage hiccup must not
 * block deleting the database record that pointed at it.
 */
const destroyImage = async (publicId) => {
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
  } catch (error) {
    console.warn(`Could not delete image ${publicId}:`, error.message);
  }
};

const destroyImages = (publicIds = []) => Promise.allSettled(publicIds.filter(Boolean).map(destroyImage));

module.exports = { uploadImageBuffer, uploadImageBuffers, destroyImage, destroyImages, PRESETS };
