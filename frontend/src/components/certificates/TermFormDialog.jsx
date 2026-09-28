'use client';

import { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { HiSearch, HiX } from 'react-icons/hi';
import { createLeadershipTerm, getUsers, updateLeadershipTerm } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { OFFICE_ROLES, roleLabel } from '@/lib/roles';
import { toDateInput } from '@/lib/certificates';
import Avatar from '@/components/ui/Avatar';
import Modal from '@/components/ui/Modal';

const FORM_ID = 'term-form';
const OFFICE_SUGGESTIONS = OFFICE_ROLES.map(roleLabel);
const fullName = (u) => [u.firstName, u.lastName].filter(Boolean).join(' ');

const initialForm = (term) => ({
  who: 'member',
  member: null,
  name: term?.name || '',
  office: term?.office || '',
  startDate: toDateInput(term?.startDate),
  endDate: toDateInput(term?.endDate),
  // A recorded term may stay open while its holder is still in office.
  serving: Boolean(term?.role) && !term?.endDate,
});

/**
 * Add a term by hand (a leader from before the platform, with or without an
 * account) or correct an existing term's office and dates.
 */
export default function TermFormDialog({ open, term, onClose, onSaved }) {
  const uid = useId();
  const { user: currentUser } = useAuth();
  const editing = Boolean(term);
  const [form, setForm] = useState(() => initialForm(term));
  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(initialForm(term));
    setErrors({});
    setSearch('');
  }, [open, term]);

  // Search the directory on the server, as the candidate picker does.
  useEffect(() => {
    if (!open || editing || form.who !== 'member' || form.member) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams({ limit: '8' });
        if (search.trim()) params.set('search', search.trim());
        const data = await getUsers(`?${params}`);
        // Nobody records their own term.
        if (!cancelled) setResults((data.users || []).filter((u) => u._id !== currentUser?._id));
      } catch {
        if (!cancelled) setResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [open, editing, form.who, form.member, search, currentUser]);

  const update = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    const nextErrors = {};
    if (!editing && form.who === 'member' && !form.member) nextErrors.userId = 'Choose the member who held the office.';
    if (!form.office.trim()) nextErrors.office = 'Enter the office held.';
    if (!form.startDate) nextErrors.startDate = 'Enter the date the term started.';
    if (!form.serving && !form.endDate) nextErrors.endDate = 'Enter the date the term ended.';
    if (form.startDate && form.endDate && !form.serving && form.endDate < form.startDate) nextErrors.endDate = 'The term must end after it starts.';
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }

    const payload = {
      office: form.office.trim(),
      startDate: form.startDate,
      endDate: form.serving ? '' : form.endDate,
    };
    if (!editing) {
      if (form.who === 'member') payload.userId = form.member._id;
      else payload.name = form.name.trim();
    } else if (!term.user) {
      payload.name = form.name.trim();
    }

    setSaving(true);
    setErrors({});
    try {
      const result = editing ? await updateLeadershipTerm(term._id, payload) : await createLeadershipTerm(payload);
      toast.success(editing ? 'Term updated.' : 'Term added.');
      onSaved?.(result.term);
      onClose();
    } catch (err) {
      setErrors(err.errors || {});
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const showName = editing ? !term.user : form.who === 'other';

  return (
    <Modal
      open={open}
      title={editing ? 'Edit term' : 'Add a past leader'}
      description={editing
        ? `Correct ${term.name}'s term before issuing the certificate. Their name comes from their profile.`
        : 'Record a term served before it could be recorded here, so a certificate can be issued for it.'}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form={FORM_ID} className="btn-primary" disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Save term' : 'Add term'}
          </button>
        </>
      )}
    >
      <form id={FORM_ID} onSubmit={handleSubmit} className="space-y-5" noValidate>
        {!editing && (
          <fieldset>
            <legend className="form-label">Leader</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {[
                { id: 'member', label: 'A member on the platform' },
                { id: 'other', label: 'Someone without an account' },
              ].map((option) => (
                <label key={option.id} className="flex items-center gap-3 rounded-lg border border-line px-3 py-2.5 cursor-pointer has-[:checked]:border-primary-500">
                  <input type="radio" name={`${uid}-who`} value={option.id} checked={form.who === option.id} onChange={update('who')} />
                  <span className="text-sm text-body">{option.label}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {!editing && form.who === 'member' && (
          <div>
            <p className="form-label" id={`${uid}-member`}>Member</p>
            {form.member ? (
              <div className="flex items-center gap-3 p-3 rounded-lg border border-primary-500/40 bg-primary-500/5">
                <Avatar src={form.member.avatar} name={fullName(form.member)} size="sm" />
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-semibold text-strong truncate">{fullName(form.member)}</span>
                  <span className="block text-xs text-subtle truncate">{form.member.department}</span>
                </span>
                <button type="button" className="btn-ghost btn-sm" onClick={() => setForm((c) => ({ ...c, member: null }))} aria-label="Choose a different member">
                  <HiX className="w-4 h-4" aria-hidden="true" />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
                  <input
                    type="text"
                    inputMode="search"
                    className="input-field pl-9"
                    placeholder="Search by name"
                    aria-labelledby={`${uid}-member`}
                    aria-invalid={errors.userId ? 'true' : undefined}
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-line divide-y divide-line" aria-busy={searching}>
                  {results.length === 0 ? (
                    <li className="px-3 py-2.5 text-sm text-subtle">{searching ? 'Searching…' : 'No members match.'}</li>
                  ) : results.map((u) => (
                    <li key={u._id}>
                      <button
                        type="button"
                        className="w-full flex items-center gap-3 px-3 py-2 text-left hover:bg-muted/60"
                        onClick={() => { setForm((c) => ({ ...c, member: u })); setErrors((e) => ({ ...e, userId: undefined })); }}
                      >
                        <Avatar src={u.avatar} name={fullName(u)} size="sm" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-strong truncate">{fullName(u)}</span>
                          <span className="block text-xs text-subtle truncate">{u.department}</span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {errors.userId && <p className="form-error">{errors.userId}</p>}
          </div>
        )}

        {showName && (
          <div>
            <label htmlFor={`${uid}-name`} className="form-label">Full name</label>
            <input
              id={`${uid}-name`}
              className="input-field"
              maxLength={100}
              required
              value={form.name}
              onChange={update('name')}
              aria-invalid={errors.name ? 'true' : undefined}
            />
            {errors.name ? <p className="form-error">{errors.name}</p> : <p className="form-hint">As it should be printed on the certificate.</p>}
          </div>
        )}

        <div>
          <label htmlFor={`${uid}-office`} className="form-label">Office</label>
          <input
            id={`${uid}-office`}
            className="input-field"
            list={`${uid}-offices`}
            maxLength={80}
            required
            placeholder="e.g. Treasurer"
            value={form.office}
            onChange={update('office')}
            aria-invalid={errors.office ? 'true' : undefined}
          />
          <datalist id={`${uid}-offices`}>
            {OFFICE_SUGGESTIONS.map((office) => <option key={office} value={office} />)}
          </datalist>
          {errors.office && <p className="form-error">{errors.office}</p>}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor={`${uid}-start`} className="form-label">Started</label>
            <input
              id={`${uid}-start`}
              type="date"
              className="input-field"
              required
              value={form.startDate}
              onChange={update('startDate')}
              aria-invalid={errors.startDate ? 'true' : undefined}
            />
            {errors.startDate && <p className="form-error">{errors.startDate}</p>}
          </div>
          <div>
            <label htmlFor={`${uid}-end`} className="form-label">Ended</label>
            <input
              id={`${uid}-end`}
              type="date"
              className="input-field"
              required={!form.serving}
              disabled={form.serving}
              min={form.startDate || undefined}
              value={form.serving ? '' : form.endDate}
              onChange={update('endDate')}
              aria-invalid={errors.endDate ? 'true' : undefined}
            />
            {errors.endDate && <p className="form-error">{errors.endDate}</p>}
          </div>
        </div>

        {editing && term.role && term.status === 'serving' && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input type="checkbox" className="mt-0.5" checked={form.serving} onChange={update('serving')} />
            <span>
              <span className="block text-sm font-medium text-body">Still in office</span>
              <span className="block text-xs text-subtle">
                The term ends by itself when their role is changed in Manage Members. Enter an end date now only to issue the certificate ahead of the handover.
              </span>
            </span>
          </label>
        )}
      </form>
    </Modal>
  );
}
