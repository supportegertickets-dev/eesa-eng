'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  HiAcademicCap, HiBadgeCheck, HiBan, HiChevronRight, HiDocumentText, HiDownload, HiPrinter, HiSearch,
} from 'react-icons/hi';
import { getCertificates, revokeCertificate } from '@/lib/api';
import {
  CERTIFICATE_TITLES, certificateDate, certificateFileName, certificateSubject, printCertificates, renderCertificateImage,
} from '@/lib/certificates';
import { downloadZip } from '@/lib/print';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Modal from '@/components/ui/Modal';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';
import CertificateDialog from '@/components/certificates/CertificateDialog';

// Each filter is a kind of certificate and a status.
const FILTERS = [
  { id: 'all', label: 'All valid', type: '', status: 'valid' },
  { id: 'leadership', label: 'Leadership', type: 'leadership', status: 'valid' },
  { id: 'membership', label: 'Membership', type: 'membership', status: 'valid' },
  { id: 'revoked', label: 'Revoked', type: '', status: 'revoked' },
];

const PAGE_SIZE = 20;

/** Every certificate issued: open, print or download them, and revoke one issued in error. */
export default function IssuedCertificatesPanel({ refreshKey }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Map()); // id -> certificate
  const [working, setWorking] = useState(null); // null | { done, total }
  const [viewing, setViewing] = useState(null);
  const [revoking, setRevoking] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { type, status } = FILTERS.find((f) => f.id === filter);
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE), status });
      if (type) params.set('type', type);
      if (query) params.set('search', query);
      setData(await getCertificates(`?${params}`));
    } catch (err) {
      setError(err);
    }
  }, [filter, query, page]);

  // A certificate issued from another tab shows up on return.
  useEffect(() => { load(); }, [load, refreshKey]);

  const selectable = (data?.certificates || []).filter((c) => c.status === 'valid');
  const allOnPageSelected = selectable.length > 0 && selectable.every((c) => selected.has(c._id));

  const toggle = (certificate) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(certificate._id)) next.delete(certificate._id);
    else next.set(certificate._id, certificate);
    return next;
  });

  const togglePage = () => setSelected((current) => {
    const next = new Map(current);
    selectable.forEach((c) => (allOnPageSelected ? next.delete(c._id) : next.set(c._id, c)));
    return next;
  });

  /** Draw the selected certificates one at a time, to spare a phone's memory. */
  const renderSelected = async () => {
    const certificates = [...selected.values()];
    const images = [];
    let missing = 0;
    setWorking({ done: 0, total: certificates.length });
    for (const certificate of certificates) {
      const { dataUrl, signaturesLoaded } = await renderCertificateImage(certificate);
      if (!signaturesLoaded) missing += 1;
      images.push({ certificate, dataUrl });
      setWorking({ done: images.length, total: certificates.length });
    }
    if (missing) toast.error(`${missing} ${missing === 1 ? 'certificate is' : 'certificates are'} missing a signature that could not be loaded. Check the connection and try again.`);
    return images;
  };

  const printSelected = async () => {
    try {
      const images = await renderSelected();
      printCertificates(images.map((image) => image.dataUrl), { title: 'EESA certificates' });
    } catch {
      toast.error('The certificates could not be prepared. Try again.');
    } finally {
      setWorking(null);
    }
  };

  const downloadSelected = async () => {
    try {
      const images = await renderSelected();
      await downloadZip(
        images.map(({ certificate, dataUrl }) => ({ name: certificateFileName(certificate), dataUrl })),
        `EESA-certificates-${new Date().toISOString().slice(0, 10)}.zip`,
      );
    } catch {
      toast.error('The certificates could not be prepared. Try again.');
    } finally {
      setWorking(null);
    }
  };

  const onRevoked = (certificate) => {
    setSelected((current) => {
      const next = new Map(current);
      next.delete(certificate._id);
      return next;
    });
    load();
  };

  const counts = data?.counts ? { ...data.counts, all: data.counts.leadership + data.counts.membership } : {};
  const chips = FILTERS.map((f) => ({ id: f.id, label: f.label, count: counts[f.id] }));

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <FilterChips label="Show certificates" options={chips} value={filter} onChange={(id) => { setFilter(id); setPage(1); }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }} className="relative lg:w-72" role="search">
          <label htmlFor="certificate-search" className="sr-only">Search certificates</label>
          <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input id="certificate-search" type="text" inputMode="search" className="input-field pl-9 py-2" placeholder="Name, number, office or year" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </div>

      {selected.size > 0 && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-3 sticky top-20 z-20 shadow-overlay" role="region" aria-label="Selected certificates">
          <p className="text-sm font-medium text-strong flex-1">
            {working
              ? `Preparing certificate ${working.done} of ${working.total}…`
              : `${selected.size} ${selected.size === 1 ? 'certificate' : 'certificates'} selected`}
          </p>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Map())} disabled={Boolean(working)}>Clear</button>
          <button type="button" className="btn-outline btn-sm" onClick={downloadSelected} disabled={Boolean(working)}>
            <HiDownload className="w-4 h-4" aria-hidden="true" /> Download (ZIP)
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={printSelected} disabled={Boolean(working)}>
            <HiPrinter className="w-4 h-4" aria-hidden="true" /> Print
          </button>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingRegion label="Loading certificates"><SkeletonList count={5} /></LoadingRegion>
      ) : data.certificates.length === 0 ? (
        <EmptyState
          icon={HiDocumentText}
          title={query ? 'No certificates match' : filter === 'revoked' ? 'No revoked certificates' : 'No certificates issued yet'}
          description={!query && filter !== 'revoked'
            ? 'Leadership certificates are issued from Leadership terms. Members get membership certificates themselves once they have paid.'
            : undefined}
        />
      ) : (
        <>
          {selectable.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-body mb-2 px-1">
              <input type="checkbox" className="rounded border-line-strong" checked={allOnPageSelected} onChange={togglePage} />
              Select all on this page
            </label>
          )}
          <ul className="space-y-2">
            {data.certificates.map((certificate) => {
              const Icon = certificate.type === 'leadership' ? HiAcademicCap : HiBadgeCheck;
              return (
                <li key={certificate._id} className="card p-0 flex items-center">
                  <span className="pl-4 w-10 shrink-0">
                    {certificate.status === 'valid' && (
                      <input
                        type="checkbox"
                        className="rounded border-line-strong"
                        checked={selected.has(certificate._id)}
                        onChange={() => toggle(certificate)}
                        aria-label={`Select ${certificate.recipientName}'s certificate`}
                      />
                    )}
                  </span>
                  <button type="button" onClick={() => setViewing(certificate)} className="flex-1 min-w-0 p-3 pr-2 flex items-center gap-3 text-left hover:bg-muted/40 rounded-r-xl transition-colors">
                    <Icon className="w-6 h-6 text-accent-600 dark:text-accent-400 shrink-0" aria-hidden="true" />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-strong truncate">{certificate.recipientName}</span>
                        <span className="badge-neutral">{CERTIFICATE_TITLES[certificate.type].replace('Certificate of ', '')}</span>
                        {certificate.status === 'revoked' && <span className="badge-danger">Revoked</span>}
                      </span>
                      <span className="block text-sm text-muted-fg truncate mt-0.5">{certificateSubject(certificate)}</span>
                      <span className="block text-xs text-subtle truncate">
                        {certificate.number} · issued {certificateDate(certificate.issuedAt)}
                        {certificate.type === 'leadership' && certificate.issuedBy?.name ? ` by ${certificate.issuedBy.name}` : ''}
                      </span>
                    </span>
                    <HiChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
                  </button>
                  {certificate.status === 'valid' && (
                    <button type="button" className="btn-ghost btn-sm mr-3 shrink-0 text-danger" onClick={() => setRevoking(certificate)}>
                      <HiBan className="w-4 h-4" aria-hidden="true" /> Revoke
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} totalPages={data.totalPages} onChange={setPage} />
        </>
      )}

      <RevokeDialog certificate={revoking} onClose={() => setRevoking(null)} onRevoked={onRevoked} />
      <CertificateDialog certificate={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

function RevokeDialog({ certificate, onClose, onRevoked }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setReason('');
    setError('');
  }, [certificate]);

  const submit = async (event) => {
    event.preventDefault();
    if (!reason.trim()) {
      setError('Say why the certificate is being revoked.');
      return;
    }
    setSaving(true);
    try {
      const result = await revokeCertificate(certificate._id, reason.trim());
      toast.success(`Certificate ${certificate.number} revoked.`);
      onRevoked(result.certificate);
      onClose();
    } catch (err) {
      setError(err.errors?.reason || err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(certificate)}
      title="Revoke certificate"
      description={certificate
        ? `${certificate.recipientName}'s ${certificate.type} certificate ${certificate.number} will stop verifying as genuine. This cannot be undone.`
        : ''}
      onClose={onClose}
      busy={saving}
      footer={(
        <>
          <button type="button" className="btn-ghost" onClick={onClose} disabled={saving}>Cancel</button>
          <button type="submit" form="revoke-form" className="btn-danger" disabled={saving}>
            {saving ? 'Revoking…' : 'Revoke certificate'}
          </button>
        </>
      )}
    >
      <form id="revoke-form" onSubmit={submit} noValidate>
        <label htmlFor="revoke-reason" className="form-label">Reason</label>
        <textarea
          id="revoke-reason"
          className="input-field"
          rows={3}
          maxLength={300}
          placeholder="e.g. The end date was wrong; a corrected certificate has been issued."
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
        />
        {error
          ? <p className="form-error">{error}</p>
          : (
            <p className="form-hint">
              {certificate?.user ? 'The holder is notified with this reason. ' : ''}
              {certificate?.type === 'leadership'
                ? 'The term can then be corrected and a new certificate issued.'
                : 'The member can get a new one if they are still eligible.'}
            </p>
          )}
      </form>
    </Modal>
  );
}
