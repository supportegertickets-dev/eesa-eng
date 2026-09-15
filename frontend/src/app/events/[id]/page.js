'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format, isValid } from 'date-fns';
import toast from 'react-hot-toast';
import { HiArrowLeft, HiCalendar, HiLocationMarker, HiUsers, HiPencil, HiPhotograph } from 'react-icons/hi';
import { getAlbums, getEvent, rsvpEvent } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { albumHref, photoCountLabel } from '@/lib/gallery';
import { cloudinaryImage } from '@/lib/images';
import Avatar from '@/components/ui/Avatar';
import ErrorState from '@/components/ui/ErrorState';
import Lightbox from '@/components/ui/Lightbox';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';

const toDate = (value) => {
  const date = value ? new Date(value) : null;
  return date && isValid(date) ? date : null;
};

const fullName = (person) => [person?.firstName, person?.lastName].filter(Boolean).join(' ');

export default function EventDetailPage({ params }) {
  const { id } = params;
  const { user, isAdmin } = useAuth();

  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [rsvpBusy, setRsvpBusy] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(null);

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setEvent(await getEvent(id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Gallery albums linked to this event. Optional, so a failure shows nothing.
  const [albums, setAlbums] = useState([]);
  useEffect(() => {
    getAlbums(`?event=${id}&limit=4`).then((data) => setAlbums(data.albums || [])).catch(() => setAlbums([]));
  }, [id]);

  // The cover opens the viewer too, so it leads the gallery.
  const gallery = useMemo(() => {
    if (!event) return [];
    return [
      ...(event.image ? [{ url: event.image, alt: `${event.title} cover image` }] : []),
      ...(event.photos || []).map((photo, index) => ({ url: photo.url, alt: `Photo ${index + 1} from ${event.title}` })),
    ];
  }, [event]);

  const handleRSVP = async () => {
    setRsvpBusy(true);
    try {
      const result = await rsvpEvent(id);
      toast.success(result.message);
      await load({ quiet: true });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRsvpBusy(false);
    }
  };

  if (loading) {
    return (
      <div aria-busy="true">
        <Skeleton className="h-72 sm:h-96 w-full rounded-none" />
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10 grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 card"><SkeletonText lines={6} /></div>
          <div className="card"><SkeletonText lines={4} /></div>
        </div>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <Link href="/events" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong mb-6">
          <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> All events
        </Link>
        <ErrorState
          error={error}
          title={error?.status === 404 ? 'Event not found' : undefined}
          onRetry={error?.status === 404 ? undefined : () => load()}
        />
      </div>
    );
  }

  const start = toDate(event.date);
  const end = toDate(event.endDate);
  const sameDay = start && end && format(start, 'yyyy-MM-dd') === format(end, 'yyyy-MM-dd');
  const attendees = event.attendees || [];
  const isAttending = Boolean(user && attendees.some((a) => (a._id || a) === user._id));
  const capacity = event.maxAttendees > 0 ? event.maxAttendees : null;
  const isFull = capacity !== null && attendees.length >= capacity;
  const photos = event.photos || [];

  const rsvpControl = () => {
    if (event.status === 'cancelled') return <p className="text-sm text-danger font-medium">This event has been cancelled.</p>;
    if (event.status === 'completed') return <p className="text-sm text-muted-fg">This event has ended.</p>;
    if (!user) {
      return (
        <Link href={`/login?next=${encodeURIComponent(`/events/${id}`)}`} className="btn-accent w-full py-3">
          Sign in to RSVP
        </Link>
      );
    }
    if (isFull && !isAttending) {
      return <button type="button" disabled className="btn w-full py-3 bg-muted text-muted-fg">This event is full</button>;
    }
    return (
      <button
        type="button"
        onClick={handleRSVP}
        disabled={rsvpBusy}
        className={`w-full py-3 ${isAttending ? 'btn-outline' : 'btn-accent'}`}
        aria-pressed={isAttending}
      >
        {rsvpBusy ? 'Saving…' : isAttending ? 'Cancel my RSVP' : 'RSVP to attend'}
      </button>
    );
  };

  return (
    <div className="bg-canvas">
      <section className="relative isolate overflow-hidden text-white">
        {event.image ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={cloudinaryImage(event.image, { width: 1920, height: 900 })}
              alt=""
              className="absolute inset-0 -z-10 w-full h-full object-cover"
            />
            <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/50 to-black/30" />
          </>
        ) : (
          <div className="absolute inset-0 -z-10 bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800" />
        )}

        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-10 sm:pb-14 min-h-[18rem] sm:min-h-[26rem] flex flex-col">
          <div className="flex items-center justify-between gap-3">
            <Link href="/events" className="inline-flex items-center gap-1 text-sm text-white/85 hover:text-white">
              <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> All events
            </Link>
            {isAdmin && (
              <Link href={`/portal/events?edit=${event._id}`} className="btn-sm btn bg-white/15 hover:bg-white/25 text-white backdrop-blur">
                <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit event
              </Link>
            )}
          </div>

          <div className="mt-auto pt-12">
            <div className="flex flex-wrap gap-2 mb-4">
              <span className="badge bg-white/20 text-white capitalize backdrop-blur">{event.category}</span>
              <span className="badge bg-white/20 text-white capitalize backdrop-blur">{event.status}</span>
            </div>
            <h1 className="font-heading text-3xl sm:text-5xl font-bold leading-tight max-w-3xl">{event.title}</h1>
            <p className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-white/90">
              {start && (
                <span className="inline-flex items-center gap-2">
                  <HiCalendar className="w-5 h-5" aria-hidden="true" /> {format(start, 'EEEE d MMMM yyyy, h:mm a')}
                </span>
              )}
              <span className="inline-flex items-center gap-2">
                <HiLocationMarker className="w-5 h-5" aria-hidden="true" /> {event.location}
              </span>
            </p>
          </div>
        </div>
      </section>

      <section className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            <div className="card">
              <h2 className="font-heading text-xl font-semibold text-strong mb-4">About this event</h2>
              <p className="text-body whitespace-pre-wrap leading-relaxed">{event.description}</p>
            </div>

            {photos.length > 0 && (
              <div className="card">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-heading text-xl font-semibold text-strong">Photos</h2>
                  <span className="text-sm text-subtle inline-flex items-center gap-1">
                    <HiPhotograph className="w-4 h-4" aria-hidden="true" /> {gallery.length}
                  </span>
                </div>
                <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {gallery.map((image, index) => (
                    <li key={image.url}>
                      <button
                        type="button"
                        onClick={() => setLightboxIndex(index)}
                        className="group block w-full aspect-square overflow-hidden rounded-lg bg-muted"
                        aria-label={`Open ${image.alt}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={cloudinaryImage(image.url, { width: 400, height: 400 })}
                          alt=""
                          loading="lazy"
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </div>

          <aside className="space-y-6">
            <div className="card space-y-5">
              <h2 className="font-heading font-semibold text-strong">Event details</h2>

              {start && (
                <div className="flex items-start gap-3">
                  <HiCalendar className="w-5 h-5 text-primary-500 dark:text-primary-300 mt-0.5 shrink-0" aria-hidden="true" />
                  <div className="text-sm">
                    <p className="font-medium text-strong">{format(start, 'EEEE d MMMM yyyy')}</p>
                    <p className="text-muted-fg">
                      {format(start, 'h:mm a')}
                      {end ? ` to ${format(end, sameDay ? 'h:mm a' : 'd MMM, h:mm a')}` : ''}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex items-start gap-3">
                <HiLocationMarker className="w-5 h-5 text-primary-500 dark:text-primary-300 mt-0.5 shrink-0" aria-hidden="true" />
                <p className="text-sm font-medium text-strong">{event.location}</p>
              </div>

              <div className="flex items-start gap-3">
                <HiUsers className="w-5 h-5 text-primary-500 dark:text-primary-300 mt-0.5 shrink-0" aria-hidden="true" />
                <div className="text-sm flex-1">
                  <p className="font-medium text-strong">
                    {attendees.length} attending{capacity ? ` of ${capacity}` : ''}
                  </p>
                  {capacity && (
                    <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className="h-full bg-primary-500" style={{ width: `${Math.min(100, (attendees.length / capacity) * 100)}%` }} />
                    </div>
                  )}
                  {attendees.length > 0 && typeof attendees[0] === 'object' && (
                    <div className="flex -space-x-2 mt-3">
                      {attendees.slice(0, 8).map((person) => (
                        <Avatar key={person._id} src={person.avatar} name={fullName(person)} size="sm" ring />
                      ))}
                      {attendees.length > 8 && (
                        <span className="w-8 h-8 rounded-full bg-muted text-xs font-semibold text-muted-fg flex items-center justify-center ring-2 ring-surface">
                          +{attendees.length - 8}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-1">
                {rsvpControl()}
                {isAttending && event.status !== 'completed' && (
                  <p className="form-hint text-center mt-2">You&apos;re on the attendance list.</p>
                )}
              </div>
            </div>

            {event.organizer && (
              <div className="card flex items-center gap-3">
                <Avatar src={event.organizer.avatar} name={fullName(event.organizer)} size="md" />
                <div>
                  <p className="text-xs uppercase tracking-wide text-subtle">Organised by</p>
                  <p className="text-sm font-medium text-strong">{fullName(event.organizer)}</p>
                </div>
              </div>
            )}

            {albums.length > 0 && (
              <div className="card">
                <h2 className="font-heading font-semibold text-strong mb-3">In the gallery</h2>
                <ul className="space-y-3">
                  {albums.map((album) => (
                    <li key={album._id}>
                      <Link href={albumHref(album)} className="group flex items-center gap-3">
                        <span className="w-14 h-14 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
                          {album.cover?.url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={cloudinaryImage(album.cover.url, { width: 112, height: 112 })} alt="" loading="lazy" className="w-full h-full object-cover" />
                          ) : (
                            <HiPhotograph className="w-6 h-6 text-faint" aria-hidden="true" />
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-strong truncate group-hover:text-primary-500 dark:group-hover:text-primary-300">{album.title}</span>
                          <span className="block text-xs text-subtle">{photoCountLabel(album.photoCount)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}

          </aside>
        </div>
      </section>

      <Lightbox images={gallery} index={lightboxIndex} onClose={() => setLightboxIndex(null)} onIndexChange={setLightboxIndex} />
    </div>
  );
}
