'use client';

import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { HiCash, HiChevronRight, HiDownload, HiIdentification, HiPrinter, HiSearch } from 'react-icons/hi';
import { getMemberCards } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDate } from '@/lib/dates';
import { cardFileName, printCardSheet, renderCardImage } from '@/lib/membershipCard';
import { downloadZip } from '@/lib/print';
import Avatar from '@/components/ui/Avatar';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';
import MembershipDialog from '@/components/members/MembershipDialog';
import MemberCardDialog from '@/components/membership/MemberCardDialog';

const STATES = {
  ready: { label: 'Card ready', badge: 'badge-success' },
  waiting: { label: 'Photo waiting for review', badge: 'badge-warning' },
  'needs-photo': { label: 'Needs a photo', badge: 'badge-info' },
  unpaid: { label: 'Not paid up', badge: 'badge-neutral' },
};

const FILTERS = [
  { id: 'ready', label: 'Ready to print' },
  { id: 'needs-photo', label: 'Needs a photo' },
  { id: 'waiting', label: 'Waiting for review' },
  { id: 'unpaid', label: 'Not paid up' },
  { id: '', label: 'All members' },
];

const PAGE_SIZE = 20;

/**
 * Every active member's card for administrators: mark unpaid members as paid,
 * open, download or print any card, add missing photos, and print or download
 * many at once.
 */
export default function MemberCardsPanel({ onReviewPhotos, onChanged }) {
  const { user: currentUser } = useAuth();
  const [payingFor, setPayingFor] = useState(null);
  const [state, setState] = useState('ready');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Map()); // id -> card
  const [openId, setOpenId] = useState(null);
  const [working, setWorking] = useState(null); // null | { action, done, total }

  const load = useCallback(async () => {
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (state) params.set('state', state);
      if (query) params.set('search', query);
      setData(await getMemberCards(`?${params}`));
    } catch (err) {
      setError(err);
    }
  }, [state, query, page]);

  useEffect(() => { load(); }, [load]);

  const readyOnPage = (data?.members || []).filter((member) => member.card);
  const allOnPageSelected = readyOnPage.length > 0 && readyOnPage.every((member) => selected.has(member._id));

  const toggle = (member) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(member._id)) next.delete(member._id);
    else next.set(member._id, member.card);
    return next;
  });

  const togglePage = () => setSelected((current) => {
    const next = new Map(current);
    readyOnPage.forEach((member) => (allOnPageSelected ? next.delete(member._id) : next.set(member._id, member.card)));
    return next;
  });

  /** Draw every selected card, reporting progress, one at a time to spare the phone's memory. */
  const renderSelected = async (action) => {
    const cards = [...selected.values()];
    const images = [];
    let missingPhotos = 0;
    setWorking({ action, done: 0, total: cards.length });
    for (const card of cards) {
      const { dataUrl, photoLoaded } = await renderCardImage(card);
      if (!photoLoaded) missingPhotos += 1;
      images.push({ card, dataUrl });
      setWorking({ action, done: images.length, total: cards.length });
    }
    if (missingPhotos) toast.error(`${missingPhotos} ${missingPhotos === 1 ? 'photo' : 'photos'} could not be loaded, so those cards have no photo. Check the connection and try again.`);
    return images;
  };

  const printSelected = async () => {
    try {
      const images = await renderSelected('print');
      printCardSheet(images.map((image) => image.dataUrl));
    } catch {
      toast.error('The cards could not be prepared. Try again.');
    } finally {
      setWorking(null);
    }
  };

  const downloadSelected = async () => {
    try {
      const images = await renderSelected('download');
      await downloadZip(
        images.map(({ card, dataUrl }) => ({ name: cardFileName(card), dataUrl })),
        `EESA-membership-cards-${new Date().toISOString().slice(0, 10)}.zip`,
      );
    } catch {
      toast.error('The cards could not be prepared. Try again.');
    } finally {
      setWorking(null);
    }
  };

  const chips = FILTERS.map((filter) => ({ ...filter, count: filter.id ? data?.counts?.[filter.id] : undefined }));

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:items-center gap-3 mb-4">
        <div className="flex-1 min-w-0">
          <FilterChips label="Show members" options={chips} value={state} onChange={(id) => { setState(id); setPage(1); }} />
        </div>
        <form onSubmit={(e) => { e.preventDefault(); setQuery(search.trim()); setPage(1); }} className="relative lg:w-72" role="search">
          <label htmlFor="card-search" className="sr-only">Search members</label>
          <HiSearch className="w-4 h-4 text-faint absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input id="card-search" type="text" inputMode="search" className="input-field pl-9 py-2" placeholder="Name, reg. or member number" value={search} onChange={(e) => setSearch(e.target.value)} />
        </form>
      </div>

      {selected.size > 0 && (
        <div className="card p-3 mb-4 flex flex-wrap items-center gap-3 sticky top-20 z-20 shadow-overlay" role="region" aria-label="Selected cards">
          <p className="text-sm font-medium text-strong flex-1">
            {working
              ? `Preparing card ${working.done} of ${working.total}…`
              : `${selected.size} ${selected.size === 1 ? 'card' : 'cards'} selected`}
          </p>
          <button type="button" className="btn-ghost btn-sm" onClick={() => setSelected(new Map())} disabled={Boolean(working)}>Clear</button>
          <button type="button" className="btn-outline btn-sm" onClick={downloadSelected} disabled={Boolean(working)}>
            <HiDownload className="w-4 h-4" aria-hidden="true" /> Download (ZIP)
          </button>
          <button type="button" className="btn-primary btn-sm" onClick={printSelected} disabled={Boolean(working)}>
            <HiPrinter className="w-4 h-4" aria-hidden="true" /> Print on A4
          </button>
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !data ? (
        <LoadingRegion label="Loading members"><SkeletonList count={5} /></LoadingRegion>
      ) : data.members.length === 0 ? (
        <EmptyState
          icon={HiIdentification}
          title={query ? 'No members match' : state === 'ready' ? 'No cards ready yet' : 'Nobody here'}
          description={state === 'ready' && !query ? 'Cards appear here once a paid-up member has an approved photo.' : undefined}
        />
      ) : (
        <>
          {readyOnPage.length > 0 && (
            <label className="flex items-center gap-2 text-sm text-body mb-2 px-1">
              <input type="checkbox" className="rounded border-line-strong" checked={allOnPageSelected} onChange={togglePage} />
              Select all ready cards on this page
            </label>
          )}
          <ul className="space-y-2">
            {data.members.map((member) => {
              const name = [member.firstName, member.lastName].filter(Boolean).join(' ');
              const status = STATES[member.state];
              return (
                <li key={member._id} className="card p-0 flex items-center">
                  <span className="pl-4 w-10 shrink-0">
                    {member.card && (
                      <input
                        type="checkbox"
                        className="rounded border-line-strong"
                        checked={selected.has(member._id)}
                        onChange={() => toggle(member)}
                        aria-label={`Select ${name}'s card`}
                      />
                    )}
                  </span>
                  <button type="button" onClick={() => setOpenId(member._id)} className="flex-1 min-w-0 p-3 pr-4 flex items-center gap-3 text-left hover:bg-muted/40 rounded-r-xl transition-colors">
                    <Avatar src={member.avatar} name={name} size="md" />
                    <span className="flex-1 min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-strong truncate">{name}</span>
                        <span className={status.badge}>{status.label}</span>
                      </span>
                      <span className="block text-sm text-subtle truncate mt-0.5">
                        {[member.memberNumber, member.regNumber, member.department].filter(Boolean).join(' · ')}
                        {member.state === 'ready' && member.membershipExpiry && ` · valid until ${formatDate(member.membershipExpiry)}`}
                      </span>
                    </span>
                    <HiChevronRight className="w-5 h-5 text-faint shrink-0" aria-hidden="true" />
                  </button>
                  {/* Nobody marks their own membership paid; another administrator does. */}
                  {member.state === 'unpaid' && member._id !== currentUser?._id && (
                    <button type="button" className="btn-outline btn-sm mr-4 shrink-0" onClick={() => setPayingFor(member)}>
                      <HiCash className="w-4 h-4" aria-hidden="true" /> Mark paid
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <Pagination className="mt-4" page={page} totalPages={data.totalPages} onChange={setPage} />
          {state === 'waiting' && onReviewPhotos && (
            <p className="mt-4 text-sm text-muted-fg">
              Approve or return several photos at once from{' '}
              <button type="button" className="font-medium text-primary-600 dark:text-primary-300 hover:underline" onClick={onReviewPhotos}>Photo reviews</button>.
            </p>
          )}
        </>
      )}

      <MembershipDialog
        open={Boolean(payingFor)}
        member={payingFor}
        onClose={() => setPayingFor(null)}
        onSaved={() => { load(); onChanged?.(); }}
      />

      {openId && (
        <MemberCardDialog
          userId={openId}
          onClose={() => setOpenId(null)}
          onChanged={() => { load(); onChanged?.(); }}
        />
      )}
    </div>
  );
}
