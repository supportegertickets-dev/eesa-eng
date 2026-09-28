'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HiCash, HiChevronRight, HiClipboardCheck, HiExternalLink, HiLocationMarker, HiPlus, HiSearch, HiShoppingBag, HiTag } from 'react-icons/hi';
import { getAllOrders, getOrder, getProducts, getShopSummary } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { isMerchandise } from '@/lib/roles';
import { formatDate } from '@/lib/dates';
import { ORDER_STATUS, formatKES, paymentState } from '@/lib/merchandise';
import OrderManageDialog from '@/components/merchandise/OrderManageDialog';
import ProductCard from '@/components/merchandise/ProductCard';
import ProductFormDialog from '@/components/merchandise/ProductFormDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonGrid, SkeletonList } from '@/components/ui/Skeleton';

const ORDER_FILTERS = [
  { id: 'review', label: 'Payments to check' },
  { id: 'paid', label: 'To prepare' },
  { id: 'ready', label: 'Awaiting collection' },
  { id: 'awaiting_payment', label: 'Unpaid' },
  { id: 'collected', label: 'Collected' },
  { id: 'cancelled', label: 'Cancelled' },
  { id: '', label: 'All' },
];

export default function ManageMerchandisePage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('orders');
  const [summary, setSummary] = useState(null);

  const loadSummary = useCallback(() => {
    getShopSummary().then(setSummary).catch(() => {});
  }, []);

  useEffect(() => { loadSummary(); }, [loadSummary]);

  if (!isMerchandise(user?.role)) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">The shop is managed by the treasurer, the chairperson and administrators.</p>
      </div>
    );
  }

  const tiles = [
    { label: 'Payments to check', value: summary?.review, icon: HiClipboardCheck, tone: 'text-warning' },
    { label: 'Paid, to prepare', value: summary?.paid, icon: HiShoppingBag, tone: 'text-info' },
    { label: 'Awaiting collection', value: summary?.ready, icon: HiLocationMarker, tone: 'text-success' },
    { label: 'Takings', value: summary ? formatKES(summary.revenue) : undefined, icon: HiCash, tone: 'text-primary-500 dark:text-primary-300' },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
        <div>
          <p className="text-primary-600 dark:text-primary-300 text-sm font-semibold uppercase tracking-wide">Shop</p>
          <h1 className="page-title mt-1">Merchandise</h1>
          <p className="text-muted-fg mt-1">Products in the shop and the orders members place.</p>
        </div>
        <Link href="/merchandise" className="btn-ghost" target="_blank">
          <HiExternalLink className="w-4 h-4" aria-hidden="true" /> View the shop
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {tiles.map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="card p-4">
            <Icon className={`w-5 h-5 ${tone}`} aria-hidden="true" />
            <p className="mt-2 text-2xl font-bold text-strong tabular-nums">{value ?? '—'}</p>
            <p className="text-xs text-subtle">{label}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Shop sections" className="flex gap-2 mb-5">
        {[{ id: 'orders', label: 'Orders' }, { id: 'products', label: 'Products' }].map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === item.id ? 'bg-primary-500 text-white' : 'bg-muted text-body hover:bg-muted-strong'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'orders' ? <Orders onChanged={loadSummary} /> : <Products onChanged={loadSummary} />}
    </div>
  );
}

function Orders({ onChanged }) {
  const [status, setStatus] = useState('review');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '20' });
      if (status) params.set('status', status);
      if (query) params.set('search', query);
      setData(await getAllOrders(`?${params}`));
    } catch (err) {
      setError(err);
    }
  }, [status, query, page]);

  useEffect(() => { load(); }, [load]);

  // The list carries only the buyer; the dialog needs the full history.
  const open = async (order) => {
    setSelected(order);
    try {
      setSelected((await getOrder(order._id)).order);
    } catch {
      // The summary from the list is enough to work with.
    }
  };

  const changed = (order) => {
    setSelected(order);
    load();
    onChanged();
  };

  const chips = ORDER_FILTERS.map((filter) => ({
    ...filter,
    count: filter.id ? data?.counts?.[filter.id] : undefined,
  }));

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <FilterChips label="Show orders" options={chips} value={status} onChange={(id) => { setStatus(id); setPage(1); }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }} className="relative lg:w-72" role="search">
          <label htmlFor="order-search" className="sr-only">Search orders</label>
          <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input id="order-search" type="search" className="input-field pl-9 py-2" placeholder="Order number, code or name" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingRegion label="Loading orders"><SkeletonList count={4} /></LoadingRegion>
      ) : data.orders.length === 0 ? (
        <EmptyState
          icon={HiShoppingBag}
          title={status === 'review' ? 'No payments to check' : 'No orders here'}
          description={status === 'review' ? 'M-Pesa codes members send for their orders will appear here.' : undefined}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {data.orders.map((order) => {
              const buyer = order.user || {};
              const count = order.items.reduce((sum, item) => sum + item.quantity, 0);
              const payment = paymentState(order);
              return (
                <li key={order._id}>
                  <button type="button" onClick={() => open(order)} className="card p-4 w-full text-left flex items-center gap-4 hover:shadow-raised transition-shadow">
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-mono font-semibold text-strong">{order.orderNumber}</span>
                        <span className={ORDER_STATUS[order.status]?.badge}>{ORDER_STATUS[order.status]?.label}</span>
                        {order.status === 'awaiting_payment' && <span className={payment.badge}>{payment.label}</span>}
                      </span>
                      <span className="block text-sm text-body mt-1 truncate">
                        {[buyer.firstName, buyer.lastName].filter(Boolean).join(' ') || 'Deleted member'}
                        {order.payment?.reference && <span className="text-subtle"> · code <span className="font-mono">{order.payment.reference}</span></span>}
                      </span>
                      <span className="block text-xs text-subtle mt-0.5 truncate">
                        {count} {count === 1 ? 'item' : 'items'}: {order.items.map((item) => `${item.name}${item.size ? ` (${item.size})` : ''}`).join(', ')}
                      </span>
                    </span>
                    <span className="text-right shrink-0">
                      <span className="block font-semibold text-strong tabular-nums">{formatKES(order.total)}</span>
                      <span className="block text-xs text-subtle">{formatDate(order.createdAt)}</span>
                    </span>
                    <HiChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
                  </button>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <OrderManageDialog order={selected} onClose={() => setSelected(null)} onChanged={changed} />
    </div>
  );
}

function Products({ onChanged }) {
  const [products, setProducts] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(undefined); // undefined: closed; null: new product

  const load = useCallback(async () => {
    setError(null);
    try {
      setProducts((await getProducts('?all=true')).products || []);
    } catch (err) {
      setError(err);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const saved = () => { setEditing(undefined); load(); onChanged(); };

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-muted-fg">{products ? `${products.length} ${products.length === 1 ? 'product' : 'products'}` : ''}</p>
        <button type="button" className="btn-primary" onClick={() => setEditing(null)}>
          <HiPlus className="w-4 h-4" aria-hidden="true" /> Add product
        </button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !products ? (
        <LoadingRegion label="Loading products"><SkeletonGrid count={3} /></LoadingRegion>
      ) : products.length === 0 ? (
        <EmptyState icon={HiTag} title="No products yet" description="Add the first item to open the shop." action="Add product" onAction={() => setEditing(null)} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
          {products.map((product) => (
            <div key={product._id} className="relative">
              <ProductCard product={product} onOpen={setEditing} />
              {product.stock != null && (
                <span className="absolute bottom-4 right-4 text-xs text-subtle tabular-nums">{product.stock} in stock</span>
              )}
            </div>
          ))}
        </div>
      )}

      <ProductFormDialog
        open={editing !== undefined}
        product={editing || null}
        onClose={() => setEditing(undefined)}
        onSaved={saved}
        onDeleted={saved}
      />
    </div>
  );
}
