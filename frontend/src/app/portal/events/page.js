'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';
import { HiCalendar, HiLocationMarker, HiPencil, HiPhotograph, HiPlus, HiTrash, HiUsers } from 'react-icons/hi';
import { deleteEvent, getEvents, rsvpEvent } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { cloudinaryImage } from '@/lib/images';
import { CATEGORY_GRADIENTS, STATUS_BADGES, isPastEvent } from '@/lib/events';
import EventForm from '@/components/events/EventForm';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';

const VIEWS = [
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'past', label: 'Past' },
];

function EventThumb({ event }) {
  return (
    <div className="relative w-full sm:w-44 aspect-video shrink-0 rounded-lg overflow-hidden bg-muted">
      {event.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={cloudinaryImage(event.image, { width: 352, height: 198 })} alt="" loading="lazy" className="w-full h-full object-cover" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${CATEGORY_GRADIENTS[event.category] || CATEGORY_GRADIENTS.other} flex items-center justify-center`}>
          <HiCalendar className="w-8 h-8 text-white/50" aria-hidden="true" />
        </div>
      )}
      {event.photos?.length > 0 && (
        <span className="absolute bottom-1.5 right-1.5 badge bg-black/60 text-white">
          <HiPhotograph className="w-3 h-3" aria-hidden="true" /> {event.photos.length}
        </span>
      )}
    </div>
  );
}

export default function PortalEventsPage() {
  const { user, isAdmin } = useAuth();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('upcoming');
  const [editor, setEditor] = useState(null); // null, 'new', or the event being edited
  const [pendingDelete, setPendingDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [rsvpBusy, setRsvpBusy] = useState(null);
  const handledEditParam = useRef(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getEvents('?limit=50');
      setEvents(data.events || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // The public event page links here with ?edit=<id> for administrators.
  useEffect(() => {
    if (handledEditParam.current || !isAdmin || !events.length) return;
    const editId = new URLSearchParams(window.location.search).get('edit');
    if (!editId) return;
    handledEditParam.current = true;
    const match = events.find((e) => e._id === editId);
    if (match) setEditor(match);
  }, [isAdmin, events]);

  useEffect(() => {
    if (editor) window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [editor]);

  const grouped = useMemo(() => {
    const upcoming = events.filter((e) => !isPastEvent(e)).sort((a, b) => new Date(a.date) - new Date(b.date));
    const past = events.filter(isPastEvent).sort((a, b) => new Date(b.date) - new Date(a.date));
    return { upcoming, past };
  }, [events]);

  const visible = grouped[view];

  const isAttending = (event) => (event.attendees || []).some((a) => String(a?._id || a) === String(user?._id));

  const handleRSVP = async (event) => {
    setRsvpBusy(event._id);
    try {
      const result = await rsvpEvent(event._id);
      toast.success(result.message);
      setEvents((list) => list.map((e) => {
        if (e._id !== event._id) return e;
        const others = (e.attendees || []).filter((a) => String(a?._id || a) !== String(user._id));
        return { ...e, attendees: result.attending ? [...others, user._id] : others };
      }));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRsvpBusy(null);
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await deleteEvent(pendingDelete._id);
      toast.success('Event deleted.');
      setEvents((list) => list.filter((e) => e._id !== pendingDelete._id));
      setPendingDelete(null);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDeleting(false);
    }
  };

  const handleSaved = (saved) => {
    setEvents((list) => (editor === 'new'
      ? [saved, ...list]
      : list.map((e) => (e._id === saved._id ? { ...e, ...saved } : e))));
    setEditor(null);
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Events</h1>
          <p className="text-muted-fg mt-1">RSVP to upcoming events and browse photos from past ones.</p>
        </div>
        {isAdmin && !editor && (
          <button type="button" onClick={() => setEditor('new')} className="btn-primary">
            <HiPlus className="w-4 h-4" aria-hidden="true" /> New event
          </button>
        )}
      </div>

      {editor && (
        <div className="mb-8">
          <EventForm
            key={editor === 'new' ? 'new' : editor._id}
            event={editor === 'new' ? null : editor}
            onSaved={handleSaved}
            onCancel={() => setEditor(null)}
          />
        </div>
      )}

      <div className="flex gap-2 mb-5" role="tablist" aria-label="Event timeframe">
        {VIEWS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={view === option.id}
            onClick={() => setView(option.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              view === option.id ? 'bg-primary-500 text-white' : 'bg-muted text-muted-fg hover:bg-muted-strong'
            }`}
          >
            {option.label}
            {!loading && <span className="ml-1.5 opacity-75">{grouped[option.id].length}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <SkeletonList count={4} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={HiCalendar}
          title={view === 'upcoming' ? 'No upcoming events' : 'No past events yet'}
          description={view === 'upcoming' ? 'New events will appear here as soon as they are announced.' : 'Events move here once they have taken place.'}
          action={isAdmin && view === 'upcoming' ? 'Create an event' : undefined}
          onAction={isAdmin ? () => setEditor('new') : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((event) => {
            const date = new Date(event.date);
            const attending = isAttending(event);
            const count = event.attendees?.length || 0;
            const full = event.maxAttendees > 0 && count >= event.maxAttendees;
            const canRsvp = view === 'upcoming' && event.status !== 'cancelled';

            return (
              <li key={event._id} className="card p-4 flex flex-col sm:flex-row gap-4">
                <Link href={`/events/${event._id}`} tabIndex={-1} aria-hidden="true">
                  <EventThumb event={event} />
                </Link>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className={`${STATUS_BADGES[event.status] || 'badge-neutral'} capitalize`}>{event.status}</span>
                    <span className="badge-neutral capitalize">{event.category}</span>
                    {attending && <span className="badge-brand">You&apos;re going</span>}
                  </div>
                  <h2 className="font-semibold text-strong text-lg leading-snug">
                    <Link href={`/events/${event._id}`} className="hover:text-primary-500 dark:hover:text-primary-300">{event.title}</Link>
                  </h2>
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5 text-sm text-subtle">
                    {isValid(date) && (
                      <span className="inline-flex items-center gap-1">
                        <HiCalendar className="w-4 h-4" aria-hidden="true" /> {format(date, 'EEE d MMM yyyy, h:mm a')}
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 min-w-0">
                      <HiLocationMarker className="w-4 h-4 shrink-0" aria-hidden="true" /> <span className="truncate">{event.location}</span>
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <HiUsers className="w-4 h-4" aria-hidden="true" /> {count}{event.maxAttendees > 0 ? ` of ${event.maxAttendees}` : ''} attending
                    </span>
                  </div>
                </div>

                <div className="flex sm:flex-col items-stretch sm:items-end justify-between sm:justify-center gap-2 shrink-0">
                  {canRsvp && (
                    <button
                      type="button"
                      onClick={() => handleRSVP(event)}
                      disabled={rsvpBusy === event._id || (full && !attending)}
                      className={attending ? 'btn-outline btn-sm' : 'btn-primary btn-sm'}
                    >
                      {rsvpBusy === event._id ? 'Saving…' : attending ? 'Cancel RSVP' : full ? 'Full' : 'RSVP'}
                    </button>
                  )}
                  {isAdmin && (
                    <div className="flex gap-1">
                      <button type="button" onClick={() => setEditor(event)} className="btn-ghost btn-sm" aria-label={`Edit ${event.title}`}>
                        <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit
                      </button>
                      <button type="button" onClick={() => setPendingDelete(event)} className="btn-ghost btn-sm text-danger" aria-label={`Delete ${event.title}`}>
                        <HiTrash className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={Boolean(pendingDelete)}
        title={`Delete "${pendingDelete?.title}"?`}
        description="The event, its RSVPs, its cover image and all of its photos will be permanently deleted."
        confirmLabel="Delete event"
        busy={deleting}
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  );
}
