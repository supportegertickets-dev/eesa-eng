'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { getNotifications } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import { HiHome, HiUser, HiCalendar, HiUsers, HiNewspaper, HiCog, HiLogout, HiCash, HiBookOpen, HiBell, HiPhotograph, HiClipboardList, HiStar, HiDotsHorizontal, HiX } from 'react-icons/hi';

export default function PortalLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMore, setMobileMore] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user) {
      getNotifications().then(data => {
        const unread = (data.notifications || []).filter(n => !n.readBy?.includes(user._id));
        setUnreadCount(unread.length);
      }).catch(() => {});
    }
  }, [user]);

  if (loading) return <LoadingSpinner size="lg" />;
  if (!user) return null;

  const navItems = [
    { href: '/portal', icon: HiHome, label: 'Dashboard' },
    { href: '/portal/profile', icon: HiUser, label: 'Profile' },
    { href: '/portal/elections', icon: HiClipboardList, label: 'Elections' },
    { href: '/portal/payments', icon: HiCash, label: 'Payments' },
    { href: '/portal/library', icon: HiBookOpen, label: 'Library' },
    { href: '/portal/notifications', icon: HiBell, label: 'Notifications', badge: unreadCount },
    { href: '/portal/gallery', icon: HiPhotograph, label: 'Gallery' },
    { href: '/portal/events', icon: HiCalendar, label: 'My Events' },
    { href: '/portal/members', icon: HiUsers, label: 'Members' },
  ];

  if (user.role === 'admin' || user.role === 'leader') {
    navItems.push({ href: '/portal/sponsors', icon: HiStar, label: 'Sponsors' });
    navItems.push({ href: '/portal/manage', icon: HiCog, label: 'Manage' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* Sidebar */}
        <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:top-16 bg-white border-r shadow-sm">
          <div className="flex flex-col flex-1 pt-6 pb-4 overflow-y-auto">
            <div className="px-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center text-white font-bold">
                  {user.firstName[0]}
                </div>
                <div>
                  <p className="font-semibold text-sm text-gray-900">{user.firstName} {user.lastName}</p>
                  <p className="text-xs text-gray-500 capitalize">{user.role}</p>
                </div>
              </div>
            </div>

            <nav className="flex-1 px-2 space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-primary-50 hover:text-primary-600 transition-colors"
                >
                  <item.icon className="w-5 h-5" />
                  <span className="flex-1">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="bg-red-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">{item.badge}</span>
                  )}
                </Link>
              ))}
            </nav>

            <div className="px-2 mt-auto">
              <button
                onClick={() => { logout(); router.push('/'); }}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 transition-colors w-full"
              >
                <HiLogout className="w-5 h-5" />
                Sign Out
              </button>
            </div>
          </div>
        </aside>

        {/* Mobile Nav */}
        <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg z-40">
          <div className="flex justify-around py-2">
            {navItems.slice(0, 4).map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="flex flex-col items-center p-2 text-gray-600 hover:text-primary-500 relative"
                onClick={() => setMobileMore(false)}
              >
                <item.icon className="w-5 h-5" />
                <span className="text-xs mt-1">{item.label}</span>
                {item.badge > 0 && (
                  <span className="absolute top-1 right-0 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{item.badge}</span>
                )}
              </Link>
            ))}
            <button
              onClick={() => setMobileMore(!mobileMore)}
              className="flex flex-col items-center p-2 text-gray-600 hover:text-primary-500"
            >
              {mobileMore ? <HiX className="w-5 h-5" /> : <HiDotsHorizontal className="w-5 h-5" />}
              <span className="text-xs mt-1">More</span>
            </button>
          </div>
        </div>

        {/* Mobile More Menu */}
        {mobileMore && (
          <div className="lg:hidden fixed inset-0 z-30" onClick={() => setMobileMore(false)}>
            <div className="absolute inset-0 bg-black/30" />
            <div className="absolute bottom-16 left-0 right-0 bg-white rounded-t-2xl shadow-2xl p-4 max-h-[70vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="grid grid-cols-3 gap-3">
                {navItems.slice(4).map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMore(false)}
                    className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-primary-50 text-gray-700 hover:text-primary-600 transition-colors relative"
                  >
                    <item.icon className="w-6 h-6" />
                    <span className="text-xs font-medium text-center">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">{item.badge}</span>
                    )}
                  </Link>
                ))}
                <button
                  onClick={() => { logout(); router.push('/'); }}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors"
                >
                  <HiLogout className="w-6 h-6" />
                  <span className="text-xs font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Main Content */}
        <main className="flex-1 lg:ml-64 pb-20 lg:pb-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
