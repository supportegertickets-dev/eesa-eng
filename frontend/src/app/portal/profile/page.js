'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { updateProfile } from '@/lib/api';
import toast from 'react-hot-toast';

export default function ProfilePage() {
  const { user, setUser } = useAuth();
  const [form, setForm] = useState({
    firstName: user?.firstName || '',
    lastName: user?.lastName || '',
    bio: user?.bio || '',
    phone: user?.phone || '',
    department: user?.department || 'Other',
    yearOfStudy: user?.yearOfStudy || 1,
  });
  const [saving, setSaving] = useState(false);

  const departments = [
    'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
    'Agricultural Engineering', 'Other',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const updated = await updateProfile(form);
      setUser(prev => ({ ...prev, ...updated }));
      toast.success('Profile updated!');
    } catch (error) {
      toast.error(error.message || 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-gray-900 mb-8">My Profile</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Profile Card */}
        <div className="card text-center">
          <div className="w-24 h-24 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-3xl font-heading font-bold text-white">
              {user?.firstName?.[0]}{user?.lastName?.[0]}
            </span>
          </div>
          <h2 className="font-heading text-xl font-semibold">{user?.firstName} {user?.lastName}</h2>
          <p className="text-accent-600 font-medium capitalize text-sm">{user?.role}</p>
          <p className="text-gray-500 text-sm mt-1">{user?.department}</p>
          <p className="text-gray-500 text-sm">Year {user?.yearOfStudy}</p>
          {user?.regNumber && (
            <p className="text-gray-400 text-xs mt-2">{user.regNumber}</p>
          )}
          <p className="text-gray-400 text-xs mt-1">{user?.email}</p>
        </div>

        {/* Edit Form */}
        <div className="lg:col-span-2">
          <form onSubmit={handleSubmit} className="card">
            <h2 className="font-heading text-lg font-semibold mb-6">Edit Profile</h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="input-field"
                >
                  {departments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study</label>
                <select
                  value={form.yearOfStudy}
                  onChange={(e) => setForm({ ...form, yearOfStudy: parseInt(e.target.value) })}
                  className="input-field"
                >
                  {[1, 2, 3, 4, 5].map((y) => (
                    <option key={y} value={y}>Year {y}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="input-field"
                placeholder="+254 700 000 000"
              />
            </div>

            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Bio</label>
              <textarea
                rows={4}
                value={form.bio}
                onChange={(e) => setForm({ ...form, bio: e.target.value })}
                className="input-field resize-none"
                placeholder="Tell us about yourself..."
                maxLength={500}
              />
              <p className="text-xs text-gray-400 mt-1">{form.bio.length}/500</p>
            </div>

            <button type="submit" disabled={saving} className="btn-primary disabled:opacity-50">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
