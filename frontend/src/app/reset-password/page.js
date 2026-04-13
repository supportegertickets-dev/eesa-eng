'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { resetPassword } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiLockClosed, HiEye, HiEyeOff } from 'react-icons/hi';
import LoadingSpinner from '@/components/LoadingSpinner';

function ResetPasswordForm() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (!token) {
      toast.error('Invalid reset link');
      return;
    }
    setSubmitting(true);
    try {
      await resetPassword({ token, password });
      setSuccess(true);
      toast.success('Password reset successful!');
    } catch (error) {
      toast.error(error.message || 'Reset failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="card text-center">
        <p className="text-red-600 mb-4">Invalid or missing reset token.</p>
        <Link href="/forgot-password" className="btn-primary">Request New Link</Link>
      </div>
    );
  }

  if (success) {
    return (
      <div className="card text-center">
        <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <HiLockClosed className="w-8 h-8 text-green-600" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 mb-2">Password Reset!</h2>
        <p className="text-gray-600 mb-6">Your password has been changed successfully.</p>
        <Link href="/login" className="btn-primary">Sign In</Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">New Password</label>
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field pr-10"
            placeholder="Min 6 characters"
          />
          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
          </button>
        </div>
      </div>
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Confirm Password</label>
        <div className="relative">
          <input
            type={showConfirm ? 'text' : 'password'}
            required
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="input-field pr-10"
            placeholder="Repeat password"
          />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {showConfirm ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
          </button>
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
            Resetting...
          </>
        ) : 'Reset Password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <HiLockClosed className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Set New Password</h1>
          <p className="text-gray-600 mt-2">Enter your new password below</p>
        </div>
        <Suspense fallback={<LoadingSpinner />}>
          <ResetPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
