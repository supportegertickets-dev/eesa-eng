'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { getEvent, rsvpEvent } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { HiCalendar, HiLocationMarker, HiUsers, HiArrowLeft } from 'react-icons/hi';
import Link from 'next/link';

export default function EventDetailPage({ params }) {
  const { id } = params;
  const [event, setEvent] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    loadEvent();
  }, [id]);

  const loadEvent = async () => {
    try {
      const data = await getEvent(id);
      setEvent(data);
    } catch {
      toast.error('Event not found');
      router.push('/events');
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async () => {
    if (!user) {
      router.push('/login');
      return;
    }
    try {
      const result = await rsvpEvent(id);
      toast.success(result.message);
      loadEvent();
    } catch (error) {
      toast.error(error.message);
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!event) return null;

  const isAttending = user && event.attendees?.some(a => a._id === user._id);

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/events" className="inline-flex items-center text-gray-200 hover:text-white mb-6 transition-colors">
            <HiArrowLeft className="w-5 h-5 mr-1" /> Back to Events
          </Link>
          <div className="flex items-center gap-3 mb-4">
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium capitalize">
              {event.category}
            </span>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium capitalize">
              {event.status}
            </span>
          </div>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold mb-4">{event.title}</h1>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
              {event.image && (
                <img src={event.image} alt={event.title} className="w-full rounded-xl mb-8 shadow-md" />
              )}
              <div className="card">
                <h2 className="font-heading text-xl font-semibold mb-4">About This Event</h2>
                <p className="text-gray-700 whitespace-pre-wrap leading-relaxed">{event.description}</p>
              </div>
            </div>

            <div className="space-y-6">
              <div className="card">
                <h3 className="font-heading font-semibold mb-4">Event Details</h3>
                <div className="space-y-4">
                  <div className="flex items-start gap-3">
                    <HiCalendar className="w-5 h-5 text-primary-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Date & Time</p>
                      <p className="text-gray-600 text-sm">
                        {format(new Date(event.date), 'EEEE, MMMM dd, yyyy')}
                      </p>
                      <p className="text-gray-600 text-sm">
                        {format(new Date(event.date), 'h:mm a')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiLocationMarker className="w-5 h-5 text-primary-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Location</p>
                      <p className="text-gray-600 text-sm">{event.location}</p>
                    </div>
                  </div>
                  <div className="flex items-start gap-3">
                    <HiUsers className="w-5 h-5 text-primary-500 mt-0.5" />
                    <div>
                      <p className="font-medium text-sm">Attendees</p>
                      <p className="text-gray-600 text-sm">
                        {event.attendees?.length || 0}
                        {event.maxAttendees > 0 ? ` / ${event.maxAttendees}` : ''} attending
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {event.organizer && (
                <div className="card">
                  <h3 className="font-heading font-semibold mb-2">Organizer</h3>
                  <p className="text-gray-600 text-sm">
                    {event.organizer.firstName} {event.organizer.lastName}
                  </p>
                </div>
              )}

              {event.status === 'upcoming' && (
                <button
                  onClick={handleRSVP}
                  className={`w-full py-3 rounded-lg font-semibold transition-colors ${
                    isAttending
                      ? 'bg-red-500 text-white hover:bg-red-600'
                      : 'btn-accent'
                  }`}
                >
                  {isAttending ? 'Cancel RSVP' : 'RSVP Now'}
                </button>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
