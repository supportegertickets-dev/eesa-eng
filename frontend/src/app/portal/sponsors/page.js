'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getSponsors, createSponsor, updateSponsor, deleteSponsor } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiPlus, HiTrash, HiPencil, HiExternalLink, HiStar } from 'react-icons/hi';

const TIERS = ['platinum', 'gold', 'silver', 'bronze', 'partner'];
const TIER_COLORS = {
  platinum: 'bg-muted-strong text-strong',
  gold: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
  silver: 'bg-muted text-body',
  bronze: 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300',
  partner: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
};

export default function SponsorsManagePage() {
  const { user } = useAuth();
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const isAdmin = ['admin', 'chairperson'].includes(user?.role);

  useEffect(() => { loadSponsors(); }, []);

  const loadSponsors = async () => {
    try {
      const data = await getSponsors();
      setSponsors(data.sponsors || data || []);
    } catch { toast.error('Failed to load sponsors'); }
    finally { setLoading(false); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Delete this sponsor?')) return;
    try {
      await deleteSponsor(id);
      toast.success('Sponsor deleted');
      setSponsors(prev => prev.filter(s => s._id !== id));
    } catch (err) { toast.error(err.message); }
  };

  if (!isAdmin) {
    return (
      <div>
        <h1 className="font-heading text-2xl font-bold text-strong mb-6">Our Sponsors</h1>
        {loading ? (
          <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
        ) : sponsors.length === 0 ? (
          <p className="text-subtle text-center py-12">No sponsors to display</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
            {sponsors.map(s => (
              <div key={s._id} className="card text-center">
                {s.logo ? (
                  <img src={s.logo} alt={s.name} className="w-20 h-20 object-contain mx-auto mb-3" />
                ) : (
                  <div className="w-20 h-20 bg-muted rounded-full mx-auto mb-3 flex items-center justify-center">
                    <HiStar className="w-8 h-8 text-gray-300" />
                  </div>
                )}
                <p className="font-semibold text-strong">{s.name}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize mt-1 inline-block ${TIER_COLORS[s.tier]}`}>{s.tier}</span>
                {s.website && (
                  <a href={s.website} target="_blank" rel="noopener noreferrer" className="text-primary-500 dark:text-primary-300 text-xs hover:underline flex items-center justify-center gap-1 mt-2">
                    Visit <HiExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-strong">Manage Sponsors</h1>
          <p className="text-muted-fg text-sm mt-1">Add and manage EESA sponsors</p>
        </div>
        <button onClick={() => { setEditing(null); setShowForm(!showForm); }} className="btn-primary flex items-center gap-2">
          <HiPlus className="w-4 h-4" /> Add Sponsor
        </button>
      </div>

      {showForm && (
        <SponsorForm
          sponsor={editing}
          onSaved={() => { setShowForm(false); setEditing(null); loadSponsors(); }}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
      ) : sponsors.length === 0 ? (
        <div className="card text-center py-12 text-subtle">
          <HiStar className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No sponsors yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sponsors.map((s) => (
            <div key={s._id} className="card flex items-center gap-4">
              {s.logo ? (
                <img src={s.logo} alt={s.name} className="w-14 h-14 object-contain rounded-lg bg-canvas p-1" />
              ) : (
                <div className="w-14 h-14 bg-muted rounded-lg flex items-center justify-center">
                  <HiStar className="w-6 h-6 text-gray-300" />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-strong">{s.name}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium capitalize ${TIER_COLORS[s.tier]}`}>{s.tier}</span>
                  {!s.isActive && <span className="text-xs bg-red-100 dark:bg-red-500/15 text-red-600 dark:text-red-300 px-2 py-0.5 rounded-full">Inactive</span>}
                </div>
                {s.description && <p className="text-sm text-muted-fg truncate">{s.description}</p>}
                {s.website && <p className="text-xs text-primary-500 dark:text-primary-300 truncate">{s.website}</p>}
              </div>
              <div className="flex gap-1">
                <button onClick={() => { setEditing(s); setShowForm(true); }} className="p-2 text-subtle hover:text-primary-500 dark:hover:text-primary-200 hover:bg-primary-50 dark:hover:bg-primary-500/10 rounded-lg">
                  <HiPencil className="w-4 h-4" />
                </button>
                <button onClick={() => handleDelete(s._id)} className="p-2 text-faint hover:text-red-600 dark:hover:text-red-200 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg">
                  <HiTrash className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SponsorForm({ sponsor, onSaved, onCancel }) {
  const [form, setForm] = useState({
    name: sponsor?.name || '',
    website: sponsor?.website || '',
    description: sponsor?.description || '',
    tier: sponsor?.tier || 'partner',
    isActive: sponsor?.isActive ?? true,
  });
  const [logo, setLogo] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (logo) fd.append('logo', logo);

      if (sponsor) {
        await updateSponsor(sponsor._id, fd);
        toast.success('Sponsor updated!');
      } else {
        await createSponsor(fd);
        toast.success('Sponsor added!');
      }
      onSaved();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200 dark:border-primary-500/30">
      <h3 className="font-semibold text-lg mb-4">{sponsor ? 'Edit' : 'Add'} Sponsor</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-body mb-1">Name</label>
          <input required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Tier</label>
          <select value={form.tier} onChange={e => setForm({...form, tier: e.target.value})} className="input-field">
            {TIERS.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Website</label>
          <input type="url" value={form.website} onChange={e => setForm({...form, website: e.target.value})} className="input-field" placeholder="https://..." />
        </div>
        <div>
          <label className="block text-sm font-medium text-body mb-1">Logo</label>
          <input type="file" accept="image/*" onChange={e => setLogo(e.target.files[0])} className="text-sm" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-body mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
        </div>
        <div>
          <label className="flex items-center gap-2 text-sm font-medium text-body">
            <input type="checkbox" checked={form.isActive} onChange={e => setForm({...form, isActive: e.target.checked})} className="rounded border-line-strong" />
            Active
          </label>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          {sponsor ? 'Update' : 'Add'}
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-muted-fg hover:text-strong">Cancel</button>
      </div>
    </form>
  );
}
