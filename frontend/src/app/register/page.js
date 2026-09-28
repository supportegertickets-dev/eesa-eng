'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { register } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { REG_NUMBER_EXAMPLE, REG_NUMBER_PATTERN, normalizeRegNumber } from '@/lib/members';
import toast from 'react-hot-toast';
import { HiCheckCircle, HiEye, HiEyeOff } from 'react-icons/hi';

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
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  // New accounts wait for the committee's approval, so success ends here
  // rather than signing the applicant in.
  const [received, setReceived] = useState(null);
  const { user, loading } = useAuth();
  const router = useRouter();

  // A signed-in member has no reason to see the registration form.
  useEffect(() => {
    if (!loading && user) router.replace('/portal');
  }, [loading, user, router]);

  const departments = [
    'Civil Engineering',
    'Mechanical Engineering',
    'Electrical Engineering',
    'Agricultural Engineering',
    'Industrial Technology',
    'Other',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (form.password !== form.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    // Mirror the server's policy so members hear about it before submitting.
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password)) {
      toast.error('Password must be at least 8 characters and include a letter and a number.');
      return;
    }

    const regNumber = normalizeRegNumber(form.regNumber);
    if (!REG_NUMBER_PATTERN.test(regNumber)) {
      toast.error(`Enter your engineering registration number, for example ${REG_NUMBER_EXAMPLE}.`);
      return;
    }

    setSubmitting(true);
    try {
      // eslint-disable-next-line no-unused-vars
      const { confirmPassword, ...userData } = form;
      setReceived(await register({ ...userData, regNumber }));
      window.scrollTo(0, 0);
    } catch (error) {
      toast.error(error.message || 'Registration failed');
    } finally {
      setSubmitting(false);
    }
  };

  const updateForm = (field, value) => setForm({ ...form, [field]: value });

  if (received) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas py-12 px-4">
        <div className="max-w-lg w-full card text-center" role="status">
          <HiCheckCircle className="w-14 h-14 text-success mx-auto" aria-hidden="true" />
          <h1 className="font-heading text-2xl font-bold text-strong mt-4">Registration received</h1>
          <p className="text-muted-fg mt-3">{received.message}</p>
          <p className="text-sm text-subtle mt-3">
            Nothing arrived after a few days? Check your spam folder, or{' '}
            <Link href="/contact" className="text-primary-500 dark:text-primary-300 font-medium hover:underline">contact the committee</Link>.
          </p>
          <Link href="/" className="btn-primary mt-6 inline-flex">Back to the home page</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas py-12 px-4">
      <div className="max-w-lg w-full">
        <div className="text-center mb-8">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="" width={64} height={64} className="w-16 h-16 rounded-full object-cover mx-auto mb-4 shadow-card" />
          <h1 className="font-heading text-3xl font-bold text-strong">Join EESA</h1>
          <p className="text-muted-fg mt-2">Create your membership account</p>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">First Name</label>
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
              <label className="block text-sm font-medium text-body mb-1">Last Name</label>
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
            <label className="block text-sm font-medium text-body mb-1">Email</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => updateForm('email', e.target.value)}
              className="input-field"
              placeholder="example@gmail.com"
            />
          </div>

          <div className="mb-4">
            <label className="block text-sm font-medium text-body mb-1">Username <span className="text-faint">(optional)</span></label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => updateForm('username', e.target.value)}
              className="input-field"
              placeholder="e.g. johndoe"
              maxLength={50}
            />
          </div>

          <div className="mb-4">
            <label htmlFor="regNumber" className="block text-sm font-medium text-body mb-1">Registration Number</label>
            <input
              id="regNumber"
              type="text"
              required
              value={form.regNumber}
              onChange={(e) => updateForm('regNumber', e.target.value)}
              onBlur={(e) => updateForm('regNumber', normalizeRegNumber(e.target.value))}
              className="input-field uppercase"
              placeholder={`e.g. ${REG_NUMBER_EXAMPLE}`}
              autoCapitalize="characters"
              aria-describedby="regNumber-hint"
            />
            <p id="regNumber-hint" className="text-xs text-subtle mt-1">Your engineering registration number, as on your student ID.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Department</label>
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
              <label className="block text-sm font-medium text-body mb-1">Year of Study</label>
              <select
                value={form.yearOfStudy}
                onChange={(e) => updateForm('yearOfStudy', parseInt(e.target.value))}
                className="input-field"
              >
                {[1, 2, 3, 4, 5].map((year) => (
                  <option key={year} value={year}>Year {year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-body mb-1">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  minLength={8}
                  value={form.password}
                  onChange={(e) => updateForm('password', e.target.value)}
                  className="input-field pr-10"
                  placeholder="At least 8 characters, including a letter and a number"
                />
                <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted-fg">
                  {showPassword ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-body mb-1">Confirm Password</label>
              <div className="relative">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  required
                  value={form.confirmPassword}
                  onChange={(e) => updateForm('confirmPassword', e.target.value)}
                  className="input-field pr-10"
                  placeholder="Repeat password"
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-faint hover:text-muted-fg">
                  {showConfirm ? <HiEyeOff className="w-5 h-5" /> : <HiEye className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>

          <p className="text-sm text-muted-fg mb-4">
            Use your real name as it appears on your student ID. The EESA committee checks every new account,
            and you can sign in once yours is approved.
          </p>

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
          <p className="text-center text-sm text-muted-fg mt-4">
            Already a member?{' '}
            <Link href="/login" className="text-primary-500 dark:text-primary-300 font-medium hover:underline">
              Sign In
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
