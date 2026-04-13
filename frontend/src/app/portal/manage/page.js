'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { createEvent, createArticle, createProject } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiCalendar, HiNewspaper, HiLightBulb } from 'react-icons/hi';

export default function ManagePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('event');

  const LEADERSHIP_ROLES = ['admin', 'chairperson', 'vice_chairperson', 'organizing_secretary', 'secretary_general', 'publicity_manager', '1st_cohort_rep', 'treasurer'];
  if (!LEADERSHIP_ROLES.includes(user?.role)) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-500 text-lg">Access denied. Leadership only.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-gray-900 mb-8">Content Management</h1>

      {/* Tabs */}
      <div className="flex gap-2 mb-8 border-b">
        {[
          { id: 'event', label: 'New Event', icon: HiCalendar },
          { id: 'news', label: 'New Article', icon: HiNewspaper },
          { id: 'project', label: 'New Project', icon: HiLightBulb },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 font-medium text-sm border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'event' && <EventForm />}
      {activeTab === 'news' && <NewsForm />}
      {activeTab === 'project' && <ProjectForm />}
    </div>
  );
}

function EventForm() {
  const [form, setForm] = useState({
    title: '', description: '', date: '', location: '', category: 'other', maxAttendees: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createEvent(form);
      toast.success('Event created!');
      setForm({ title: '', description: '', date: '', location: '', category: 'other', maxAttendees: 0 });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl">
      <h2 className="font-heading text-lg font-semibold mb-6">Create Event</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={4} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date & Time</label>
            <input type="datetime-local" required value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} className="input-field" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" required value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} className="input-field" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {['workshop', 'seminar', 'competition', 'social', 'trip', 'meeting', 'other'].map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Max Attendees (0 = unlimited)</label>
            <input type="number" min="0" value={form.maxAttendees} onChange={(e) => setForm({ ...form, maxAttendees: parseInt(e.target.value) || 0 })} className="input-field" />
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-6 disabled:opacity-50">
        {submitting ? 'Creating...' : 'Create Event'}
      </button>
    </form>
  );
}

function NewsForm() {
  const [form, setForm] = useState({
    title: '', content: '', excerpt: '', category: 'announcement', isPublished: true,
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await createArticle(form);
      toast.success('Article created!');
      setForm({ title: '', content: '', excerpt: '', category: 'announcement', isPublished: true });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl">
      <h2 className="font-heading text-lg font-semibold mb-6">Create Article</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Excerpt</label>
          <input type="text" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} className="input-field" placeholder="Brief summary" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Content</label>
          <textarea rows={8} required value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} className="input-field resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {['announcement', 'achievement', 'update', 'article', 'other'].map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.isPublished} onChange={(e) => setForm({ ...form, isPublished: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-primary-500 focus:ring-primary-500" />
              <span className="text-sm font-medium text-gray-700">Publish immediately</span>
            </label>
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-6 disabled:opacity-50">
        {submitting ? 'Creating...' : 'Create Article'}
      </button>
    </form>
  );
}

function ProjectForm() {
  const [form, setForm] = useState({
    title: '', description: '', category: 'other', technologies: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = {
        ...form,
        technologies: form.technologies.split(',').map(t => t.trim()).filter(Boolean),
      };
      await createProject(data);
      toast.success('Project created!');
      setForm({ title: '', description: '', category: 'other', technologies: '' });
    } catch (error) {
      toast.error(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="card max-w-2xl">
      <h2 className="font-heading text-lg font-semibold mb-6">Create Project</h2>
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input type="text" required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="input-field" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea rows={4} required value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className="input-field resize-none" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="input-field">
              {['research', 'community', 'competition', 'innovation', 'other'].map(c => (
                <option key={c} value={c} className="capitalize">{c}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Technologies</label>
            <input type="text" value={form.technologies} onChange={(e) => setForm({ ...form, technologies: e.target.value })} className="input-field" placeholder="React, Node.js, Python..." />
          </div>
        </div>
      </div>
      <button type="submit" disabled={submitting} className="btn-primary mt-6 disabled:opacity-50">
        {submitting ? 'Creating...' : 'Create Project'}
      </button>
    </form>
  );
}
