import { HiShoppingBag, HiStar } from 'react-icons/hi';
import { cloudinaryImage } from '@/lib/images';
import { categoryLabel, formatKES, stockNote } from '@/lib/merchandise';

/** A tile in the shop grid. The whole tile opens the product. */
export default function ProductCard({ product, onOpen }) {
  const stock = stockNote(product);
  const cover = product.images?.[0]?.url;

  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className="group text-left card p-0 overflow-hidden flex flex-col hover:shadow-raised transition-shadow focus-visible:ring-2"
    >
      <span className="relative block aspect-square bg-muted overflow-hidden">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryImage(cover, { width: 600, height: 600 })}
            alt=""
            loading="lazy"
            className={`w-full h-full object-cover transition-transform duration-300 group-hover:scale-105 ${stock?.soldOut ? 'opacity-60' : ''}`}
          />
        ) : (
          <span className="w-full h-full flex items-center justify-center">
            <HiShoppingBag className="w-12 h-12 text-faint" aria-hidden="true" />
          </span>
        )}
        {product.featured && (
          <span className="absolute top-3 left-3 badge bg-accent-500 text-primary-900 shadow-card">
            <HiStar className="w-3.5 h-3.5" aria-hidden="true" /> Featured
          </span>
        )}
        {stock && <span className={`absolute top-3 right-3 ${stock.tone} shadow-card`}>{stock.text}</span>}
        {!product.isActive && <span className="absolute bottom-3 left-3 badge-neutral shadow-card">Hidden from shop</span>}
      </span>

      <span className="p-4 flex-1 flex flex-col">
        <span className="text-xs font-medium uppercase tracking-wide text-subtle">{categoryLabel(product.category)}</span>
        <span className="mt-1 font-semibold text-strong group-hover:text-primary-500 dark:group-hover:text-primary-300 transition-colors">{product.name}</span>
        {(product.sizes?.length > 0 || product.colors?.length > 0) && (
          <span className="mt-1 text-xs text-subtle">
            {[product.sizes?.length && `${product.sizes.length} sizes`, product.colors?.length && `${product.colors.length} colours`].filter(Boolean).join(' · ')}
          </span>
        )}
        <span className="mt-auto pt-3 font-heading text-lg font-bold text-primary-500 dark:text-primary-300 tabular-nums">
          {formatKES(product.price)}
        </span>
      </span>
    </button>
  );
}
