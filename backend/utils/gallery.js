const Album = require('../models/Album');
const Photo = require('../models/Photo');

/** "Engineering Week 2026!" -> "engineering-week-2026" */
const slugify = (text) => String(text || '')
  .normalize('NFKD')
  .replace(/[̀-ͯ]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 60)
  .replace(/-+$/, '') || 'album';

/**
 * A slug no other album uses: the title's slug, or that slug with the lowest
 * free number appended ("field-trip-2").
 */
const uniqueSlug = async (title) => {
  const base = slugify(title);
  // `base` holds only [a-z0-9-], so it is safe inside a pattern.
  const taken = new Set(
    (await Album.find({ slug: new RegExp(`^${base}(-\\d+)?$`) }).select('slug').lean()).map((album) => album.slug)
  );
  if (!taken.has(base)) return base;

  let n = 2;
  while (taken.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
};

/**
 * Recount an album's photos and recompute its cover after photos are removed
 * or reordered, or the chosen cover changes. A chosen cover that no longer
 * exists is cleared, and the first photo in album order stands in.
 */
const refreshAlbumSummary = async (albumId) => {
  const album = await Album.findById(albumId).select('coverPhoto').lean();
  if (!album) return;

  const [photoCount, chosen, first] = await Promise.all([
    Photo.countDocuments({ album: albumId }),
    album.coverPhoto ? Photo.findOne({ _id: album.coverPhoto, album: albumId }).lean() : null,
    Photo.findOne({ album: albumId }).sort({ position: 1, createdAt: 1 }).lean()
  ]);
  const cover = chosen || first;

  await Album.updateOne({ _id: albumId }, {
    $set: {
      photoCount,
      coverPhoto: chosen ? chosen._id : null,
      cover: cover ? { url: cover.url, width: cover.width, height: cover.height } : { url: '' }
    }
  });
};

module.exports = { slugify, uniqueSlug, refreshAlbumSummary };
