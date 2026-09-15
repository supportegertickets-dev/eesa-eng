/**
 * Gallery helpers: labels, links, formatting and preparing photos for upload.
 */
import { format, isValid } from 'date-fns';
import { cloudinaryDownload } from '@/lib/images';

export const GALLERY_CATEGORIES = ['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other'];

export const CATEGORY_LABELS = {
  events: 'Events',
  projects: 'Projects',
  campus: 'Campus life',
  workshops: 'Workshops',
  competitions: 'Competitions',
  social: 'Social',
  other: 'Other',
};

export const categoryLabel = (category) => CATEGORY_LABELS[category] || category;

export const SORT_OPTIONS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'title', label: 'Name (A–Z)' },
  { id: 'updated', label: 'Recently updated' },
];

export const MAX_ALBUM_PHOTOS = 500; // Matches the API.

// Photos are shrunk in the browser before upload, so the original can be far
// larger than the API's 5MB limit.
export const MAX_SOURCE_IMAGE_BYTES = 40 * 1024 * 1024;

/* ------------------------------------------------------------------ *
 * Links and labels
 * ------------------------------------------------------------------ */

export const albumHref = (album) => `/gallery/${album.slug}`;
export const manageAlbumHref = (album) => `/portal/gallery/${album._id}`;
export const photoCountLabel = (count = 0) => `${count} photo${count === 1 ? '' : 's'}`;

export const absoluteUrl = (path) =>
  (typeof window === 'undefined' ? path : new URL(path, window.location.origin).toString());

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && isValid(date) ? date : null;
};

export const formatAlbumDate = (value) => {
  const date = toDate(value);
  return date ? format(date, 'd MMMM yyyy') : '';
};

/** Value for an <input type="date">. */
export const toDateInput = (value) => {
  const date = toDate(value);
  return date ? format(date, 'yyyy-MM-dd') : '';
};

/** Midday local time, so the date cannot slip a day when read in another time zone. */
export const fromDateInput = (value) => (value ? new Date(`${value}T12:00:00`).toISOString() : '');

/** Width over height; photos saved before dimensions were recorded are treated as 4:3. */
export const photoAspect = (photo) => (photo?.width > 0 && photo?.height > 0 ? photo.width / photo.height : 4 / 3);

/** Shape an album's photos for the Lightbox. */
export const toLightboxImages = (album, photos) => photos.map((photo, index) => ({
  url: photo.url,
  alt: photo.caption || `Photo ${index + 1} from ${album.title}`,
  caption: photo.caption,
  downloadUrl: cloudinaryDownload(photo.url, `${album.slug}-${index + 1}`),
}));

/**
 * Open the device's share sheet where there is one, otherwise copy the link.
 * @returns {Promise<'shared'|'copied'|'cancelled'|'failed'>}
 */
export const shareLink = async ({ url, title }) => {
  if (typeof navigator !== 'undefined' && navigator.share) {
    try {
      await navigator.share({ url, title });
      return 'shared';
    } catch (error) {
      if (error?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch {
    return 'failed';
  }
};

/* ------------------------------------------------------------------ *
 * Preparing photos for upload
 * ------------------------------------------------------------------ */

// The API stores photos at up to 1920px, so anything larger is wasted upload.
const MAX_EDGE = 2048;
const JPEG_QUALITY = 0.86;
// A photo already this small in bytes and pixels is sent untouched.
const LEAVE_ALONE_BYTES = 1.5 * 1024 * 1024;

/**
 * Shrink a photo in the browser before it is uploaded.
 *
 * A 12MB phone photo becomes roughly 1MB, so batches upload many times faster
 * on mobile data and stay under the API's 5MB limit. Re-encoding also drops
 * embedded metadata such as the GPS location. The photo's orientation is
 * applied first, so portraits do not arrive sideways.
 *
 * Returns the original file when it is already small, is a GIF (a canvas would
 * lose the animation), or cannot be decoded here, in which case the server
 * decides.
 * @returns {Promise<File>}
 */
export const prepareImageForUpload = async (file) => {
  if (file.type === 'image/gif') return file;

  let source = null;
  let objectUrl = '';
  try {
    if (typeof createImageBitmap === 'function') {
      source = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
    }
    if (!source) {
      objectUrl = URL.createObjectURL(file);
      source = new Image();
      source.src = objectUrl;
      await source.decode();
    }
  } catch {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    return file;
  }

  try {
    const width = source.naturalWidth || source.width;
    const height = source.naturalHeight || source.height;
    const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
    if (scale === 1 && file.size <= LEAVE_ALONE_BYTES) return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(width * scale);
    canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d');
    // JPEG has no transparency; without a fill, transparent areas turn black.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingQuality = 'high';
    context.drawImage(source, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
    // Safari holds on to canvas memory until the canvas is shrunk.
    canvas.width = 0;
    canvas.height = 0;

    if (!blob || (scale === 1 && blob.size >= file.size)) return file;
    const name = `${file.name.replace(/\.[^.]+$/, '') || 'photo'}.jpg`;
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified });
  } finally {
    source.close?.();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
};
