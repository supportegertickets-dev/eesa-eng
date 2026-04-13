'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { uploadResource, getResources, getMyResources, getPendingResources, reviewResource, trackDownload, deleteResource, getResourceFileUrl } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiBookOpen, HiPlus, HiDownload, HiCheckCircle, HiXCircle, HiTrash, HiSearch, HiDocumentText, HiEye, HiX } from 'react-icons/hi';
import { format } from 'date-fns';

const CATEGORIES = ['notes', 'past-papers', 'textbooks', 'tutorials', 'lab-reports', 'other'];

export default function LibraryPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('browse');
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [viewingResource, setViewingResource] = useState(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  useEffect(() => { loadResources(); }, [tab, category]);

  const loadResources = async () => {
    setLoading(true);
    try {
      let data;
      if (tab === 'mine') {
        data = await getMyResources();
      } else if (tab === 'pending' && isAdmin) {
        data = await getPendingResources();
      } else {
        const params = new URLSearchParams();
        if (category) params.set('category', category);
        if (search) params.set('search', search);
        data = await getResources(`?${params.toString()}`);
      }
      setResources(data.resources || data || []);
    } catch { toast.error('Failed to load resources'); }
    finally { setLoading(false); }
  };

  const handleReview = async (id, status, rejectionReason = '') => {
    try {
      await reviewResource(id, { status, rejectionReason });
      toast.success(`Resource ${status}!`);
      loadResources();
    } catch (err) { toast.error(err.message); }
  };

  const handleDownload = async (resource) => {
    try {
      await trackDownload(resource._id);
    } catch {}
    window.open(getResourceFileUrl(resource._id), '_blank');
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this resource?')) return;
    try {
      await deleteResource(id);
      toast.success('Resource deleted');
      loadResources();
    } catch (err) { toast.error(err.message); }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    loadResources();
  };

  const statusBadge = (s) => ({
    pending: 'bg-yellow-100 text-yellow-700',
    approved: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
  }[s] || 'bg-gray-100 text-gray-700');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Library</h1>
          <p className="text-gray-600 text-sm mt-1">Study materials shared by members</p>
        </div>
        <button onClick={() => setShowUpload(!showUpload)} className="btn-primary flex items-center gap-2">
          <HiPlus className="w-4 h-4" /> Upload
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 flex-wrap">
        {[{ key: 'browse', label: 'Browse' }, { key: 'mine', label: 'My Uploads' }, ...(isAdmin ? [{ key: 'pending', label: 'Pending Review' }] : [])].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === t.key ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Search & Filter */}
      {tab === 'browse' && (
        <form onSubmit={handleSearch} className="flex gap-2 mb-4 flex-wrap">
          <div className="relative flex-1 min-w-[200px]">
            <HiSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search resources..." className="input-field pl-9" />
          </div>
          <select value={category} onChange={e => { setCategory(e.target.value); }} className="input-field w-auto">
            <option value="">All Categories</option>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}
          </select>
          <button type="submit" className="btn-primary">Search</button>
        </form>
      )}

      {showUpload && <UploadForm onUploaded={() => { setShowUpload(false); loadResources(); }} onCancel={() => setShowUpload(false)} />}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
      ) : resources.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <HiBookOpen className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No resources found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {resources.map((r) => (
            <div key={r._id} className="card">
              <div className="flex items-start justify-between">
                <div className="flex gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 bg-primary-100 rounded-lg flex items-center justify-center flex-shrink-0">
                    <HiDocumentText className="w-5 h-5 text-primary-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold text-gray-900 truncate">{r.title}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(r.status)}`}>{r.status}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full capitalize">{r.category?.replace('-', ' ')}</span>
                    </div>
                    {r.description && <p className="text-sm text-gray-600 mt-0.5 line-clamp-2">{r.description}</p>}
                    <div className="flex items-center gap-3 text-xs text-gray-400 mt-1">
                      {r.uploadedBy && <span>By {r.uploadedBy.firstName} {r.uploadedBy.lastName}</span>}
                      {r.department && <span>• {r.department}</span>}
                      <span>• {r.downloads || 0} downloads</span>
                      <span>• {format(new Date(r.createdAt), 'MMM d, yyyy')}</span>
                    </div>
                    {r.rejectionReason && <p className="text-xs text-red-500 mt-1">Reason: {r.rejectionReason}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-1 ml-2">
                  {r.status === 'approved' && (
                    <>
                      <button onClick={() => setViewingResource(r)} className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg" title="View">
                        <HiEye className="w-5 h-5" />
                      </button>
                      <button onClick={() => handleDownload(r)} className="p-2 text-primary-500 hover:bg-primary-50 rounded-lg" title="Download">
                        <HiDownload className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {tab === 'pending' && isAdmin && r.status === 'pending' && (
                    <>
                      <button onClick={() => handleReview(r._id, 'approved')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Approve">
                        <HiCheckCircle className="w-5 h-5" />
                      </button>
                      <button onClick={() => {
                        const reason = prompt('Rejection reason:');
                        if (reason) handleReview(r._id, 'rejected', reason);
                      }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Reject">
                        <HiXCircle className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {(r.uploadedBy?._id === user?._id || isAdmin) && (
                    <button onClick={() => handleDelete(r._id)} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                      <HiTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {viewingResource && (
        <ResourceViewer resource={viewingResource} onClose={() => setViewingResource(null)} onDownload={handleDownload} />
      )}
    </div>
  );
}

function ResourceViewer({ resource, onClose, onDownload }) {
  const isPdf = resource.fileType === 'application/pdf';
  const isImage = resource.fileType?.startsWith('image/');
  const isText = resource.fileType === 'text/plain';
  const isOfficeDoc = [
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ].includes(resource.fileType);

  const [blobUrl, setBlobUrl] = useState(null);
  const [textContent, setTextContent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const viewerUrl = isOfficeDoc
    ? `https://docs.google.com/gview?url=${encodeURIComponent(resource.fileUrl)}&embedded=true`
    : null;

  useEffect(() => {
    const handleEsc = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleEsc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  useEffect(() => {
    if (isOfficeDoc) { setLoading(false); return; }
    let revoke = null;
    const fetchFile = async () => {
      try {
        const proxyUrl = getResourceFileUrl(resource._id);
        const resp = await fetch(proxyUrl);
        if (!resp.ok) throw new Error('Failed to load file');
        if (isText) {
          const text = await resp.text();
          setTextContent(text);
        } else {
          const blob = await resp.blob();
          const url = URL.createObjectURL(blob);
          revoke = url;
          setBlobUrl(url);
        }
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchFile();
    return () => { if (revoke) URL.revokeObjectURL(revoke); };
  }, [resource._id, isOfficeDoc]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/70" onClick={onClose}>
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 text-white" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 min-w-0">
          <HiDocumentText className="w-5 h-5 flex-shrink-0" />
          <h3 className="font-semibold truncate">{resource.title}</h3>
          <span className="text-xs bg-white/20 px-2 py-0.5 rounded-full capitalize flex-shrink-0">
            {resource.category?.replace('-', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => onDownload(resource)} className="flex items-center gap-1 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-sm">
            <HiDownload className="w-4 h-4" /> Download
          </button>
          <button onClick={onClose} className="p-1.5 hover:bg-white/20 rounded-lg">
            <HiX className="w-5 h-5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto" onClick={e => e.stopPropagation()}>
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="w-10 h-10 animate-spin rounded-full border-4 border-white border-t-transparent" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-full text-white text-center p-8">
            <p className="text-lg font-medium mb-2">Failed to load file</p>
            <p className="text-gray-400 text-sm mb-6">{error}</p>
            <button onClick={() => onDownload(resource)} className="btn-primary flex items-center gap-2">
              <HiDownload className="w-4 h-4" /> Download instead
            </button>
          </div>
        ) : isPdf ? (
          <iframe src={blobUrl} className="w-full h-full border-0" title={resource.title} />
        ) : isImage ? (
          <div className="flex items-center justify-center min-h-full p-4">
            <img src={blobUrl} alt={resource.title} className="max-w-full max-h-[85vh] object-contain rounded-lg" />
          </div>
        ) : isOfficeDoc ? (
          <iframe src={viewerUrl} className="w-full h-full border-0" title={resource.title} />
        ) : isText ? (
          <pre className="p-6 text-sm text-gray-100 whitespace-pre-wrap font-mono leading-relaxed max-w-4xl mx-auto">{textContent}</pre>
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-white text-center p-8">
            <HiDocumentText className="w-16 h-16 mb-4 text-gray-400" />
            <p className="text-lg font-medium mb-2">Preview not available for this file type</p>
            <p className="text-gray-400 text-sm mb-6">{resource.fileType || 'Unknown type'}</p>
            <button onClick={() => onDownload(resource)} className="btn-primary flex items-center gap-2">
              <HiDownload className="w-4 h-4" /> Download to view
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function UploadForm({ onUploaded, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', category: 'notes', department: '' });
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) { toast.error('Please select a file'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v) fd.append(k, v); });
      fd.append('file', file);
      await uploadResource(fd);
      toast.success('Resource uploaded! Pending admin review.');
      onUploaded();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Upload Resource</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input-field">
            {CATEGORIES.map(c => <option key={c} value={c}>{c.replace('-', ' ')}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
          <input value={form.department} onChange={e => setForm({...form, department: e.target.value})} className="input-field" placeholder="e.g., Electrical Engineering" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">File (PDF, Word, PPT, etc.)</label>
          <input type="file" required onChange={e => setFile(e.target.files[0])} className="text-sm" />
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
