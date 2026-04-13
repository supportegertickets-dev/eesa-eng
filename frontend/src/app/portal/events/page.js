'use client';

import { useState, useEffect } from 'react';
import { getEvents, rsvpEvent, createEvent, deleteEvent } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { format } from 'date-fns';
import { HiCalendar, HiLocationMarker, HiPlus, HiTrash } from 'react-icons/hi';

export default function PortalEventsPage() {
  const { user } = useAuth();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = user?.role === 'admin' || user?.role === 'leader';

  useEffect(() => {
    loadEvents();
  }, []);

  const loadEvents = async () => {
    try {
      const data = await getEvents('?limit=50');
      setEvents(data.events || []);
    } catch (error) {
      console.error('Error loading events:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRSVP = async (eventId) => {
    try {
      const result = await rsvpEvent(eventId);
      toast.success(result.message);
      loadEvents();
    } catch (error) {
      toast.error(error.message);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this event?')) return;
    try {
      await deleteEvent(id);
      toast.success('Event deleted');
      loadEvents();
    } catch (err) { toast.error(err.message); }
  };

  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-heading text-2xl font-bold text-gray-900">Events</h1>
        {isAdmin && (
          <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
            <HiPlus className="w-4 h-4" /> New Event
          </button>
        )}
      </div>

      {showCreate && <EventQuickForm onCreated={() => { setShowCreate(false); loadEvents(); }} onCancel={() => setShowCreate(false)} />}

      {events.length > 0 ? (
        <div className="space-y-4">
          {events.map((event) => {
            const isAttending = event.attendees?.some(a => 
              (typeof a === 'string' ? a : a._id) === user?._id
            );

            return (
              <div key={event._id} className="card flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                  <HiCalendar className="w-7 h-7 text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900">{event.title}</h3>
                  <div className="flex flex-wrap gap-4 mt-1 text-sm text-gray-500">
                    <span className="flex items-center gap-1">
                      <HiCalendar className="w-4 h-4" />
                      {format(new Date(event.date), 'MMM dd, yyyy • h:mm a')}
                    </span>
                    <span className="flex items-center gap-1">
                      <HiLocationMarker className="w-4 h-4" />
                      {event.location}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                      event.status === 'upcoming' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                    }`}>
                      {event.status}
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700 capitalize">
                      {event.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {event.status === 'upcoming' && (
                    <button
                      onClick={() => handleRSVP(event._id)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        isAttending
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-primary-100 text-primary-700 hover:bg-primary-200'
                      }`}
                    >
                      {isAttending ? 'Cancel RSVP' : 'RSVP'}
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(event._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete event">
                      <HiTrash className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500">No events available</p>
        </div>
      )}
    </div>
  );
}

function EventQuickForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ title: '', description: '', date: '', location: '', category: 'other' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createEvent(form);
      toast.success('Event created!');
      onCreated();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Create Event</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea required value={form.description} onChange={e => setForm({...form, description: e.target.value})} className="input-field" rows={2} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
          <input type="datetime-local" required value={form.date} onChange={e => setForm({...form, date: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
          <input required value={form.location} onChange={e => setForm({...form, location: e.target.value})} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
          <select value={form.category} onChange={e => setForm({...form, category: e.target.value})} className="input-field">
            <option value="workshop">Workshop</option>
            <option value="seminar">Seminar</option>
            <option value="competition">Competition</option>
            <option value="social">Social</option>
            <option value="trip">Trip</option>
            <option value="meeting">Meeting</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Create
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}
