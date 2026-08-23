'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { getAdminOverview } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { HiBell, HiBookOpen, HiCalendar, HiCash, HiCheckCircle, HiClipboardList, HiDocumentText, HiMail, HiRefresh, HiUserGroup, HiUsers, HiArrowRight } from 'react-icons/hi';

const metricCards = [
  { key: 'activeMembers', label: 'Active members', icon: HiUsers, color: 'blue', href: '/portal/members' },
  { key: 'pendingPayments', label: 'Pending payments', icon: HiCash, color: 'amber', href: '/portal/payments' },
  { key: 'pendingResources', label: 'Resources to review', icon: HiBookOpen, color: 'emerald', href: '/portal/library' },
  { key: 'unreadMessages', label: 'Unread messages', icon: HiMail, color: 'rose', href: '/portal/notifications' },
  { key: 'events', label: 'Live events', icon: HiCalendar, color: 'violet', href: '/portal/events' },
  { key: 'activeProjects', label: 'Active projects', icon: HiDocumentText, color: 'cyan', href: '/projects' },
  { key: 'activeElections', label: 'Open elections', icon: HiClipboardList, color: 'orange', href: '/portal/elections' },
  { key: 'publishedNews', label: 'Published articles', icon: HiBell, color: 'slate', href: '/news' },
];

const colorClasses = {
  blue: 'bg-blue-50 text-blue-600', amber: 'bg-amber-50 text-amber-600', emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600', violet: 'bg-violet-50 text-violet-600', cyan: 'bg-cyan-50 text-cyan-600',
  orange: 'bg-orange-50 text-orange-600', slate: 'bg-slate-100 text-slate-600'
};

const formatDate = (value) => new Date(value).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminPage() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = async () => {
    setLoading(true);
    setError('');
    try {
      setData(await getAdminOverview());
    } catch (err) {
      setError(err.message || 'Unable to load the admin overview');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') loadOverview();
    else setLoading(false);
  }, [user?.role]);

  if (user?.role !== 'admin') return <div className="card text-center py-20"><p className="text-gray-500 text-lg">Access denied. Admin role required.</p></div>;
  if (loading) return <LoadingSpinner size="lg" />;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-8">
        <div>
          <p className="text-primary-600 text-sm font-semibold uppercase tracking-wide">Administration</p>
          <h1 className="font-heading text-2xl sm:text-3xl font-bold text-gray-900 mt-1">Platform overview</h1>
          <p className="text-gray-600 mt-1">Monitor membership, content, payments, and activity from one place.</p>
        </div>
        <button onClick={loadOverview} className="btn-outline inline-flex items-center gap-2 self-start sm:self-auto" title="Refresh overview">
          <HiRefresh className="w-4 h-4" /> Refresh
        </button>
      </div>

      {error ? <div className="card border-red-200 bg-red-50 text-red-700 mb-6">{error}</div> : (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {metricCards.map(({ key, label, icon: Icon, color, href }) => (
              <Link key={key} href={href} className="card hover:border-primary-300 transition-colors">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorClasses[color]}`}><Icon className="w-5 h-5" /></div>
                <p className="text-2xl font-heading font-bold text-gray-900 mt-4">{data?.metrics?.[key] || 0}</p>
                <p className="text-xs text-gray-500 mt-1">{label}</p>
              </Link>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <ActivityPanel title="Recent members" icon={HiUserGroup} href="/portal/members">
              {(data?.recent?.users || []).map(item => <div key={item._id} className="flex items-center justify-between gap-3 py-3 border-b last:border-0"><div><p className="font-medium text-gray-900">{item.firstName} {item.lastName}</p><p className="text-xs text-gray-500">{item.department || 'Department not set'} • {item.role}</p></div><time className="text-xs text-gray-400">{formatDate(item.createdAt)}</time></div>)}
            </ActivityPanel>
            <ActivityPanel title="Payment activity" icon={HiCash} href="/portal/payments">
              {(data?.recent?.payments || []).map(item => <div key={item._id} className="flex items-center justify-between gap-3 py-3 border-b last:border-0"><div><p className="font-medium text-gray-900">{item.user?.firstName} {item.user?.lastName}</p><p className="text-xs text-gray-500">{item.type} • KSh {item.amount?.toLocaleString()}</p></div><span className={`text-xs font-medium capitalize ${item.status === 'verified' ? 'text-emerald-600' : item.status === 'rejected' ? 'text-rose-600' : 'text-amber-600'}`}>{item.status}</span></div>)}
            </ActivityPanel>
            <ActivityPanel title="Resource activity" icon={HiBookOpen} href="/portal/library">
              {(data?.recent?.resources || []).map(item => <div key={item._id} className="flex items-center justify-between gap-3 py-3 border-b last:border-0"><div className="min-w-0"><p className="font-medium text-gray-900 truncate">{item.title}</p><p className="text-xs text-gray-500">{item.unitCode || 'Unit not set'} • {item.uploadedBy?.firstName} {item.uploadedBy?.lastName}</p></div><span className="text-xs capitalize text-gray-500">{item.status}</span></div>)}
            </ActivityPanel>
            <ActivityPanel title="Contact messages" icon={HiMail} href="/contact">
              {(data?.recent?.contacts || []).map(item => <div key={item._id} className="flex items-center justify-between gap-3 py-3 border-b last:border-0"><div className="min-w-0"><p className="font-medium text-gray-900 truncate">{item.subject}</p><p className="text-xs text-gray-500">{item.name} • {item.email}</p></div><span className={`text-xs font-medium ${item.isRead ? 'text-gray-400' : 'text-rose-600'}`}>{item.isRead ? 'Read' : 'Unread'}</span></div>)}
            </ActivityPanel>
          </div>
        </>
      )}
    </div>
  );
}

function ActivityPanel({ title, icon: Icon, href, children }) {
  return <section className="card"><div className="flex items-center justify-between mb-2"><h2 className="font-heading text-lg font-semibold text-gray-900 flex items-center gap-2"><Icon className="w-5 h-5 text-primary-500" />{title}</h2><Link href={href} className="text-primary-600 text-sm inline-flex items-center gap-1">View <HiArrowRight className="w-4 h-4" /></Link></div>{children}</section>;
}