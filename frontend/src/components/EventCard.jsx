import Link from 'next/link';
import { format } from 'date-fns';
import { HiCalendar, HiLocationMarker, HiUsers } from 'react-icons/hi';

export default function EventCard({ event }) {
  const categoryColors = {
    workshop: 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
    seminar: 'bg-purple-100 dark:bg-purple-500/15 text-purple-800 dark:text-purple-300',
    competition: 'bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-300',
    social: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300',
    trip: 'bg-orange-100 dark:bg-orange-500/15 text-orange-800 dark:text-orange-300',
    meeting: 'bg-muted text-strong',
    other: 'bg-muted text-strong',
  };

  return (
    <div className="bg-surface rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-line">
      {event.image && (
        <div className="h-48 bg-muted-strong overflow-hidden">
          <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[event.category] || categoryColors.other}`}>
            {event.category}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            event.status === 'upcoming' ? 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300' :
            event.status === 'ongoing' ? 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300' :
            'bg-muted text-strong'
          }`}>
            {event.status}
          </span>
        </div>

        <h3 className="font-heading font-semibold text-lg text-strong mb-2">
          {event.title}
        </h3>

        <p className="text-muted-fg text-sm mb-4 line-clamp-2">
          {event.description}
        </p>

        <div className="space-y-2 text-sm text-subtle mb-4">
          <div className="flex items-center gap-2">
            <HiCalendar className="w-4 h-4 text-primary-500 dark:text-primary-300" />
            <span>{format(new Date(event.date), 'MMM dd, yyyy • h:mm a')}</span>
          </div>
          <div className="flex items-center gap-2">
            <HiLocationMarker className="w-4 h-4 text-primary-500 dark:text-primary-300" />
            <span>{event.location}</span>
          </div>
          {event.attendees && (
            <div className="flex items-center gap-2">
              <HiUsers className="w-4 h-4 text-primary-500 dark:text-primary-300" />
              <span>{event.attendees.length} attending</span>
            </div>
          )}
        </div>

        <Link
          href={`/events/${event._id}`}
          className="inline-flex items-center text-primary-500 dark:text-primary-300 font-medium text-sm hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}
