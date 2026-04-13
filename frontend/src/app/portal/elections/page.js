'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getElections, getElection, createElection, deleteElection, updateElection, registerCandidate, updateCandidate, removeCandidate, castVote, getElectionResults } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiClipboardList, HiPlus, HiCheckCircle, HiClock, HiX, HiChevronDown, HiChevronUp, HiUser, HiTrash, HiPencil, HiPhotograph } from 'react-icons/hi';
import { format } from 'date-fns';

export default function ElectionsPage() {
  const { user } = useAuth();
  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [results, setResults] = useState({});
  const [showCreate, setShowCreate] = useState(false);
  const [showApply, setShowApply] = useState(null);
  const [voting, setVoting] = useState(null);
  const [editingCandidate, setEditingCandidate] = useState(null);
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

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

  const viewResults = async (electionId) => {
    try {
      const data = await getElectionResults(electionId);
      setResults(prev => ({ ...prev, [electionId]: data.results || data }));
    } catch { toast.error('Failed to load results'); }
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
                if (election.status === 'completed' && !results[election._id]) viewResults(election._id);
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
                        <div key={c._id} className="border rounded-lg p-4 text-center relative group">
                          {/* Admin controls */}
                          {isAdmin && (
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                              <button onClick={() => handleCandidatePhoto(election._id, c._id)} className="p-1.5 bg-white border rounded-lg shadow-sm text-blue-500 hover:bg-blue-50" title="Upload/change photo">
                                <HiPhotograph className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleRemoveCandidate(election._id, c._id, `${c.user?.firstName} ${c.user?.lastName}`)} className="p-1.5 bg-white border rounded-lg shadow-sm text-red-500 hover:bg-red-50" title="Remove candidate">
                                <HiTrash className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {c.photo ? (
                            <img src={c.photo} alt={c.user?.firstName || 'Candidate'} className="w-20 h-20 rounded-full mx-auto mb-2 object-cover" />
                          ) : (
                            <div className="w-20 h-20 rounded-full mx-auto mb-2 bg-gray-200 flex items-center justify-center">
                              <HiUser className="w-8 h-8 text-gray-400" />
                            </div>
                          )}
                          <p className="font-semibold text-gray-900">{c.user?.firstName} {c.user?.lastName}</p>
                          <p className="text-xs text-primary-500 font-medium">{c.position}</p>
                          {c.manifesto && <p className="text-xs text-gray-500 mt-1 line-clamp-3">{c.manifesto}</p>}
                          
                          {election.status === 'active' && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleVote(election._id, c._id); }}
                              disabled={voting === c._id}
                              className="mt-3 btn-primary text-xs py-1.5 px-4 disabled:opacity-50 flex items-center justify-center gap-1 mx-auto"
                            >
                              {voting === c._id ? (
                                <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                              ) : <HiCheckCircle className="w-4 h-4" />}
                              Vote
                            </button>
                          )}

                          {election.status === 'completed' && results[election._id] && (() => {
                            const posResults = results[election._id]?.find(r => r.position === c.position);
                            const cResult = posResults?.candidates?.find(rc => rc.candidateId === c._id);
                            return cResult ? <p className="text-sm font-bold text-primary-500 mt-2">{cResult.voteCount} votes</p> : null;
                          })()}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-500 text-sm">No candidates registered yet</p>
                  )}

                  {/* Apply as candidate */}
                  {election.status === 'upcoming' && (
                    <div className="mt-4">
                      {showApply === election._id ? (
                        <ApplyForm electionId={election._id} positions={election.positions || []} onDone={() => { setShowApply(null); loadElections(); }} onCancel={() => setShowApply(null)} />
                      ) : (
                        <button onClick={() => setShowApply(election._id)} className="text-sm text-primary-500 font-medium hover:underline">
                          Register as Candidate →
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

function ApplyForm({ electionId, positions, onDone, onCancel }) {
  const [position, setPosition] = useState(positions[0] || '');
  const [manifesto, setManifesto] = useState('');
  const [photo, setPhoto] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('position', position);
      fd.append('manifesto', manifesto);
      if (photo) fd.append('photo', photo);
      await registerCandidate(electionId, fd);
      toast.success('Registered as candidate!');
      onDone();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-gray-50 rounded-lg p-4 border">
      <h4 className="font-medium text-sm mb-3">Register as Candidate</h4>
      <div className="space-y-3">
        <div>
          <label className="block text-sm text-gray-700 mb-1">Position</label>
          <select value={position} onChange={e => setPosition(e.target.value)} className="input-field">
            {positions.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Manifesto</label>
          <textarea value={manifesto} onChange={e => setManifesto(e.target.value)} className="input-field" rows={3} placeholder="Why should people vote for you?" />
        </div>
        <div>
          <label className="block text-sm text-gray-700 mb-1">Photo</label>
          <input type="file" accept="image/*" ref={fileRef} onChange={e => setPhoto(e.target.files[0])} className="text-sm" />
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary text-sm disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Register
        </button>
        <button type="button" onClick={onCancel} className="text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}
