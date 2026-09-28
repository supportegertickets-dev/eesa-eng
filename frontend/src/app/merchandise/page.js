'use client';

import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiSearch, HiShoppingBag, HiShoppingCart, HiCash, HiLocationMarker, HiClipboardList } from 'react-icons/hi';
import { getProducts, getShopSettings } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { useCart } from '@/lib/cart';
import { CATEGORIES } from '@/lib/merchandise';
import ProductCard from '@/components/merchandise/ProductCard';
import ProductDialog from '@/components/merchandise/ProductDialog';
import CartPanel from '@/components/merchandise/CartPanel';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import { LoadingRegion, SkeletonGrid } from '@/components/ui/Skeleton';

const HOW_IT_WORKS = [
  { icon: HiShoppingCart, title: 'Add to cart', text: 'Pick your size and colour.' },
  { icon: HiCash, title: 'Pay by M-Pesa', text: 'An STK prompt on your phone, or send a code.' },
  { icon: HiLocationMarker, title: 'Collect on campus', text: 'We notify you when it is ready.' },
];

export default function MerchandisePage() {
  // useSearchParams must sit inside a Suspense boundary.
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-16"><SkeletonGrid count={6} /></div>}>
      <Shop />
    </Suspense>
  );
}

function Shop() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const cart = useCart();
  const { reconcile } = cart;

  const [products, setProducts] = useState([]);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');

  // The open product and the cart live in the URL, so a product can be shared
  // and signing in returns straight to the cart.
  const openSlug = searchParams.get('item');
  const cartOpen = searchParams.get('cart') === 'open';

  const setQuery = useCallback((changes) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [catalogue, shop] = await Promise.all([getProducts(), getShopSettings().catch(() => null)]);
      setProducts(catalogue.products || []);
      setSettings(shop);
      reconcile(catalogue.products || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [reconcile]);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return products.filter((product) => (!category || product.category === category)
      && (!term || `${product.name} ${product.description}`.toLowerCase().includes(term)));
  }, [products, category, search]);

  const chips = useMemo(() => [
    { id: '', label: 'All', count: products.length },
    ...CATEGORIES
      .map((c) => ({ ...c, count: products.filter((p) => p.category === c.id).length }))
      .filter((c) => c.count > 0),
  ], [products]);

  const openProduct = products.find((product) => product.slug === openSlug) || null;

  const addToCart = (product, options) => {
    cart.add(product, options);
    setQuery({ item: '' });
    toast.success(
      (t) => (
        <span className="flex items-center gap-3">
          Added {product.name}
          <button type="button" className="font-semibold underline" onClick={() => { toast.dismiss(t.id); setQuery({ item: '', cart: 'open' }); }}>
            View cart
          </button>
        </span>
      ),
      { duration: 4000 },
    );
  };

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-14 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="max-w-2xl">
            <p className="text-accent-400 font-semibold uppercase tracking-wide text-sm">EESA Shop</p>
            <h1 className="font-heading text-4xl sm:text-5xl font-bold mt-2">Official Merchandise</h1>
            <p className="text-lg text-white/85 mt-4">
              Wear the association with pride. Every purchase supports EESA events, projects and student welfare.
            </p>
          </div>
          <ul className="mt-8 hidden sm:grid gap-3 sm:grid-cols-3 max-w-3xl">
            {HOW_IT_WORKS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3 rounded-xl bg-white/10 p-3">
                <Icon className="w-6 h-6 text-accent-400 shrink-0" aria-hidden="true" />
                <span>
                  <span className="block font-semibold text-sm">{title}</span>
                  <span className="block text-xs text-white/75">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Stays in reach while scrolling the catalogue. */}
      <div className="sticky top-16 z-30 bg-canvas/95 backdrop-blur border-b border-line">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center gap-3">
          <div className="flex-1 min-w-0">
            <FilterChips label="Filter by category" options={chips} value={category} onChange={setCategory} />
          </div>
          <div className="flex gap-2">
            <div className="relative flex-1 md:w-64">
              <label htmlFor="shop-search" className="sr-only">Search the shop</label>
              <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input
                id="shop-search"
                type="search"
                className="input-field pl-9 py-2"
                placeholder="Search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <button type="button" className="btn-primary relative shrink-0" onClick={() => setQuery({ cart: 'open' })} aria-label={`Open cart, ${cart.count} items`}>
              <HiShoppingCart className="w-5 h-5" aria-hidden="true" />
              <span className="hidden sm:inline">Cart</span>
              {cart.count > 0 && (
                <span className="absolute -top-2 -right-2 min-w-[1.25rem] h-5 px-1 rounded-full bg-accent-500 text-primary-900 text-xs font-bold flex items-center justify-center">
                  {cart.count}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      <section className="py-10 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {user && (
            <p className="mb-6 text-sm text-muted-fg">
              <Link href="/portal/orders" className="inline-flex items-center gap-1.5 text-primary-500 dark:text-primary-300 font-medium hover:underline">
                <HiClipboardList className="w-4 h-4" aria-hidden="true" /> Track your orders
              </Link>
            </p>
          )}

          {error ? (
            <ErrorState error={error} onRetry={load} />
          ) : loading ? (
            <LoadingRegion label="Loading the shop"><SkeletonGrid count={6} /></LoadingRegion>
          ) : products.length === 0 ? (
            <EmptyState icon={HiShoppingBag} title="The shop is being stocked" description="New EESA merchandise is on its way. Check back soon." />
          ) : visible.length === 0 ? (
            <EmptyState icon={HiSearch} title="Nothing matches" description="Try another category or search term." />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {visible.map((product) => (
                <ProductCard key={product._id} product={product} onOpen={(p) => setQuery({ item: p.slug })} />
              ))}
            </div>
          )}
        </div>
      </section>

      <ProductDialog product={openProduct} onClose={() => setQuery({ item: '' })} onAdd={addToCart} />
      <CartPanel open={cartOpen} onClose={() => setQuery({ cart: '' })} cart={cart} settings={settings} />
    </>
  );
}
