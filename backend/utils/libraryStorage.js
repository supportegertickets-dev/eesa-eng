const crypto = require('crypto');
const path = require('path');
const cloudinary = require('../config/cloudinary');

/**
 * Private storage for library files.
 *
 * Files were uploaded with public access, and every listing returned their
 * Cloudinary URL, so anyone holding a link could read them without signing in.
 * They are now stored as `authenticated` raw assets: Cloudinary refuses unsigned
 * requests, and only this server can sign one. Members reach files through the
 * ticketed endpoint in routes/resources.js.
 *
 * Everything is stored as `raw`, which also avoids Cloudinary's account-level
 * block on delivering PDFs uploaded as images.
 */

const LIBRARY_FOLDER = 'eesa/library';
const DOWNLOAD_URL_TTL_SECONDS = 300;

const extensionOf = (fileName) => path.extname(fileName || '').toLowerCase().replace(/[^.a-z0-9]/g, '').slice(0, 10);

/** Where a stored resource lives. Older uploads predate the explicit fields. */
const storageOf = (resource) => {
  const url = resource.fileUrl || '';
  const resourceType = resource.fileResourceType
    || (url.includes('/image/') ? 'image' : url.includes('/video/') ? 'video' : 'raw');
  const deliveryType = resource.fileDeliveryType
    || (url.includes('/authenticated/') ? 'authenticated' : url.includes('/private/') ? 'private' : 'upload');
  // Image and video assets keep their extension in the URL, not the public id.
  const format = resourceType === 'raw' ? undefined : (url.match(/\.([a-z0-9]+)(?:\?|$)/i) || [])[1];
  return { publicId: resource.filePublicId, resourceType, deliveryType, format, url };
};

/**
 * Store an uploaded file privately.
 * @returns {Promise<{ fileUrl, filePublicId, fileResourceType, fileDeliveryType }>}
 */
const uploadLibraryFile = (file) => new Promise((resolve, reject) => {
  const stream = cloudinary.uploader.upload_stream({
    folder: LIBRARY_FOLDER,
    // Raw public ids keep the extension, which Cloudinary uses as the format.
    public_id: `${crypto.randomBytes(12).toString('hex')}${extensionOf(file.originalname)}`,
    resource_type: 'raw',
    type: 'authenticated',
    overwrite: false
  }, (error, result) => {
    if (error) return reject(error);
    return resolve({
      fileUrl: result.secure_url,
      filePublicId: result.public_id,
      fileResourceType: result.resource_type || 'raw',
      fileDeliveryType: result.type || 'authenticated'
    });
  });
  stream.end(file.buffer);
});

/** URLs that can deliver a resource, most efficient first. */
const deliveryUrls = (resource) => {
  const { publicId, resourceType, deliveryType, format, url } = storageOf(resource);
  const urls = [];

  // Files not yet migrated to private storage are still public.
  if (deliveryType === 'upload' && url) urls.push(url);

  if (publicId) {
    // A signed CDN URL is cached at the edge and has no rate limit.
    urls.push(cloudinary.url(publicId, {
      resource_type: resourceType,
      type: deliveryType,
      sign_url: true,
      secure: true,
      ...(format && { format })
    }));
    // The download API honours private assets even where signed delivery URLs
    // are restricted on the account.
    urls.push(cloudinary.utils.private_download_url(publicId, format || null, {
      resource_type: resourceType,
      type: deliveryType,
      expires_at: Math.floor(Date.now() / 1000) + DOWNLOAD_URL_TTL_SECONDS
    }));
  }

  return urls;
};

/**
 * Fetch a stored file's contents.
 * @returns {Promise<Response|null>} the first successful response, or null
 */
const fetchLibraryFile = async (resource) => {
  for (const url of deliveryUrls(resource)) {
    try {
      const response = await fetch(url, { redirect: 'follow' });
      if (response.ok && response.body) return response;
      await response.body?.cancel();
      console.warn(`Library storage returned ${response.status} for resource ${resource._id}`);
    } catch (error) {
      console.warn(`Library storage request failed for resource ${resource._id}:`, error.message);
    }
  }
  return null;
};

/**
 * Delete a stored file. Failures are logged, never thrown: a storage hiccup must
 * not block removing the database record.
 */
const destroyLibraryFile = async (resource) => {
  const { publicId, resourceType, deliveryType } = storageOf(resource);
  if (!publicId) return;
  try {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, type: deliveryType, invalidate: true });
  } catch (error) {
    console.warn(`Could not delete library file ${publicId}:`, error.message);
  }
};

/**
 * Move a public legacy upload into private storage. Used by the migration script.
 * @returns {Promise<object>} the new storage fields to save on the resource
 */
const makeLibraryFilePrivate = async (resource) => {
  const { publicId, resourceType, deliveryType } = storageOf(resource);
  if (!publicId) throw new Error('Resource has no stored file');
  if (deliveryType !== 'upload') return null;

  const result = await cloudinary.uploader.rename(
    publicId,
    `${LIBRARY_FOLDER}/${publicId.split('/').pop()}`,
    { resource_type: resourceType, type: 'upload', to_type: 'authenticated', overwrite: false, invalidate: true }
  );

  return {
    fileUrl: result.secure_url,
    filePublicId: result.public_id,
    fileResourceType: result.resource_type || resourceType,
    fileDeliveryType: result.type || 'authenticated'
  };
};

module.exports = { uploadLibraryFile, fetchLibraryFile, destroyLibraryFile, makeLibraryFilePrivate, storageOf };
