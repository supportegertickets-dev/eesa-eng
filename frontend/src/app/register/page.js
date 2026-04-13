'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import toast from 'react-hot-toast';

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    regNumber: '',
    department: 'Other',
    yearOfStudy: 1,
  });
  const [submitting, setSubmitting] = useState(false);
  const { loginUser } = useAuth();
  const router = useRouter();

  const departments = [
    'Civil Engineering',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Agricultural Engineering',
    'Chemical Engineering',
    'Other',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    setSubmitting(true);
    try {
      const { confirmPassword, ...userData } = form;
      const data = await register(userData);
      loginUser(data);
      toast.success('Welcome to EESA!');
      router.push('/portal');
    } catch (error) {
      toast.error(error.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (field, value) => setForm({ ...form, [field]: value });

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-heading font-bold text-white">E</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Join EESA</h1>
          <p className="text-gray-600 mt-2">Create your membership account</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => updateForm('firstName', e.target.value)}
                className="input-field"
                placeholder="John"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => updateForm('lastName', e.target.value)}
                className="input-field"
                placeholder="Doe"
              />
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              className="input-field"
              placeholder="you@egerton.ac.ke"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Username <span className="text-gray-400">(optional)</span></label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => updateForm('username', e.target.value)}
              className="input-field"
              placeholder="e.g. johndoe"
              minLength={3}
              maxLength={30}
              pattern="^[a-zA-Z0-9_]+$"
              title="Letters, numbers and underscores only"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Registration Number</label>
            <input
              type="text"
              value={form.regNumber}
              onChange={(e) => updateForm('regNumber', e.target.value)}
              className="input-field"
              placeholder="e.g. S13/12345/21"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <select
                value={form.department}
                onChange={(e) => updateForm('department', e.target.value)}
                className="input-field"
              >
                {departments.map((dept) => (
                  <option key={dept} value={dept}>{dept}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Year of Study</label>
              <select
                value={form.yearOfStudy}
                onChange={(e) => updateForm('yearOfStudy', parseInt(e.target.value))}
                className="input-field"
              >
                {[1, 2, 3, 4, 5, 6].map((year) => (
                  <option key={year} value={year}>Year {year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                required
                minLength={6}
                value={form.password}
                onChange={(e) => updateForm('password', e.target.value)}
                className="input-field"
                placeholder="Min 6 characters"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
              <input
                type="password"
                required
                value={form.confirmPassword}
                onChange={(e) => updateForm('confirmPassword', e.target.value)}
                className="input-field"
                placeholder="Repeat password"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Creating Account...
              </>
            ) : 'Create Account'}
          </button>
          <p className="text-center text-sm text-gray-600 mt-4">
            Already a member?{' '}
            <Link href="/login" className="text-primary-500 font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
