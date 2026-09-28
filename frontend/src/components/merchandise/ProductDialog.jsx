'use client';

import { useEffect, useState } from 'react';
import { HiMinus, HiPlus, HiShoppingBag, HiShoppingCart } from 'react-icons/hi';
import { cloudinaryImage } from '@/lib/images';
import { categoryLabel, formatKES, stockNote } from '@/lib/merchandise';
import Modal from '@/components/ui/Modal';

const optionClass = (active) => `min-w-[2.75rem] px-3 py-2 rounded-lg border text-sm font-medium transition-colors
  ${active ? 'border-primary-500 bg-primary-500 text-white' : 'border-line-strong text-body hover:border-primary-400'}`;

/** A product's photos and options, and adding it to the cart. */
export default function ProductDialog({ product, onClose, onAdd }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [size, setSize] = useState('');
  const [color, setColor] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [missing, setMissing] = useState('');

  useEffect(() => {
    setImageIndex(0);
    // A single option is chosen for the member; there is nothing to decide.
    setSize(product?.sizes?.length === 1 ? product.sizes[0] : '');
    setColor(product?.colors?.length === 1 ? product.colors[0] : '');
    setQuantity(1);
    setMissing('');
  }, [product]);

  if (!product) return null;

  const stock = stockNote(product);
  const soldOut = Boolean(stock?.soldOut);
  const limit = product.stock == null ? 20 : Math.min(20, product.stock);
  const images = product.images || [];

  const add = () => {
    if (product.sizes?.length && !size) return setMissing('Choose a size.');
    if (product.colors?.length && !color) return setMissing('Choose a colour.');
    onAdd(product, { size, color, quantity });
    return undefined;
  };

  return (
    <Modal
      open
      title={product.name}
      description={`${categoryLabel(product.category)} · ${formatKES(product.price)}`}
      onClose={onClose}
      size="xl"
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>Keep browsing</button>
          <button type="button" className="btn-primary" onClick={add} disabled={soldOut}>
            <HiShoppingCart className="w-4 h-4" aria-hidden="true" />
            {soldOut ? 'Sold out' : `Add to cart · ${formatKES(product.price * quantity)}`}
          </button>
        </>
      )}
    >
      <div className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="aspect-square rounded-xl overflow-hidden bg-muted border border-line">
            {images[imageIndex] ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={cloudinaryImage(images[imageIndex].url, { width: 900, height: 900 })}
                alt={`${product.name}, photo ${imageIndex + 1} of ${images.length}`}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center">
                <HiShoppingBag className="w-16 h-16 text-faint" aria-hidden="true" />
              </span>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
              {images.map((image, index) => (
                <button
                  key={image._id || image.url}
                  type="button"
                  onClick={() => setImageIndex(index)}
                  aria-label={`Show photo ${index + 1}`}
                  aria-pressed={index === imageIndex}
                  className={`w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 ${index === imageIndex ? 'border-primary-500' : 'border-transparent'}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={cloudinaryImage(image.url, { width: 128, height: 128 })} alt="" className="w-full h-full object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-5">
          <div>
            <p className="font-heading text-2xl font-bold text-primary-500 dark:text-primary-300 tabular-nums">{formatKES(product.price)}</p>
            {stock && <span className={`${stock.tone} mt-2`}>{stock.text}</span>}
          </div>

          {product.description && <p className="text-sm text-body whitespace-pre-line">{product.description}</p>}

          {product.sizes?.length > 0 && (
            <fieldset>
              <legend className="form-label">Size</legend>
              <div className="flex flex-wrap gap-2">
                {product.sizes.map((option) => (
                  <button key={option} type="button" aria-pressed={size === option} className={optionClass(size === option)} onClick={() => { setSize(option); setMissing(''); }}>
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {product.colors?.length > 0 && (
            <fieldset>
              <legend className="form-label">Colour</legend>
              <div className="flex flex-wrap gap-2">
                {product.colors.map((option) => (
                  <button key={option} type="button" aria-pressed={color === option} className={optionClass(color === option)} onClick={() => { setColor(option); setMissing(''); }}>
                    {option}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {!soldOut && (
            <div>
              <span className="form-label" id="quantity-label">Quantity</span>
              <div className="inline-flex items-center rounded-lg border border-line-strong" role="group" aria-labelledby="quantity-label">
                <button type="button" className="p-2.5 text-body hover:bg-muted rounded-l-lg disabled:opacity-40" onClick={() => setQuantity((q) => Math.max(1, q - 1))} disabled={quantity <= 1} aria-label="One fewer">
                  <HiMinus className="w-4 h-4" aria-hidden="true" />
                </button>
                <span className="w-12 text-center font-semibold tabular-nums" aria-live="polite">{quantity}</span>
                <button type="button" className="p-2.5 text-body hover:bg-muted rounded-r-lg disabled:opacity-40" onClick={() => setQuantity((q) => Math.min(limit, q + 1))} disabled={quantity >= limit} aria-label="One more">
                  <HiPlus className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            </div>
          )}

          {missing && <p className="form-error" role="alert">{missing}</p>}
        </div>
      </div>
    </Modal>
  );
}
