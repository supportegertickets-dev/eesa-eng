'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { HiEye, HiEyeOff } from 'react-icons/hi';
import { login } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';

/**
 * Accept only same-site relative paths as a post-login destination, so the
 * `next` parameter cannot be abused to bounce a member to another site.
 */
const safeNext = (value) =>
  typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\')
    ? value
    : '/portal';

// Read from window rather than useSearchParams, which would force this
// statically rendered page behind a Suspense boundary.
const readNext = () =>
  typeof window === 'undefined' ? '/portal' : safeNext(new URLSearchParams(window.location.search).get('next'));

export default function LoginPage() {
  const [form, setForm] = useState({ identifier: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const { user, loading, loginUser } = useAuth();
  const router = useRouter();

  // A signed-in member has no reason to see this form.
  useEffect(() => {
    if (!loading && user) router.replace(readNext());
  }, [loading, user, router]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const data = await login({ ...form, identifier: form.identifier.trim() });
      loginUser(data);
      toast.success(`Welcome back, ${data.firstName}!`);
      router.push(readNext());
    } catch (err) {
      // Shown inline as well as in a toast, so it is still there after the toast
      // fades and is announced to screen readers.
      setError(err.message || 'Sign in failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center bg-canvas py-12 px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover mx-auto mb-4 shadow-card" />
          <h1 className="font-heading text-3xl font-bold text-strong">Welcome back</h1>
          <p className="text-muted-fg mt-2">Sign in to your EESA account</p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-5" noValidate={false}>
          {error && (
            <div role="alert" className="rounded-lg bg-danger-soft text-danger text-sm px-4 py-3">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="identifier" className="form-label">Email or username</label>
            <input
              id="identifier"
              name="identifier"
              type="text"
              required
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              value={form.identifier}
              onChange={(e) => setForm({ ...form, identifier: e.target.value })}
              className="input-field"
              placeholder="you@egerton.ac.ke or username"
              aria-invalid={Boolean(error)}
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="password" className="text-sm font-medium text-body">Password</label>
              <Link href="/forgot-password" className="text-sm text-primary-500 dark:text-primary-300 hover:underline">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="input-field pr-11"
                placeholder="Your password"
                aria-invalid={Boolean(error)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((shown) => !shown)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md text-faint hover:text-muted-fg"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
              >
                {showPassword ? <HiEyeOff className="w-5 h-5" aria-hidden="true" /> : <HiEye className="w-5 h-5" aria-hidden="true" />}
              </button>
            </div>
          </div>

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? (
              <>
                <span className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" aria-hidden="true" />
                Signing in…
              </>
            ) : 'Sign in'}
          </button>

          <p className="text-center text-sm text-muted-fg">
            Don&apos;t have an account?{' '}
            <Link href="/register" className="text-primary-500 dark:text-primary-300 font-medium hover:underline">
              Join EESA
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
