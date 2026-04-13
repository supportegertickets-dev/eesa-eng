'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import toast from 'react-hot-toast';
import LoadingSpinner from '@/components/LoadingSpinner';
import { HiEye, HiEyeOff } from 'react-icons/hi';

export default function LoginPage() {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { loginUser } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const data = await login(form);
      loginUser(data);
      toast.success('Welcome back!');
      router.push('/portal');
    } catch (error) {
      toast.error(error.message || 'Login failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-full flex items-center justify-center mx-auto mb-4">
            <span className="text-2xl font-heading font-bold text-white">E</span>
          </div>
          <h1 className="font-heading text-3xl font-bold text-gray-900">Welcome Back</h1>
          <p className="text-gray-600 mt-2">Sign in to your EESA account</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Email or Username</label>
            <input
              type="text"
              required
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              className="input-field"
              placeholder="you@egerton.ac.ke or username"
            />
          </div>
          <div className="mb-2">
            <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field pr-10"
                placeholder="••••••••"
              />
              <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
              </button>
            </div>
          </div>
          <div className="mb-6 text-right">
            <Link href="/forgot-password" className="text-sm text-primary-500 hover:underline">
              Forgot password?
            </Link>
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="btn-primary w-full disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-5 h-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Signing in...
              </>
            ) : 'Sign In'}
          </button>
          <p className="text-center text-sm text-gray-600 mt-4">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary-500 font-medium hover:underline">
              Join EESA
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
