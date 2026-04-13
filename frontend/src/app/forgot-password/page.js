'use client';

import { useState } from 'react';
import Link from 'next/link';
import { forgotPassword } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiMail, HiArrowLeft } from 'react-icons/hi';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await forgotPassword(email);
      setSent(true);
      toast.success('Reset link sent! Check your email.');
    } catch (error) {
      toast.error(error.message || 'Failed to send reset email');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiMail className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Forgot Password</h1>
          <p className="text-gray-600 mt-2">
            {sent
              ? 'Check your email for the reset link'
              : 'Enter your email to receive a password reset link'}
          </p>
        </div>

        {sent ? (
          <div className="card text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <HiMail className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Email Sent!</h2>
            <p className="text-gray-600 mb-6">
              If an account with <strong>{email}</strong> exists, you&apos;ll receive a password reset link shortly.
            </p>
            <Link href="/login" className="btn-primary inline-flex items-center gap-2">
              <HiArrowLeft className="w-4 h-4" />
              Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card">
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field"
                placeholder="you@egerton.ac.ke"
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? (
                <>
                  <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Sending...
                </>
              ) : 'Send Reset Link'}
            </button>
            <p className="text-center text-sm text-gray-600 mt-4">
              <Link href="/login" className="text-primary-500 font-medium hover:underline">
                Back to Login
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
