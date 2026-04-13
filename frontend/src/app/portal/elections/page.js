'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getElections, getElection, createElection, deleteElection, updateElection, registerCandidate, updateCandidate, removeCandidate, castVote, getUsers } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiClipboardList, HiPlus, HiCheckCircle, HiClock, HiX, HiChevronDown, HiChevronUp, HiUser, HiTrash, HiPencil, HiPhotograph } from 'react-icons/hi';
import { format } from 'date-fns';

export default function ElectionsPage() {
  const { user } = useAuth();
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  const [showCreate, setShowCreate] = useState(false);
  const [showApply, setShowApply] = useState(null);
  const [voting, setVoting] = useState(null);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const isAdmin = ['admin', 'chairperson'].includes(user?.role);

  useEffect(() => { loadElections(); }, []);

  const loadElections = async () => {
    try {
      const data = await getElections();
      setElections(data.elections || data || []);
    } catch { toast.error('Failed to load elections'); }
    finally { setLoading(false); }
  };

  const handleVote = async (electionId, candidateId) => {
    setVoting(candidateId);
    try {
      await castVote(electionId, candidateId);
      toast.success('Vote cast successfully!');
      loadElections();
    } catch (err) { toast.error(err.message); }
    finally { setVoting(null); }
  };



  const handleDeleteElection = async (id) => {
    if (!confirm('Are you sure you want to delete this election?')) return;
    try {
      await deleteElection(id);
      toast.success('Election deleted');
      loadElections();
    } catch (err) { toast.error(err.message); }
  };

  const handleRemoveCandidate = async (electionId, candidateId, name) => {
    if (!confirm(`Remove candidate ${name}?`)) return;
    try {
      await removeCandidate(electionId, candidateId);
      toast.success('Candidate removed');
      loadElections();
    } catch (err) { toast.error(err.message); }
  };

  const handleCandidatePhoto = async (electionId, candidateId) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const fd = new FormData();
        fd.append('photo', file);
        await updateCandidate(electionId, candidateId, fd);
        toast.success('Photo updated');
        loadElections();
      } catch (err) { toast.error(err.message); }
    };
    input.click();
  };

  const handleStatusChange = async (electionId, newStatus) => {
    try {
      await updateElection(electionId, { status: newStatus });
      toast.success(`Election ${newStatus}`);
      loadElections();
    } catch (err) { toast.error(err.message); }
  };

  const statusColor = (s) =>
    s === 'active' ? 'bg-green-100 text-green-700' :
    s === 'completed' ? 'bg-gray-100 text-gray-700' :
    'bg-yellow-100 text-yellow-700';

  if (loading) return <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Elections</h1>
          <p className="text-gray-600 text-sm mt-1">Vote, run for office, and view results</p>
        </div>
        {isAdmin && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> New Election
          </button>
        )}
      </div>

      {showCreate && <CreateElectionForm onCreated={() => { setShowCreate(false); loadElections(); }} onCancel={() => setShowCreate(false)} />}

      {elections.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <HiClipboardList className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No elections at the moment</p>
        </div>
      ) : (
        <div className="space-y-4">
          {elections.map((election) => (
            <div key={election._id} className="card">
              <div className="flex items-start justify-between cursor-pointer" onClick={() => {
                setExpandedId(expandedId === election._id ? null : election._id);

              }}>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-semibold text-lg text-gray-900">{election.title}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor(election.status)}`}>{election.status}</span>
                  </div>
                  {election.description && <p className="text-gray-600 text-sm">{election.description}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    {election.startDate && format(new Date(election.startDate), 'MMM d, yyyy')} — {election.endDate && format(new Date(election.endDate), 'MMM d, yyyy')}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {isAdmin && (
                    <>
                      <select
                        value={election.status}
                        onClick={(e) => e.stopPropagation()}
                        onChange={(e) => { e.stopPropagation(); handleStatusChange(election._id, e.target.value); }}
                        className="text-xs border rounded px-2 py-1 text-gray-600 bg-white"
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteElection(election._id); }} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg" title="Delete election">
                        <HiTrash className="w-4 h-4" />
                      </button>
                    </>
                  )}
                  {expandedId === election._id ? <HiChevronUp className="w-5 h-5 text-gray-400" /> : <HiChevronDown className="w-5 h-5 text-gray-400" />}
                </div>
              </div>

              {expandedId === election._id && (
                <div className="mt-4 pt-4 border-t">
                  {/* Positions */}
                  <p className="text-sm font-medium text-gray-700 mb-2">Positions: {election.positions?.join(', ')}</p>

                  {/* Candidates */}
                  {election.candidates?.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-3">
                      {election.candidates.map((c) => (
                        <div key={c._id} className="border rounded-xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-shadow relative group">
                          {/* Admin controls */}
                          {isAdmin && (
                            <div className="absolute top-2 right-2 z-10 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => handleCandidatePhoto(election._id, c._id)} className="p-1.5 bg-white/90 backdrop-blur border rounded-lg shadow-sm text-blue-500 hover:bg-blue-50" title="Upload/change photo">
                                <HiPhotograph className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleRemoveCandidate(election._id, c._id, `${c.user?.firstName} ${c.user?.lastName}`)} className="p-1.5 bg-white/90 backdrop-blur border rounded-lg shadow-sm text-red-500 hover:bg-red-50" title="Remove candidate">
                                <HiTrash className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {/* Candidate Photo */}
                          <div className="w-full aspect-[3/4] bg-gradient-to-b from-primary-100 to-primary-50 flex items-center justify-center overflow-hidden">
                            {c.photo ? (
                              <img src={c.photo} alt={`${c.user?.firstName} ${c.user?.lastName}`} className="w-full h-full object-cover" />
                            ) : (
                              <div className="flex flex-col items-center text-gray-400">
                                <HiUser className="w-16 h-16" />
                                <span className="text-xs mt-1">No Photo</span>
                              </div>
                            )}
                          </div>
                          {/* Candidate Info */}
                          <div className="p-4 text-center">
                            <p className="font-bold text-gray-900 text-lg">{c.user?.firstName} {c.user?.lastName}</p>
                            <p className="text-primary-600 font-semibold text-sm mt-0.5">{c.position}</p>
                            {c.user?.department && <p className="text-xs text-gray-400 mt-0.5">{c.user.department}</p>}
                            {c.manifesto && (
                              <p className="text-sm text-gray-600 mt-2 line-clamp-3 italic">&ldquo;{c.manifesto}&rdquo;</p>
                            )}
                          
                            {election.status === 'active' && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleVote(election._id, c._id); }}
                                disabled={voting === c._id}
                                className="mt-3 w-full btn-primary text-sm py-2 disabled:opacity-50 flex items-center justify-center gap-2"
                              >
                                {voting === c._id ? (
                                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                                ) : <HiCheckCircle className="w-4 h-4" />}
                                Vote
                              </button>
                            )}

                            {election.status === 'completed' && (
                              <p className="text-lg font-bold text-primary-600 mt-2">{c.votes?.length || 0} votes</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No candidates registered yet</p>
                  )}

                  {/* Admin: Register Candidate */}
                  {election.status === 'upcoming' && isAdmin && (
                    <div className="mt-4">
                      {showApply === election._id ? (
                        <RegisterCandidateForm electionId={election._id} positions={election.positions || []} existingCandidateUserIds={election.candidates?.map(c => c.user?._id) || []} onDone={() => { setShowApply(null); loadElections(); }} onCancel={() => setShowApply(null)} />
                      ) : (
                        <button onClick={() => setShowApply(election._id)} className="btn-primary text-sm flex items-center gap-2">
                          <HiPlus className="w-4 h-4" /> Register Candidate
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CreateElectionForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', positions: '', startDate: '', endDate: '' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createElection({
        ...form,
        positions: form.positions.split(',').map(p => p.trim()).filter(Boolean),
      });
      toast.success('Election created!');
      onCreated();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Create Election</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Positions (comma-separated)</label>
          <input required placeholder="President, Vice President, Secretary" value={form.positions} onChange={e => setForm({...form, positions: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
          <input type="datetime-local" required value={form.startDate} onChange={e => setForm({...form, startDate: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
          <input type="datetime-local" required value={form.endDate} onChange={e => setForm({...form, endDate: e.target.value})} className="input-field" />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Create
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}

function RegisterCandidateForm({ electionId, positions, existingCandidateUserIds, onDone, onCancel }) {
  const [position, setPosition] = useState(positions[0] || '');
  const [manifesto, setManifesto] = useState('');
  const [photo, setPhoto] = useState(null);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [members, setMembers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const loadMembers = async () => {
      setLoadingMembers(true);
      try {
        const data = await getUsers('?limit=50');
        const allMembers = data.users || data || [];
        setMembers(allMembers.filter(m => !existingCandidateUserIds.includes(m._id)));
      } catch { toast.error('Failed to load members'); }
      finally { setLoadingMembers(false); }
    };
    loadMembers();
  }, []);

  const filteredMembers = members.filter(m => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return `${m.firstName} ${m.lastName}`.toLowerCase().includes(q) ||
           m.department?.toLowerCase().includes(q);
  });

  const handlePhotoChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setPhoto(file);
      setPhotoPreview(URL.createObjectURL(file));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selectedUser) { toast.error('Please select a member'); return; }
    if (!photo) { toast.error('Please upload a candidate photo'); return; }
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('userId', selectedUser._id);
      fd.append('position', position);
      fd.append('manifesto', manifesto);
      fd.append('photo', photo);
      await registerCandidate(electionId, fd);
      toast.success(`${selectedUser.firstName} ${selectedUser.lastName} registered as candidate!`);
      onDone();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-xl p-5 border-2 border-primary-200">
      <h4 className="font-semibold text-lg mb-4">Register Candidate</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Member Selection */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Select Member *</label>
          {selectedUser ? (
            <div className="flex items-center gap-3 p-3 bg-white border-2 border-primary-300 rounded-lg">
              <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                {selectedUser.avatar ? (
                  <img src={selectedUser.avatar} alt="" className="w-full h-full object-cover" />
                ) : (
                  <HiUser className="w-5 h-5 text-primary-500" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-gray-900">{selectedUser.firstName} {selectedUser.lastName}</p>
                <p className="text-xs text-gray-500">{selectedUser.department} {selectedUser.yearOfStudy ? `• Year ${selectedUser.yearOfStudy}` : ''}</p>
              </div>
              <button type="button" onClick={() => setSelectedUser(null)} className="p-1 text-gray-400 hover:text-red-500">
                <HiX className="w-5 h-5" />
              </button>
            </div>
          ) : (
            <div>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search members by name or department..."
                className="input-field mb-2"
              />
              <div className="max-h-48 overflow-y-auto border rounded-lg bg-white">
                {loadingMembers ? (
                  <div className="flex justify-center py-4"><div className="w-5 h-5 animate-spin rounded-full border-2 border-primary-500 border-t-transparent" /></div>
                ) : filteredMembers.length === 0 ? (
                  <p className="text-sm text-gray-500 text-center py-4">No members found</p>
                ) : (
                  filteredMembers.map(m => (
                    <button
                      key={m._id}
                      type="button"
                      onClick={() => { setSelectedUser(m); setSearchQuery(''); }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-primary-50 text-left border-b last:border-b-0 transition-colors"
                    >
                      <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {m.avatar ? (
                          <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <HiUser className="w-4 h-4 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{m.firstName} {m.lastName}</p>
                        <p className="text-xs text-gray-500">{m.department}</p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Position */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Position *</label>
          <select value={position} onChange={e => setPosition(e.target.value)} className="input-field">
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>

        {/* Photo Upload */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Candidate Photo *</label>
          <div className="flex items-center gap-3">
            {photoPreview ? (
              <div className="relative">
                <img src={photoPreview} alt="Preview" className="w-16 h-16 rounded-lg object-cover border" />
                <button type="button" onClick={() => { setPhoto(null); setPhotoPreview(null); if (fileRef.current) fileRef.current.value = ''; }} className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs">×</button>
              </div>
            ) : null}
            <button type="button" onClick={() => fileRef.current?.click()} className="px-3 py-2 text-sm border-2 border-dashed border-gray-300 rounded-lg hover:border-primary-400 hover:bg-primary-50 transition-colors flex items-center gap-2">
              <HiPhotograph className="w-4 h-4" /> {photo ? 'Change' : 'Upload Photo'}
            </button>
            <input type="file" accept="image/*" ref={fileRef} onChange={handlePhotoChange} className="hidden" />
          </div>
        </div>

        {/* Manifesto */}
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Manifesto</label>
          <textarea value={manifesto} onChange={e => setManifesto(e.target.value)} className="input-field" rows={3} placeholder="Candidate's manifesto or campaign message..." />
        </div>
      </div>

      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting || !selectedUser || !photo} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Register Candidate
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}
