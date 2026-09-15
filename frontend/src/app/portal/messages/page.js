'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { HiInbox, HiMail, HiMailOpen, HiReply, HiTrash } from 'react-icons/hi';
import { deleteContactMessage, getContactMessages, markContactRead } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { formatDateTime, relativeTime } from '@/lib/dates';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import FilterChips from '@/components/ui/FilterChips';
import Pagination from '@/components/ui/Pagination';
import { LoadingRegion, SkeletonList } from '@/components/ui/Skeleton';

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { id: '', label: 'All' },
  { id: 'unread', label: 'Unread' },
  { id: 'read', label: 'Read' },
];

/** A reply opens in the administrator's own mail app, already addressed and titled. */
const replyHref = (message) => {
  const subject = /^re:/i.test(message.subject) ? message.subject : `Re: ${message.subject}`;
  return `mailto:${message.email}?subject=${encodeURIComponent(subject)}`;
};

export default function MessagesPage() {
  // useSearchParams must sit inside a Suspense boundary.
  return (
    <Suspense fallback={<SkeletonList count={5} />}>
      <Messages />
    </Suspense>
  );
}

function Messages() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAdmin } = useAuth();

  // The view lives in the URL, so the admin overview can link straight to unread messages.
  const requestedStatus = searchParams.get('status') || '';
  const status = STATUS_FILTERS.some((filter) => filter.id === requestedStatus) ? requestedStatus : '';
  const page = Math.max(1, Number(searchParams.get('page')) || 1);

  const [data, setData] = useState({ messages: [], total: 0, totalPages: 1, unread: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [pendingDelete, setPendingDelete] = useState(null);
  const [busy, setBusy] = useState(false);

  const updateQuery = useCallback((changes) => {
    const next = new URLSearchParams(searchParams.toString());
    Object.entries(changes).forEach(([key, value]) => {
      if (value && !(key === 'page' && Number(value) === 1)) next.set(key, String(value));
      else next.delete(key);
    });
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }, [searchParams, router, pathname]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
      if (status) params.set('status', status);
      setData(await getContactMessages(`?${params}`));
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [status, page]);

  useEffect(() => { if (isAdmin) load(); }, [isAdmin, load]);

  if (!isAdmin) {
    return (
      <div className="card text-center py-20">
        <p className="text-subtle text-lg">Access denied. Admin and Chairperson only.</p>
      </div>
    );
  }

  /**
   * Update one message in place rather than reloading. In the Unread view a
   * message just read stays on screen until the next load, so it does not
   * vanish while it is being read.
   */
  const setRead = async (message, isRead) => {
    if (message.isRead === isRead) return;
    try {
      await markContactRead(message._id, isRead);
      setData((current) => ({
        ...current,
        unread: Math.max(0, current.unread + (isRead ? -1 : 1)),
        messages: current.messages.map((m) => (m._id === message._id ? { ...m, isRead } : m)),
      }));
    } catch (err) {
      toast.error(err.message);
    }
  };

  const toggle = (message) => {
    const opening = openId !== message._id;
    setOpenId(opening ? message._id : null);
    // Opening a message is reading it.
    if (opening) setRead(message, true);
  };

  const markUnread = (message) => {
    setOpenId(null);
    setRead(message, false);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      await deleteContactMessage(pendingDelete._id);
      toast.success('Message deleted.');
      setPendingDelete(null);
      // Step back when the last message on a later page goes, rather than showing an empty page.
      if (data.messages.length === 1 && page > 1) updateQuery({ page: page - 1 });
      else load();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const chips = STATUS_FILTERS.map((filter) => (filter.id === 'unread' ? { ...filter, count: data.unread } : filter));

  return (
    <div>
      <div className="mb-6">
        <p className="text-primary-600 dark:text-primary-300 text-sm font-semibold uppercase tracking-wide">Administration</p>
        <h1 className="page-title mt-1">Messages</h1>
        <p className="text-muted-fg mt-1">Messages sent through the public contact page.</p>
      </div>

      <div className="mb-4">
        <FilterChips
          label="Show messages"
          options={chips}
          value={status}
          onChange={(id) => { setOpenId(null); updateQuery({ status: id, page: '' }); }}
        />
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <LoadingRegion label="Loading messages"><SkeletonList count={5} /></LoadingRegion>
      ) : data.messages.length === 0 ? (
        <EmptyState
          icon={HiInbox}
          title={status === 'unread' ? 'No unread messages' : 'No messages'}
          description={status === 'unread'
            ? 'You are all caught up.'
            : 'Messages sent from the contact page will appear here.'}
        />
      ) : (
        <>
          <ul className="space-y-2">
            {data.messages.map((message) => {
              const open = openId === message._id;
              return (
                <li
                  key={message._id}
                  className={`card p-0 overflow-hidden ${message.isRead ? '' : 'border-l-4 border-l-primary-500'}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(message)}
                    aria-expanded={open}
                    className="w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-muted/40 transition-colors"
                  >
                    <span className={`mt-0.5 w-9 h-9 shrink-0 rounded-full flex items-center justify-center ${message.isRead ? 'bg-muted' : 'bg-primary-500/10'}`}>
                      {message.isRead
                        ? <HiMailOpen className="w-5 h-5 text-faint" aria-hidden="true" />
                        : <HiMail className="w-5 h-5 text-primary-500 dark:text-primary-300" aria-hidden="true" />}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-baseline justify-between gap-3">
                        <span className={`truncate ${message.isRead ? 'text-body' : 'font-semibold text-strong'}`}>
                          {!message.isRead && <span className="sr-only">Unread: </span>}
                          {message.subject}
                        </span>
                        <time
                          dateTime={message.createdAt}
                          title={formatDateTime(message.createdAt)}
                          className="text-xs text-subtle whitespace-nowrap"
                        >
                          {relativeTime(message.createdAt)}
                        </time>
                      </span>
                      <span className="block text-sm text-subtle truncate">{message.name} · {message.email}</span>
                      {!open && <span className="block text-sm text-muted-fg truncate mt-0.5">{message.message}</span>}
                    </span>
                  </button>

                  {open && (
                    <div className="px-4 pb-4 sm:pl-16">
                      <p className="text-sm text-body whitespace-pre-wrap break-words">{message.message}</p>
                      <div className="flex flex-wrap gap-2 mt-4">
                        <a href={replyHref(message)} className="btn-primary btn-sm">
                          <HiReply className="w-4 h-4" aria-hidden="true" /> Reply by email
                        </a>
                        <button type="button" onClick={() => markUnread(message)} className="btn-ghost btn-sm">
                          <HiMail className="w-4 h-4" aria-hidden="true" /> Mark as unread
                        </button>
                        <button type="button" onClick={() => setPendingDelete(message)} className="btn-ghost btn-sm text-danger">
                          <HiTrash className="w-4 h-4" aria-hidden="true" /> Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <Pagination
            className="mt-4"
            page={page}
            totalPages={data.totalPages}
            onChange={(next) => { setOpenId(null); updateQuery({ page: next }); }}
          />
        </>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title="Delete this message?"
        description={pendingDelete ? `The message from ${pendingDelete.name} will be removed permanently.` : ''}
        confirmLabel="Delete"
        busy={busy}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
