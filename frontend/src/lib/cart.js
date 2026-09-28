'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * The shop cart, kept in this browser until the member places an order.
 *
 * Prices here are only for display. The server prices every order from the
 * catalogue, so an edited cart cannot change what anyone pays.
 */
const STORAGE_KEY = 'eesa_cart';
const CHANGE_EVENT = 'eesa-cart-change';
const MAX_QUANTITY = 20;

const read = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.productId && item.quantity > 0) : [];
  } catch {
    return [];
  }
};

const write = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    // Private browsing: the cart lasts until the page closes.
  }
  // Other components on this page; the storage event covers other tabs.
  window.dispatchEvent(new Event(CHANGE_EVENT));
};

export const cartKey = (productId, size = '', color = '') => `${productId}|${size}|${color}`;

export function useCart() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const sync = () => setItems(read());
    sync();
    window.addEventListener(CHANGE_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CHANGE_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const update = useCallback((change) => {
    const next = change(read());
    setItems(next);
    write(next);
  }, []);

  /** Add a product, merging with the same size and colour already in the cart. */
  const add = useCallback((product, { size = '', color = '', quantity = 1 }) => update((current) => {
    const key = cartKey(product._id, size, color);
    const limit = product.stock == null ? MAX_QUANTITY : Math.min(MAX_QUANTITY, product.stock);
    const existing = current.find((item) => item.key === key);
    if (existing) {
      return current.map((item) => (item.key === key ? { ...item, quantity: Math.min(limit, item.quantity + quantity) } : item));
    }
    return [...current, {
      key,
      productId: product._id,
      slug: product.slug,
      name: product.name,
      price: product.price,
      image: product.images?.[0]?.url || '',
      size,
      color,
      quantity: Math.min(limit, quantity),
      limit,
    }];
  }), [update]);

  const setQuantity = useCallback((key, quantity) => update((current) => current
    .map((item) => (item.key === key ? { ...item, quantity: Math.max(0, Math.min(item.limit || MAX_QUANTITY, quantity)) } : item))
    .filter((item) => item.quantity > 0)), [update]);

  const remove = useCallback((key) => update((current) => current.filter((item) => item.key !== key)), [update]);

  const clear = useCallback(() => update(() => []), [update]);

  /**
   * Bring names, prices and limits up to date with the catalogue, and drop
   * items no longer on sale, so the cart total matches what will be charged.
   */
  const reconcile = useCallback((products) => update((current) => {
    const byId = new Map(products.map((p) => [p._id, p]));
    return current
      .filter((item) => byId.has(item.productId))
      .map((item) => {
        const product = byId.get(item.productId);
        const limit = product.stock == null ? MAX_QUANTITY : Math.min(MAX_QUANTITY, product.stock);
        return {
          ...item,
          name: product.name,
          price: product.price,
          slug: product.slug,
          image: product.images?.[0]?.url || item.image,
          limit,
          quantity: Math.min(item.quantity, limit),
        };
      })
      .filter((item) => item.quantity > 0);
  }), [update]);

  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return { items, count, subtotal, add, setQuantity, remove, clear, reconcile };
}
