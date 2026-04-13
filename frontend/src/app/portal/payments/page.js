'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { submitPayment, getMyPayments, getAllPayments, verifyPayment, getPaymentStats, deletePayment, initiateMpesaPayment, checkMpesaStatus } from '@/lib/api';
import toast from 'react-hot-toast';
import { HiCash, HiPlus, HiCheckCircle, HiXCircle, HiClock, HiEye, HiTrash } from 'react-icons/hi';
import { format } from 'date-fns';

export default function PaymentsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState('my');
  const [payments, setPayments] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const isAdmin = ['admin', 'chairperson'].includes(user?.role);

  useEffect(() => { loadPayments(); }, [tab]);

  const loadPayments = async () => {
    setLoading(true);
    try {
      if (tab === 'all' && isAdmin) {
        const [data, s] = await Promise.all([getAllPayments(), getPaymentStats()]);
        setPayments(data.payments || []);
        setStats(s);
      } else {
        const data = await getMyPayments();
        setPayments(data.payments || data || []);
      }
    } catch { toast.error('Failed to load payments'); }
    finally { setLoading(false); }
  };

  const handleVerify = async (id, status, rejectionReason = '') => {
    try {
      await verifyPayment(id, { status, rejectionReason });
      toast.success(`Payment ${status}!`);
      loadPayments();
    } catch (err) { toast.error(err.message); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this payment?')) return;
    try {
      await deletePayment(id);
      toast.success('Payment deleted');
      loadPayments();
    } catch (err) { toast.error(err.message); }
  };

  const statusBadge = (s) => {
    const map = {
      pending: 'bg-yellow-100 text-yellow-700',
      verified: 'bg-green-100 text-green-700',
      rejected: 'bg-red-100 text-red-700',
    };
    return map[s] || 'bg-gray-100 text-gray-700';
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="font-heading text-2xl font-bold text-gray-900">Payments</h1>
          <p className="text-gray-600 text-sm mt-1">Registration & renewal fees</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary flex items-center gap-2">
          <HiPlus className="w-4 h-4" /> Submit Payment
        </button>
      </div>

      {isAdmin && (
        <div className="flex gap-2 mb-4">
          <button onClick={() => setTab('my')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'my' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>My Payments</button>
          <button onClick={() => setTab('all')} className={`px-4 py-2 rounded-lg text-sm font-medium ${tab === 'all' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700'}`}>All Payments</button>
        </div>
      )}

      {tab === 'all' && stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
          <div className="card text-center">
            <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
            <p className="text-xs text-gray-500">Total</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-yellow-600">{stats.pending || 0}</p>
            <p className="text-xs text-gray-500">Pending</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-green-600">{stats.verified || 0}</p>
            <p className="text-xs text-gray-500">Verified</p>
          </div>
          <div className="card text-center">
            <p className="text-2xl font-bold text-red-600">{stats.rejected || 0}</p>
            <p className="text-xs text-gray-500">Rejected</p>
          </div>
        </div>
      )}

      {showForm && <PaymentForm onSubmitted={() => { setShowForm(false); loadPayments(); }} onCancel={() => setShowForm(false)} />}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" /></div>
      ) : payments.length === 0 ? (
        <div className="card text-center py-12 text-gray-500">
          <HiCash className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p>No payments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {payments.map((p) => (
            <div key={p._id} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900 capitalize">{p.type} Fee</p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                  </div>
                  {tab === 'all' && p.user && <p className="text-sm text-gray-600">{p.user.firstName} {p.user.lastName} — {p.user.email}</p>}
                  <p className="text-sm text-gray-500">KES {p.amount} • {p.reference} {p.paymentMethod === 'mpesa' && <span className="inline-block bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded ml-1">M-Pesa</span>}</p>
                  {p.semester && <p className="text-xs text-gray-400">{p.semester} — {p.academicYear}</p>}
                  <p className="text-xs text-gray-400">{format(new Date(p.createdAt), 'MMM d, yyyy h:mm a')}</p>
                  {p.rejectionReason && <p className="text-xs text-red-500 mt-1">Reason: {p.rejectionReason}</p>}
                </div>
                <div className="flex items-center gap-2">
                  {p.proofScreenshot && (
                    <a href={p.proofScreenshot} target="_blank" rel="noopener noreferrer" className="text-primary-500 hover:text-primary-600">
                      <HiEye className="w-5 h-5" />
                    </a>
                  )}
                  {tab === 'all' && isAdmin && p.status === 'pending' && (
                    <>
                      <button onClick={() => handleVerify(p._id, 'verified')} className="p-2 text-green-600 hover:bg-green-50 rounded-lg" title="Verify">
                        <HiCheckCircle className="w-5 h-5" />
                      </button>
                      <button onClick={() => {
                        const reason = prompt('Rejection reason:');
                        if (reason) handleVerify(p._id, 'rejected', reason);
                      }} className="p-2 text-red-600 hover:bg-red-50 rounded-lg" title="Reject">
                        <HiXCircle className="w-5 h-5" />
                      </button>
                    </>
                  )}
                  {tab === 'all' && isAdmin && (
                    <button onClick={() => handleDelete(p._id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg" title="Delete">
                      <HiTrash className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PaymentForm({ onSubmitted, onCancel }) {
  const [method, setMethod] = useState('mpesa');
  const [form, setForm] = useState({ type: 'registration', amount: '', reference: '', semester: '', academicYear: '', notes: '', phone: '' });
  const [proof, setProof] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mpesaStatus, setMpesaStatus] = useState(null); // null | 'sent' | 'checking' | 'success' | 'failed'
  const [checkoutId, setCheckoutId] = useState(null);
  const pollRef = useRef(null);

  useEffect(() => { return () => { if (pollRef.current) clearInterval(pollRef.current); }; }, []);

  const handleMpesa = async (e) => {
    e.preventDefault();
    if (!form.phone || !form.amount) return toast.error('Phone and amount are required');
    setSubmitting(true);
    try {
      const res = await initiateMpesaPayment({
        phone: form.phone,
        amount: form.amount,
        type: form.type,
        semester: form.semester,
        academicYear: form.academicYear,
      });
      toast.success(res.message || 'STK Push sent!');
      setCheckoutId(res.checkoutRequestID);
      setMpesaStatus('sent');

      // Poll for status
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts++;
        try {
          const s = await checkMpesaStatus(res.checkoutRequestID);
          if (s.status === 'verified') {
            clearInterval(pollRef.current);
            setMpesaStatus('success');
            toast.success('Payment confirmed!');
            setTimeout(() => onSubmitted(), 1500);
          } else if (s.status === 'rejected') {
            clearInterval(pollRef.current);
            setMpesaStatus('failed');
            toast.error('Payment was not completed');
          }
        } catch {}
        if (attempts >= 30) {
          clearInterval(pollRef.current);
          setMpesaStatus(null);
          toast('Timeout — check your payments list for the status.', { icon: '⏰' });
        }
      }, 5000);
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  const handleManual = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => { if (v && k !== 'phone') fd.append(k, v); });
      if (proof) fd.append('proofScreenshot', proof);
      await submitPayment(fd);
      toast.success('Payment submitted for verification!');
      onSubmitted();
    } catch (err) { toast.error(err.message); }
    finally { setSubmitting(false); }
  };

  return (
    <div className="card mb-6 border-2 border-primary-200">
      <h3 className="font-semibold text-lg mb-4">Submit Payment</h3>

      {/* Method tabs */}
      <div className="flex gap-2 mb-5">
        <button type="button" onClick={() => setMethod('mpesa')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${method === 'mpesa' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          M-Pesa (STK Push)
        </button>
        <button type="button" onClick={() => setMethod('manual')}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${method === 'manual' ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
          Manual Upload
        </button>
      </div>

      {method === 'mpesa' ? (
        <form onSubmit={handleMpesa}>
          {mpesaStatus === 'sent' ? (
            <div className="text-center py-8">
              <div className="w-12 h-12 mx-auto mb-4 animate-spin rounded-full border-4 border-green-500 border-t-transparent" />
              <p className="font-semibold text-gray-800">STK Push sent to your phone</p>
              <p className="text-sm text-gray-500 mt-1">Enter your M-Pesa PIN to complete the payment</p>
            </div>
          ) : mpesaStatus === 'success' ? (
            <div className="text-center py-8">
              <HiCheckCircle className="w-12 h-12 mx-auto text-green-500 mb-3" />
              <p className="font-semibold text-green-700">Payment Confirmed!</p>
            </div>
          ) : mpesaStatus === 'failed' ? (
            <div className="text-center py-8">
              <HiXCircle className="w-12 h-12 mx-auto text-red-500 mb-3" />
              <p className="font-semibold text-red-700">Payment Failed</p>
              <button type="button" onClick={() => setMpesaStatus(null)} className="text-sm text-primary-500 mt-2 underline">Try again</button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
                <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="input-field">
                  <option value="registration">Registration</option>
                  <option value="renewal">Renewal</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
                <input type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="input-field" placeholder="e.g., 500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">M-Pesa Phone Number</label>
                <input required value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="input-field" placeholder="e.g., 0712345678 or 254712345678" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
                <input value={form.semester} onChange={e => setForm({...form, semester: e.target.value})} className="input-field" placeholder="e.g., Sept-Dec 2024" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
                <input value={form.academicYear} onChange={e => setForm({...form, academicYear: e.target.value})} className="input-field" placeholder="e.g., 2024/2025" />
              </div>
            </div>
          )}
          {!mpesaStatus && (
            <div className="flex gap-3 mt-4">
              <button type="submit" disabled={submitting} className="bg-green-600 hover:bg-green-700 text-white px-5 py-2 rounded-lg text-sm font-medium disabled:opacity-50 flex items-center gap-2 transition">
                {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
                Pay with M-Pesa
              </button>
              <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
            </div>
          )}
        </form>
      ) : (
        <form onSubmit={handleManual}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={e => setForm({...form, type: e.target.value})} className="input-field">
                <option value="registration">Registration</option>
                <option value="renewal">Renewal</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES)</label>
              <input type="number" required value={form.amount} onChange={e => setForm({...form, amount: e.target.value})} className="input-field" placeholder="e.g., 500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">M-Pesa/Reference Code</label>
              <input required value={form.reference} onChange={e => setForm({...form, reference: e.target.value})} className="input-field" placeholder="e.g., SJK3D7HF2R" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Semester</label>
              <input value={form.semester} onChange={e => setForm({...form, semester: e.target.value})} className="input-field" placeholder="e.g., Sept-Dec 2024" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Academic Year</label>
              <input value={form.academicYear} onChange={e => setForm({...form, academicYear: e.target.value})} className="input-field" placeholder="e.g., 2024/2025" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Proof Screenshot</label>
              <input type="file" accept="image/*" onChange={e => setProof(e.target.files[0])} className="text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes (optional)</label>
              <textarea value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="input-field" rows={2} />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button type="submit" disabled={submitting} className="btn-primary disabled:opacity-50 flex items-center gap-2">
              {submitting && <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Submit
            </button>
            <button type="button" onClick={onCancel} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Cancel</button>
          </div>
        </form>
      )}
    </div>
  );
}
