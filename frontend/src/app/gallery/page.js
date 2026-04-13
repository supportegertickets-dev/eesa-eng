'use client';

import { useState, useEffect } from 'react';
import { getGalleryImages } from '@/lib/api';
import { HiPhotograph, HiX } from 'react-icons/hi';

const CATEGORIES = ['events', 'projects', 'campus', 'workshops', 'competitions', 'social', 'other'];

export default function PublicGalleryPage() {
  const [images, setImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedImg, setSelectedImg] = useState(null);
  const [category, setCategory] = useState('');

  useEffect(() => { loadImages(); }, [category]);

  const loadImages = async () => {
    setLoading(true);
    try {
      const params = category ? `?category=${category}` : '';
      const data = await getGalleryImages(params);
      setImages(data.images || data || []);
    } catch { console.error('Failed to load gallery'); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero */}
      <div className="bg-primary-500 text-white py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl font-bold mb-3">Gallery</h1>
          <p className="text-white/80 text-lg max-w-2xl mx-auto">Memories and moments from EESA events and activities</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Category filter */}
        <div className="flex gap-2 mb-8 flex-wrap justify-center">
          <button onClick={() => setCategory('')} className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${!category ? 'bg-primary-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 shadow-sm'}`}>All</button>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => setCategory(c)} className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${category === c ? 'bg-primary-500 text-white' : 'bg-white text-gray-700 hover:bg-gray-100 shadow-sm'}`}>
              {c}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-20"><div className="w-10 h-10 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
        ) : images.length === 0 ? (
          <div className="text-center py-20 text-gray-500">
            <HiPhotograph className="w-16 h-16 mx-auto mb-4 text-gray-300" />
            <p className="text-lg">No photos yet</p>
          </div>
        ) : (
          <div className="columns-2 sm:columns-3 lg:columns-4 gap-4 space-y-4">
            {images.map((img) => (
              <div key={img._id} className="break-inside-avoid group cursor-pointer" onClick={() => setSelectedImg(img)}>
                <div className="relative rounded-xl overflow-hidden shadow-sm hover:shadow-lg transition-shadow">
                  <img src={img.imageUrl} alt={img.title} className="w-full group-hover:scale-105 transition-transform duration-300" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                    <div className="absolute bottom-0 left-0 right-0 p-4">
                      <p className="text-white font-medium">{img.title}</p>
                      <p className="text-white/70 text-sm capitalize">{img.category}</p>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selectedImg && (
        <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4" onClick={() => setSelectedImg(null)}>
          <button className="absolute top-6 right-6 text-white/80 hover:text-white p-2" onClick={() => setSelectedImg(null)}>
            <HiX className="w-8 h-8" />
          </button>
          <div className="max-w-5xl max-h-[90vh] w-full" onClick={e => e.stopPropagation()}>
            <img src={selectedImg.imageUrl} alt={selectedImg.title} className="w-full max-h-[80vh] object-contain rounded-lg" />
            <div className="text-center mt-4">
              <p className="text-white text-xl font-medium">{selectedImg.title}</p>
              {selectedImg.description && <p className="text-white/60 mt-1">{selectedImg.description}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
