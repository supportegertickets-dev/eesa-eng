import { HiShoppingBag } from 'react-icons/hi';
import { cloudinaryImage } from '@/lib/images';
import { formatKES, itemOptions } from '@/lib/merchandise';

/** The lines of an order and its total, as the member agreed to them. */
export default function OrderItems({ order }) {
  return (
    <div>
      <ul className="divide-y divide-line">
        {order.items.map((item, index) => (
          <li key={`${item.product}-${item.size}-${item.color}-${index}`} className="py-3 flex gap-3 items-center">
            <span className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
              {item.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={cloudinaryImage(item.image, { width: 112, height: 112 })} alt="" className="w-full h-full object-cover" />
              ) : (
                <HiShoppingBag className="w-6 h-6 text-faint" aria-hidden="true" />
              )}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-medium text-strong truncate">{item.name}</span>
              <span className="block text-xs text-subtle">
                {[itemOptions(item), `${item.quantity} × ${formatKES(item.price)}`].filter(Boolean).join(' · ')}
              </span>
            </span>
            <span className="font-semibold text-strong tabular-nums">{formatKES(item.price * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-between border-t border-line pt-3">
        <span className="text-sm text-muted-fg">Total</span>
        <span className="font-heading text-xl font-bold text-strong tabular-nums">{formatKES(order.total)}</span>
      </div>
    </div>
  );
}
