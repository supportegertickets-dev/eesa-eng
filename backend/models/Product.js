const mongoose = require('mongoose');

const PRODUCT_CATEGORIES = ['apparel', 'accessories', 'stationery', 'gadgets', 'other'];
const MAX_PRODUCT_IMAGES = 6;

const imageSchema = new mongoose.Schema({
  url: { type: String, required: true },
  publicId: { type: String, default: '' }
});

const optionList = {
  type: [{ type: String, trim: true, maxlength: 30 }],
  default: [],
  validate: {
    validator: (list) => list.length <= 20,
    message: 'A product can have at most 20 options of each kind.'
  }
};

/**
 * An item sold in the official merchandise shop.
 *
 * `stock` is optional: null means the shop does not count this item and it
 * never sells out. When it is set, placing an order takes the quantity off it
 * and cancelling the order puts it back.
 */
const productSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'Product name is required'], trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
  description: { type: String, trim: true, maxlength: 2000, default: '' },
  category: { type: String, enum: PRODUCT_CATEGORIES, default: 'apparel' },
  // Whole shillings; M-Pesa charges whole amounts.
  price: {
    type: Number,
    required: [true, 'Price is required'],
    min: [1, 'Price must be at least KES 1'],
    max: [1000000, 'Price is too high'],
    validate: { validator: Number.isInteger, message: 'Price must be a whole number of shillings' }
  },
  images: {
    type: [imageSchema],
    default: [],
    validate: {
      validator: (list) => list.length <= MAX_PRODUCT_IMAGES,
      message: `A product can have at most ${MAX_PRODUCT_IMAGES} photos.`
    }
  },
  sizes: optionList,
  colors: optionList,
  stock: { type: Number, min: 0, default: null },
  isActive: { type: Boolean, default: true },
  featured: { type: Boolean, default: false },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, { timestamps: true });

productSchema.index({ isActive: 1, category: 1, featured: -1, createdAt: -1 });

module.exports = mongoose.model('Product', productSchema);
module.exports.PRODUCT_CATEGORIES = PRODUCT_CATEGORIES;
module.exports.MAX_PRODUCT_IMAGES = MAX_PRODUCT_IMAGES;
