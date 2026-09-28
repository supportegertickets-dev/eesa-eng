'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiAcademicCap, HiExclamation, HiEye, HiPencil, HiPlus, HiSearch, HiTrash,
} from 'react-icons/hi';
import { deleteLeadershipTerm, getLeadershipTerms, issueLeadershipCertificate } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { certificateDate, termRange } from '@/lib/certificates';
import ActionMenu from '@/components/ui/ActionMenu';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';
import CertificateDialog from '@/components/certificates/CertificateDialog';
import CertificateEditDialog from '@/components/certificates/CertificateEditDialog';
import TermFormDialog from '@/components/certificates/TermFormDialog';

const FILTERS = [
  { id: 'serving', label: 'In office' },
  { id: 'ended', label: 'Finished' },
  { id: '', label: 'All terms' },
];

const PAGE_SIZE = 20;

/**
 * Every leadership term, from role changes and added by hand, with the
 * certificate issued for it. Administrators correct dates and issue
 * certificates here.
 */
export default function LeadershipTermsPanel({ onIssued }) {
  const { user: currentUser } = useAuth();
  const [state, setState] = useState('ended');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | { term } ; term null to add
  const [issuing, setIssuing] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [busy, setBusy] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [editingCertificate, setEditingCertificate] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (state) params.set('state', state);
      if (query) params.set('search', query);
      setData(await getLeadershipTerms(`?${params}`));
    } catch (err) {
      setError(err);
    }
  }, [state, query, page]);

  useEffect(() => { load(); }, [load]);

  const issue = async () => {
    setBusy(true);
    try {
      const { certificate } = await issueLeadershipCertificate(issuing._id);
      toast.success(`Certificate ${certificate.number} issued.`);
      setIssuing(null);
      setViewing(certificate);
      onIssued?.();
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await deleteLeadershipTerm(removing._id);
      toast.success('Term removed.');
      setRemoving(null);
      load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chips = FILTERS.map((filter) => ({ ...filter, count: filter.id ? data?.counts?.[filter.id] : undefined }));

  return (
    <div>
      <p className="text-sm text-muted-fg mb-4 max-w-3xl">
        A term starts when a member is given an office in Manage Members and ends when the office is taken away.
        Add leaders from before, or correct dates, then issue each finished term its certificate.
      </p>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <FilterChips label="Show terms" options={chips} value={state} onChange={(id) => { setState(id); setPage(1); }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }} className="relative lg:w-64" role="search">
          <label htmlFor="term-search" className="sr-only">Search terms</label>
          <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input id="term-search" type="text" inputMode="search" className="input-field pl-9 py-2" placeholder="Name or office" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
        <button type="button" className="btn-primary" onClick={() => setEditing({ term: null })}>
          <HiPlus className="w-4 h-4" aria-hidden="true" /> Add past leader
        </button>
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingRegion label="Loading terms"><SkeletonList count={5} /></LoadingRegion>
      ) : data.terms.length === 0 ? (
        <EmptyState
          icon={HiAcademicCap}
          title={query ? 'No terms match' : state === 'ended' ? 'No finished terms yet' : 'No terms'}
          description={state === 'ended' && !query
            ? 'Terms finish when an office holder\'s role is changed. Leaders from before can be added by hand.'
            : undefined}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {data.terms.map((term) => {
              const own = term.user && term.user._id === currentUser?._id;
              const datesMissing = !term.startDate || !term.endDate;
              const actions = [];
              if (term.certificate) {
                actions.push({ label: 'View certificate', icon: HiEye, onClick: () => setViewing(term.certificate) });
                // The term's details now change through its certificate, which updates both.
                if (!own) actions.push({ label: 'Edit certificate', icon: HiPencil, onClick: () => setEditingCertificate(term.certificate) });
              } else if (!own) {
                actions.push({ label: 'Edit term', icon: HiPencil, onClick: () => setEditing({ term }) });
                if (term.source === 'manual' || term.status === 'ended') {
                  actions.push({ label: 'Remove term', icon: HiTrash, danger: true, onClick: () => setRemoving(term) });
                }
              }

              return (
                <li key={term._id} className="card p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <Avatar src={term.user?.avatar} name={term.name} size="md" />
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-strong truncate">{term.name}</span>
                        <span className="badge-brand">{term.office}</span>
                        {term.status === 'serving' && <span className="badge-success">In office</span>}
                        {!term.user && <span className="badge-neutral">No account</span>}
                      </p>
                      <p className={`text-sm mt-0.5 ${datesMissing ? 'text-warning' : 'text-subtle'}`}>
                        {datesMissing && <HiExclamation className="w-4 h-4 inline -mt-0.5 mr-1" aria-hidden="true" />}
                        {termRange(term.startDate, term.endDate)}
                        {term.source === 'existing' && !term.startDate && ' · in office before terms were recorded'}
                      </p>
                      {term.certificate && (
                        <p className="text-xs text-subtle mt-0.5">
                          Certificate {term.certificate.number}, issued {certificateDate(term.certificate.issuedAt)}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:shrink-0">
                    {term.certificate ? (
                      <button type="button" className="btn-outline btn-sm" onClick={() => setViewing(term.certificate)}>
                        <HiEye className="w-4 h-4" aria-hidden="true" /> Certificate
                      </button>
                    ) : own ? (
                      <span className="text-xs text-subtle">Another administrator certifies your term</span>
                    ) : datesMissing ? (
                      <button type="button" className="btn-outline btn-sm" onClick={() => setEditing({ term })}>
                        <HiPencil className="w-4 h-4" aria-hidden="true" /> Enter dates
                      </button>
                    ) : (
                      <button type="button" className="btn-primary btn-sm" onClick={() => setIssuing(term)}>
                        <HiAcademicCap className="w-4 h-4" aria-hidden="true" /> Issue certificate
                      </button>
                    )}
                    {actions.length > 0 && <ActionMenu label={`More actions for ${term.name}`} actions={actions} />}
                  </div>
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <TermFormDialog
        open={Boolean(editing)}
        term={editing?.term || null}
        onClose={() => setEditing(null)}
        onSaved={load}
      />

      <ConfirmDialog
        open={Boolean(issuing)}
        destructive={false}
        busy={busy}
        title="Issue this certificate?"
        description={issuing
          ? `${issuing.name}, ${issuing.office}, from ${certificateDate(issuing.startDate)} to ${certificateDate(issuing.endDate)}. Check the name and dates: they are printed exactly as shown, and a mistake means revoking the certificate and issuing another.${issuing.user ? ' They will be notified.' : ''}`
          : ''}
        confirmLabel="Issue certificate"
        onConfirm={issue}
        onCancel={() => setIssuing(null)}
      />

      <ConfirmDialog
        open={Boolean(removing)}
        busy={busy}
        title="Remove this term?"
        description={removing ? `${removing.name}'s term as ${removing.office} will be removed. It has no certificate.` : ''}
        confirmLabel="Remove term"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />

      <CertificateDialog
        certificate={viewing}
        onClose={() => setViewing(null)}
        editable
        onChanged={(certificate) => { setViewing(certificate); load(); }}
      />
      {editingCertificate && (
        <CertificateEditDialog certificate={editingCertificate} onClose={() => setEditingCertificate(null)} onSaved={load} />
      )}
    </div>
  );
}
