'use client';

import { useEffect, useId, useMemo, useState } from 'react';
import { HiSearch, HiX } from 'react-icons/hi';
import { getUsers, registerCandidate } from '@/lib/api';
import Avatar from '@/components/ui/Avatar';
import ImageDropzone from '@/components/ui/ImageDropzone';

/** Admin shortcut: put a member straight onto the ballot, already approved. */
export default function AddCandidateForm({ election, onDone, onCancel }) {
  const uid = useId();
  const taken = useMemo(() => new Set(election.candidates.map((c) => String(c.user?._id))), [election]);

  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [member, setMember] = useState(null);
  const [position, setPosition] = useState(election.positions[0] || '');
  const [manifesto, setManifesto] = useState('');
  const [photo, setPhoto] = useState(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Search the directory on the server rather than filtering the first page
  // client-side, which missed anyone beyond the first 50 members.
  useEffect(() => {
    if (member) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ limit: '12' });
        if (search.trim()) params.set('search', search.trim());
        const data = await getUsers(`?${params}`);
        if (!cancelled) setResults((data.users || []).filter((u) => !taken.has(String(u._id))));
      } catch (err) {
        if (!cancelled) setError(err.message);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [search, member, taken]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!member) { setError('Choose a member first.'); return; }

    const data = new FormData();
    data.append('userId', member._id);
    data.append('position', position);
    if (manifesto.trim()) data.append('manifesto', manifesto.trim());
    if (photo) data.append('photo', photo);

    setError('');
    setSubmitting(true);
    try {
      onDone(await registerCandidate(election._id, data));
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const name = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ');

  return (
    <form onSubmit={handleSubmit} className="card space-y-5" noValidate>
      <div>
        <h2 className="font-heading text-lg font-semibold text-strong">Add a candidate</h2>
        <p className="text-sm text-muted-fg mt-1">Candidates added here skip review and go straight onto the ballot.</p>
      </div>

      {error && <p role="alert" className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3">{error}</p>}

      <div>
        <p className="form-label">Member <span className="text-danger">*</span></p>
        {member ? (
          <div className="flex items-center gap-3 p-3 rounded-lg border border-primary-500/40 bg-primary-500/5">
            <Avatar src={member.avatar} name={name(member)} size="md" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-strong truncate">{name(member)}</p>
              <p className="text-xs text-subtle truncate">{member.department}{member.yearOfStudy ? ` · Year ${member.yearOfStudy}` : ''}</p>
            </div>
            <button type="button" onClick={() => setMember(null)} className="p-1.5 rounded-lg text-faint hover:text-danger" aria-label="Choose a different member">
              <HiX className="w-5 h-5" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <div>
            <label className="relative block">
              <span className="sr-only">Search members</span>
              <HiSearch className="w-5 h-5 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
              <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} className="input-field pl-10" placeholder="Search by name or username" />
            </label>
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line" aria-busy={searching}>
              {searching && results.length === 0 ? (
                <li className="px-3 py-4 text-sm text-subtle text-center">Searching…</li>
              ) : results.length === 0 ? (
                <li className="px-3 py-4 text-sm text-subtle text-center">No eligible members found.</li>
              ) : results.map((u) => (
                <li key={u._id}>
                  <button type="button" onClick={() => setMember(u)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-muted transition-colors">
                    <Avatar src={u.avatar} name={name(u)} size="sm" />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-strong truncate">{name(u)}</span>
                      <span className="block text-xs text-subtle truncate">{u.department}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[14rem_1fr] gap-6">
        <ImageDropzone label="Campaign photo" hint="Optional." value={photo} onChange={setPhoto} aspect="portrait" disabled={submitting} />
        <div className="space-y-4">
          <div>
            <label htmlFor={`${uid}-position`} className="form-label">Position <span className="text-danger">*</span></label>
            <select id={`${uid}-position`} value={position} onChange={(e) => setPosition(e.target.value)} className="input-field">
              {election.positions.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor={`${uid}-manifesto`} className="form-label">Manifesto</label>
            <textarea id={`${uid}-manifesto`} value={manifesto} onChange={(e) => setManifesto(e.target.value)} className="input-field resize-y" rows={6} maxLength={2000} />
          </div>
        </div>
      </div>

      <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2 border-t border-line">
        {onCancel && <button type="button" onClick={onCancel} disabled={submitting} className="btn-ghost">Cancel</button>}
        <button type="submit" disabled={submitting || !member} className="btn-primary">
          {submitting ? 'Adding…' : 'Add to ballot'}
        </button>
      </div>
    </form>
  );
}
