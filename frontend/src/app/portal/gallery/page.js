'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getGalleryImages, uploadGalleryImage, deleteGalleryImage } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiPhotograph, HiPlus, HiTrash, HiX } from 'react-icons/hi';

const CATEGORIES = ['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other'];

export default function PortalGalleryPage() {
  const { user } = useAuth();
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [selectedImg, setSelectedImg] = useState(null);
  const [category, setCategory] = useState('');
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  useEffect(() => { loadImages(); }, [category]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const params = category ? `?category=${category}` : '';
      const data = await getGalleryImages(params);
      setImages(data.images || data || []);
    } catch { toast.error('Failed to load gallery'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this image?')) return;
    try {
      await deleteGalleryImage(id);
      toast.success('Image deleted');
      setImages(prev => prev.filter(i => i._id !== id));
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Gallery</h1>
          <p className="text-gray-600 text-sm mt-1">EESA photos and memories</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowUpload(!showUpload)} className="btn-primary flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> Upload
          </button>
        )}
      </div>

      {/* Category filter */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button onClick={() => setCategory('')} className={`px-3 py-1.5 rounded-full text-sm font-medium ${!category ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>All</button>
        {CATEGORIES.map(c => (
          <button key={c} onClick={() => setCategory(c)} className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${category === c ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {c}
          </button>
        ))}
      </div>

      {showUpload && <UploadGalleryForm onUploaded={() => { setShowUpload(false); loadImages(); }} onCancel={() => setShowUpload(false)} />}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
      ) : images.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <HiPhotograph className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No images in the gallery</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img._id} className="group relative rounded-lg overflow-hidden cursor-pointer bg-gray-100 aspect-square" onClick={() => setSelectedImg(img)}>
              <img src={img.imageUrl} alt={img.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white text-sm font-medium truncate">{img.title}</p>
                  <p className="text-white/70 text-xs capitalize">{img.category}</p>
                </div>
              </div>
              {isAdmin && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(img._id); }}
                  className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <HiTrash className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {selectedImg && (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={() => setSelectedImg(null)}>
          <button className="absolute top-4 right-4 text-white p-2" onClick={() => setSelectedImg(null)}>
            <HiX className="w-6 h-6" />
          </button>
          <div className="max-w-4xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <img src={selectedImg.imageUrl} alt={selectedImg.title} className="w-full max-h-[80vh] object-contain rounded-lg" />
            <div className="text-center mt-3">
              <p className="text-white text-lg font-medium">{selectedImg.title}</p>
              {selectedImg.description && <p className="text-white/70 text-sm mt-1">{selectedImg.description}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function UploadGalleryForm({ onUploaded, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'events' });
  const [image, setImage] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!image) { toast.error('Please select an image'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      fd.append('image', image);
      await uploadGalleryImage(fd);
      toast.success('Image uploaded!');
      onUploaded();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Upload Image</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input-field">
            {CATEGORIES.map(c => <option key={c} value={c} className="capitalize">{c}</option>)}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Image</label>
          <input type="file" required accept="image/*" onChange={e => setImage(e.target.files[0])} className="text-sm" />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Upload
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}
