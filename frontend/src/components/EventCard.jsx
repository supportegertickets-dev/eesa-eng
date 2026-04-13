import Link from 'next/link';
import { format } from 'date-fns';
import { HiCalendar, HiLocationMarker, HiUsers } from 'react-icons/hi';

export default function EventCard({ event }) {
  const categoryColors = {
    workshop: 'bg-blue-100 text-blue-800',
    seminar: 'bg-purple-100 text-purple-800',
    competition: 'bg-red-100 text-red-800',
    social: 'bg-green-100 text-green-800',
    trip: 'bg-orange-100 text-orange-800',
    meeting: 'bg-gray-100 text-gray-800',
    other: 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-100">
      {event.image && (
        <div className="h-48 bg-gray-200 overflow-hidden">
          <img src={event.image} alt={event.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${categoryColors[event.category] || categoryColors.other}`}>
            {event.category}
          </span>
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${
            event.status === 'upcoming' ? 'bg-green-100 text-green-800' :
            event.status === 'ongoing' ? 'bg-yellow-100 text-yellow-800' :
            'bg-gray-100 text-gray-800'
          }`}>
            {event.status}
          </span>
        </div>

        <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
          {event.title}
        </h3>

        <p className="text-gray-600 text-sm mb-4 line-clamp-2">
          {event.description}
        </p>

        <div className="space-y-2 text-sm text-gray-500 mb-4">
          <div className="flex items-center gap-2">
            <HiCalendar className="w-4 h-4 text-primary-500" />
            <span>{format(new Date(event.date), 'MMM dd, yyyy • h:mm a')}</span>
          </div>
          <div className="flex items-center gap-2">
            <HiLocationMarker className="w-4 h-4 text-primary-500" />
            <span>{event.location}</span>
          </div>
          {event.attendees && (
            <div className="flex items-center gap-2">
              <HiUsers className="w-4 h-4 text-primary-500" />
              <span>{event.attendees.length} attending</span>
            </div>
          )}
        </div>

        <Link
          href={`/events/${event._id}`}
          className="inline-flex items-center text-primary-500 font-medium text-sm hover:text-primary-700 transition-colors"
        >
          View Details →
        </Link>
      </div>
    </div>
  );
}
