'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { createProduct, deleteProduct, updateProduct } from '@/lib/api';
import { CATEGORIES } from '@/lib/merchandise';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ImageDropzone from '@/components/ui/ImageDropzone';
import Modal from '@/components/ui/Modal';

const MAX_IMAGES = 6;
const SIZE_PRESETS = [
  { label: 'Clothing', sizes: 'S, M, L, XL, XXL' },
  { label: 'Clothing with XS', sizes: 'XS, S, M, L, XL, XXL' },
];

const emptyForm = {
  name: '',
  category: 'apparel',
  price: '',
  stock: '',
  sizes: '',
  colors: '',
  description: '',
  featured: false,
  isActive: true,
};

const toForm = (product) => (product ? {
  name: product.name,
  category: product.category,
  price: String(product.price),
  stock: product.stock == null ? '' : String(product.stock),
  sizes: (product.sizes || []).join(', '),
  colors: (product.colors || []).join(', '),
  description: product.description || '',
  featured: Boolean(product.featured),
  isActive: product.isActive !== false,
} : emptyForm);

/** Add or edit a shop item. `product` null means a new one. */
export default function ProductFormDialog({ open, product, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(emptyForm);
  const [files, setFiles] = useState([]);
  const [removed, setRemoved] = useState([]);
  const [progress, setProgress] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(toForm(product));
    setFiles([]);
    setRemoved([]);
  }, [open, product]);

  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const existing = (product?.images || [])
    .filter((image) => !removed.includes(image._id))
    .map((image) => ({ id: image._id, url: image.url }));

  const busy = progress !== null || deleting;

  const submit = async (event) => {
    event.preventDefault();
    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, String(value)));
    files.forEach((file) => data.append('images', file));
    if (removed.length) data.append('removeImages', JSON.stringify(removed));

    setProgress(0);
    try {
      const result = product
        ? await updateProduct(product._id, data, setProgress)
        : await createProduct(data, setProgress);
      toast.success(product ? 'Product updated.' : 'Product added to the shop.');
      onSaved(result.product);
    } catch (error) {
      toast.error(error.message);
    } finally {
      setProgress(null);
    }
  };

  const remove = async () => {
    setDeleting(true);
    try {
      await deleteProduct(product._id);
      toast.success('Product deleted.');
      setConfirmDelete(false);
      onDeleted(product);
    } catch (error) {
      toast.error(error.message);
      setConfirmDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <Modal
        open={open}
        title={product ? `Edit ${product.name}` : 'Add a product'}
        onClose={onClose}
        busy={busy}
        size="xl"
        closeOnBackdrop={false}
        footer={(
          <>
            {product && (
              <button type="button" className="btn-ghost text-danger sm:mr-auto" onClick={() => setConfirmDelete(true)} disabled={busy}>
                Delete
              </button>
            )}
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
            <button type="submit" form="product-form" className="btn-primary" disabled={busy}>
              {progress !== null ? `Saving… ${progress}%` : product ? 'Save changes' : 'Add product'}
            </button>
          </>
        )}
      >
        <form id="product-form" onSubmit={submit} className="grid gap-5 md:grid-cols-2">
          <div className="md:col-span-2">
            <ImageDropzone
              label="Photos"
              hint="The first photo is the one shown in the shop."
              multiple
              max={MAX_IMAGES}
              value={files}
              onChange={setFiles}
              existing={existing}
              onRemoveExisting={(id) => setRemoved((current) => [...current, id])}
              disabled={busy}
            />
          </div>

          <div>
            <label htmlFor="product-name" className="form-label">Name</label>
            <input id="product-name" className="input-field" required maxLength={120} value={form.name} onChange={set('name')} placeholder="EESA Hoodie" />
          </div>
          <div>
            <label htmlFor="product-category" className="form-label">Category</label>
            <select id="product-category" className="input-field" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="product-price" className="form-label">Price (KES)</label>
            <input id="product-price" type="number" min="1" step="1" inputMode="numeric" className="input-field" required value={form.price} onChange={set('price')} placeholder="1500" />
          </div>
          <div>
            <label htmlFor="product-stock" className="form-label">Stock</label>
            <input id="product-stock" type="number" min="0" step="1" inputMode="numeric" className="input-field" value={form.stock} onChange={set('stock')} placeholder="Leave empty if you do not count it" />
            <p className="form-hint">Orders take from this and cancelled orders return to it. At 0 the item shows as sold out.</p>
          </div>
          <div>
            <label htmlFor="product-sizes" className="form-label">Sizes</label>
            <input id="product-sizes" className="input-field" value={form.sizes} onChange={set('sizes')} placeholder="S, M, L, XL" />
            <div className="flex flex-wrap gap-2 mt-2">
              {SIZE_PRESETS.map((preset) => (
                <button key={preset.label} type="button" className="badge-neutral hover:bg-muted-strong" onClick={() => setForm((current) => ({ ...current, sizes: preset.sizes }))}>
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="product-colors" className="form-label">Colours</label>
            <input id="product-colors" className="input-field" value={form.colors} onChange={set('colors')} placeholder="Maroon, Black" />
            <p className="form-hint">Separate with commas. Leave empty if there is only one.</p>
          </div>
          <div className="md:col-span-2">
            <label htmlFor="product-description" className="form-label">Description</label>
            <textarea id="product-description" className="input-field" rows={3} maxLength={2000} value={form.description} onChange={set('description')} placeholder="Material, fit, what is printed on it" />
          </div>
          <div className="md:col-span-2 flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm font-medium text-body">
              <input type="checkbox" className="rounded border-line-strong" checked={form.isActive} onChange={set('isActive')} />
              Show in the shop
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-body">
              <input type="checkbox" className="rounded border-line-strong" checked={form.featured} onChange={set('featured')} />
              Feature at the top
            </label>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={confirmDelete}
        title={`Delete ${product?.name}?`}
        description="This removes the product and its photos. Products that have been ordered cannot be deleted; hide them from the shop instead."
        confirmLabel="Delete product"
        busy={deleting}
        onConfirm={remove}
        onCancel={() => setConfirmDelete(false)}
      />
    </>
  );
}
