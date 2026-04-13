'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { getNotifications, createNotification, markNotificationRead, markAllNotificationsRead, deleteNotification } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiBell, HiPlus, HiCheck, HiCheckCircle, HiTrash, HiSpeakerphone, HiCash, HiClipboardList, HiBookOpen, HiCalendar } from 'react-icons/hi';
import { format } from 'date-fns';

const TYPE_ICONS = {
  general: HiBell,
  announcement: HiSpeakerphone,
  payment: HiCash,
  election: HiClipboardList,
  resource: HiBookOpen,
  event: HiCalendar,
};

export default function NotificationsPage() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const isAdmin = ['admin', 'chairperson'].includes(user?.role);

  useEffect(() => { loadNotifications(); }, []);

  const loadNotifications = async () => {
    try {
      const data = await getNotifications();
      setNotifications(data.notifications || data || []);
    } catch { toast.error('Failed to load notifications'); }
    finally { setLoading(false); }
  };

  const handleMarkRead = async (id) => {
    try {
      await markNotificationRead(id);
      setNotifications(prev => prev.map(n => n._id === id ? { ...n, readBy: [...(n.readBy || []), user._id] } : n));
    } catch (err) { toast.error(err.message); }
  };

  const handleMarkAllRead = async () => {
    try {
      await markAllNotificationsRead();
      setNotifications(prev => prev.map(n => ({ ...n, readBy: [...(n.readBy || []), user._id] })));
      toast.success('All marked as read');
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    try {
      await deleteNotification(id);
      setNotifications(prev => prev.filter(n => n._id !== id));
      toast.success('Notification deleted');
    } catch (err) { toast.error(err.message); }
  };

  const isRead = (n) => n.readBy?.includes(user?._id);
  const unreadCount = notifications.filter(n => !isRead(n)).length;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">
            Notifications
            {unreadCount > 0 && <span className="ml-2 text-sm bg-red-500 text-white px-2 py-0.5 rounded-full">{unreadCount}</span>}
          </h1>
          <p className="text-gray-600 text-sm mt-1">Stay updated with EESA announcements</p>
        </div>
        <div className="flex gap-2">
          {unreadCount > 0 && (
            <button onClick={handleMarkAllRead} className="px-4 py-2 text-sm font-medium text-primary-500 border border-primary-500 rounded-lg hover:bg-primary-50 flex items-center gap-1">
              <HiCheckCircle className="w-4 h-4" /> Mark All Read
            </button>
          )}
          {isAdmin && (
            <button onClick={() => setShowCreate(!showCreate)} className="btn-primary flex items-center gap-2">
              <HiPlus className="w-4 h-4" /> Send
            </button>
          )}
        </div>
      </div>

      {showCreate && <CreateNotificationForm onCreated={() => { setShowCreate(false); loadNotifications(); }} onCancel={() => setShowCreate(false)} />}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
      ) : notifications.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <HiBell className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No notifications</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => {
            const read = isRead(n);
            const Icon = TYPE_ICONS[n.type] || HiBell;
            return (
              <div key={n._id} className={`card flex items-start gap-3 ${read ? 'opacity-60' : 'border-l-4 border-l-primary-500'}`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${read ? 'bg-gray-100' : 'bg-primary-100'}`}>
                  <Icon className={`w-5 h-5 ${read ? 'text-gray-400' : 'text-primary-500'}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`font-medium ${read ? 'text-gray-600' : 'text-gray-900'}`}>{n.title}</p>
                  <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                  <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                    <span>{format(new Date(n.createdAt), 'MMM d, yyyy h:mm a')}</span>
                    <span className="capitalize">• {n.type}</span>
                    {n.createdBy && <span>• By {n.createdBy.firstName}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {!read && (
                    <button onClick={() => handleMarkRead(n._id)} className="p-1.5 text-primary-500 hover:bg-primary-50 rounded-lg" title="Mark read">
                      <HiCheck className="w-4 h-4" />
                    </button>
                  )}
                  {isAdmin && (
                    <button onClick={() => handleDelete(n._id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg" title="Delete">
                      <HiTrash className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CreateNotificationForm({ onCreated, onCancel }) {
  const [form, setForm] = useState({ title: '', message: '', type: 'general', target: 'all' });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createNotification(form);
      toast.success('Notification sent!');
      onCreated();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <form onSubmit={handleSubmit} className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Send Notification</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input required value={form.title} onChange={e => setForm({...form, title: e.target.value})} className="input-field" />
        </div>
        <div className="sm:col-span-2">
          <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
          <textarea required value={form.message} onChange={e => setForm({...form, message: e.target.value})} className="input-field" rows={3} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
          <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="input-field">
            <option value="general">General</option>
            <option value="announcement">Announcement</option>
            <option value="event">Event</option>
            <option value="payment">Payment</option>
            <option value="election">Election</option>
            <option value="resource">Resource</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Target</label>
          <select value={form.target} onChange={e => setForm({...form, target: e.target.value})} className="input-field">
            <option value="all">All Members</option>
            <option value="members">Members Only</option>
            <option value="leaders">Leaders Only</option>
          </select>
        </div>
      </div>
      <div className="flex gap-3 mt-4">
        <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
          {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
          Send
        </button>
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
      </div>
    </form>
  );
}
