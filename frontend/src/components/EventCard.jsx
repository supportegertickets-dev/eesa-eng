import Link from 'next/link';
import { format, isValid } from 'date-fns';
import { HiCalendar, HiLocationMarker, HiUsers, HiPhotograph, HiArrowRight } from 'react-icons/hi';
import { cloudinaryImage } from '@/lib/images';
import { CATEGORY_GRADIENTS } from '@/lib/events';

export default function EventCard({ event }) {
  const date = new Date(event.date);
  const hasDate = isValid(date);
  const photoCount = event.photos?.length || 0;
  const attending = event.attendees?.length || 0;
  const href = `/events/${event._id}`;

  return (
    <article className="group card p-0 overflow-hidden flex flex-col hover:shadow-raised transition-shadow">
      {/* The image repeats the title link, so it is hidden from assistive tech and the tab order. */}
      <Link href={href} tabIndex={-1} aria-hidden="true" className="relative block aspect-video overflow-hidden bg-muted">
        {event.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryImage(event.image, { width: 800, height: 450 })}
            alt=""
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className={`w-full h-full bg-gradient-to-br ${CATEGORY_GRADIENTS[event.category] || CATEGORY_GRADIENTS.other} flex items-center justify-center`}>
            <HiCalendar className="w-14 h-14 text-white/40" />
          </div>
        )}

        {hasDate && (
          <span className="absolute top-3 left-3 flex flex-col items-center rounded-lg bg-white/95 text-gray-900 px-2.5 py-1 shadow-card leading-none">
            <span className="text-[11px] font-semibold uppercase text-primary-500">{format(date, 'MMM')}</span>
            <span className="text-lg font-bold">{format(date, 'd')}</span>
          </span>
        )}

        {photoCount > 0 && (
          <span className="absolute top-3 right-3 badge bg-black/60 text-white">
            <HiPhotograph className="w-3.5 h-3.5" /> {photoCount}
          </span>
        )}

        <span className="absolute bottom-3 left-3 flex gap-1.5">
          <span className="badge bg-black/60 text-white capitalize">{event.category}</span>
          {event.status !== 'upcoming' && (
            <span className="badge bg-black/60 text-white capitalize">{event.status}</span>
          )}
        </span>
      </Link>

      <div className="p-5 flex-1 flex flex-col">
        <h3 className="font-heading font-semibold text-lg text-strong leading-snug">
          <Link href={href} className="hover:text-primary-500 dark:hover:text-primary-300 transition-colors">
            {event.title}
          </Link>
        </h3>

        <p className="text-muted-fg text-sm mt-2 line-clamp-2">{event.description}</p>

        <ul className="space-y-1.5 text-sm text-subtle mt-4">
          {hasDate && (
            <li className="flex items-center gap-2">
              <HiCalendar className="w-4 h-4 shrink-0 text-primary-500 dark:text-primary-300" aria-hidden="true" />
              {format(date, 'EEE d MMM yyyy, h:mm a')}
            </li>
          )}
          <li className="flex items-center gap-2">
            <HiLocationMarker className="w-4 h-4 shrink-0 text-primary-500 dark:text-primary-300" aria-hidden="true" />
            <span className="truncate">{event.location}</span>
          </li>
          <li className="flex items-center gap-2">
            <HiUsers className="w-4 h-4 shrink-0 text-primary-500 dark:text-primary-300" aria-hidden="true" />
            {attending} attending{event.maxAttendees > 0 ? ` of ${event.maxAttendees}` : ''}
          </li>
        </ul>

        <Link
          href={href}
          className="mt-auto pt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-500 dark:text-primary-300 hover:gap-2 transition-all w-fit"
        >
          View details <HiArrowRight className="w-4 h-4" aria-hidden="true" />
          <span className="sr-only"> for {event.title}</span>
        </Link>
      </div>
    </article>
  );
}
