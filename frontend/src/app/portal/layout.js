'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { getNotifications } from '@/lib/api';
import { roleLabel, LEADERSHIP_ROLES, POWER_ROLES } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import { SkeletonList } from '@/components/ui/Skeleton';
import {
  HiHome, HiUser, HiCalendar, HiUsers, HiCog, HiLogout, HiCash, HiBookOpen,
  HiBell, HiPhotograph, HiClipboardList, HiStar, HiInformationCircle,
  HiDotsHorizontal, HiX, HiUserGroup,
} from 'react-icons/hi';

// How often the unread badge re-checks. The count was previously fetched once
// on mount, so a notification arriving mid-session never showed up.
const NOTIFICATION_POLL_MS = 60000;

export default function PortalLayout({ children }) {
  const { user, loading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  const [unreadCount, setUnreadCount] = useState(0);
  const [mobileMore, setMobileMore] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      // Preserve the destination so signing in returns here.
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [user, loading, router, pathname]);

  const refreshUnread = useCallback(async () => {
    if (!user) return;
    try {
      const data = await getNotifications();
      // The API now returns the count directly; the fallback keeps this working
      // against an older backend.
      setUnreadCount(
        typeof data?.unreadCount === 'number'
          ? data.unreadCount
          : (data?.notifications || []).filter((n) => !n.readBy?.includes(user._id)).length
      );
    } catch {
      // A failed poll should not interrupt the member; the badge simply keeps
      // its previous value.
    }
  }, [user]);

  useEffect(() => {
    if (!user) return undefined;
    refreshUnread();

    const interval = setInterval(refreshUnread, NOTIFICATION_POLL_MS);

    // Catch up immediately when the member returns to the tab, rather than
    // waiting out the rest of the interval.
    const onVisible = () => { if (document.visibilityState === 'visible') refreshUnread(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user, refreshUnread]);

  // Close the overflow sheet on navigation.
  useEffect(() => setMobileMore(false), [pathname]);

  const navItems = useMemo(() => {
    if (!user) return [];

    const items = [
      { href: '/portal', icon: HiHome, label: 'Dashboard' },
      { href: '/portal/profile', icon: HiUser, label: 'Profile' },
      { href: '/portal/elections', icon: HiClipboardList, label: 'Elections' },
      { href: '/portal/payments', icon: HiCash, label: 'Payments' },
      { href: '/portal/library', icon: HiBookOpen, label: 'Library' },
      { href: '/portal/notifications', icon: HiBell, label: 'Notifications', badge: unreadCount },
      { href: '/portal/gallery', icon: HiPhotograph, label: 'Gallery' },
      { href: '/portal/events', icon: HiCalendar, label: 'My Events' },
      { href: '/portal/members', icon: HiUsers, label: 'Members' },
      { href: '/portal/guide', icon: HiInformationCircle, label: 'Platform Guide' },
    ];

    if (LEADERSHIP_ROLES.includes(user.role)) {
      items.push({ href: '/portal/sponsors', icon: HiStar, label: 'Sponsors' });
    }
    if (user.role === 'admin') {
      items.push({ href: '/portal/admin', icon: HiCog, label: 'Admin Overview' });
    }
    if (POWER_ROLES.includes(user.role)) {
      items.push({ href: '/portal/admin/members', icon: HiUserGroup, label: 'Manage Members' });
      items.push({ href: '/portal/manage', icon: HiCog, label: 'Manage' });
    }

    return items;
  }, [user, unreadCount]);

  /**
   * Highlight the current section: the most specific item containing this page,
   * so Manage Members does not also light up Admin Overview. `/portal` must
   * match exactly, or it would stay lit on every page beneath it.
   */
  const currentHref = useMemo(() => navItems
    .map((item) => item.href)
    .filter((href) => (href === '/portal' ? pathname === '/portal' : pathname === href || pathname.startsWith(`${href}/`)))
    .sort((a, b) => b.length - a.length)[0], [navItems, pathname]);

  const isCurrent = (href) => href === currentHref;

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div className="skeleton h-8 w-48 mb-6" />
        <SkeletonList count={4} />
      </div>
    );
  }

  if (!user) return null;

  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ');
  const signOut = () => logout({ redirect: '/' });

  const navLinkClass = (current) =>
    `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      current
        ? 'bg-primary-500/10 text-primary-500 dark:text-primary-300'
        : 'text-body hover:bg-muted hover:text-strong'
    }`;

  return (
    <div className="min-h-screen bg-canvas">
      <div className="flex">
        <aside
          className="hidden lg:flex lg:flex-col lg:w-64 lg:fixed lg:inset-y-0 lg:top-16 bg-surface border-r border-line"
          aria-label="Portal navigation"
        >
          <div className="flex flex-col flex-1 pt-6 pb-4 overflow-y-auto">
            <Link
              href="/portal/profile"
              className="mx-2 px-2 py-2 mb-4 rounded-lg flex items-center gap-3 hover:bg-muted transition-colors"
            >
              <Avatar src={user.avatar} name={fullName} size="md" />
              <span className="min-w-0">
                <span className="block font-semibold text-sm text-strong truncate">{fullName}</span>
                <span className="block text-xs text-subtle truncate">{roleLabel(user.role)}</span>
              </span>
            </Link>

            <nav className="flex-1 px-2 space-y-0.5">
              {navItems.map((item) => {
                const current = isCurrent(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    aria-current={current ? 'page' : undefined}
                    className={navLinkClass(current)}
                  >
                    <item.icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className="flex-1">{item.label}</span>
                    {item.badge > 0 && (
                      <span className="bg-danger text-white text-xs font-bold px-2 py-0.5 rounded-full">
                        {item.badge > 99 ? '99+' : item.badge}
                        <span className="sr-only"> unread</span>
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>

            <div className="px-2 mt-auto pt-4">
              <button
                type="button"
                onClick={signOut}
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-danger hover:bg-danger-soft transition-colors w-full"
              >
                <HiLogout className="w-5 h-5" aria-hidden="true" />
                Sign out
              </button>
            </div>
          </div>
        </aside>

        {/* Bottom bar: the four most-used destinations, plus an overflow sheet. */}
        <nav
          className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-line shadow-overlay z-40 pb-[env(safe-area-inset-bottom)]"
          aria-label="Portal navigation"
        >
          <div className="flex justify-around py-1.5">
            {navItems.slice(0, 4).map((item) => {
              const current = isCurrent(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={current ? 'page' : undefined}
                  className={`flex flex-col items-center px-2 py-1.5 rounded-lg relative transition-colors min-w-[4rem]
                    ${current ? 'text-primary-500 dark:text-primary-300' : 'text-subtle hover:text-body'}`}
                >
                  <item.icon className="w-5 h-5" aria-hidden="true" />
                  <span className="text-[11px] mt-0.5 font-medium">{item.label}</span>
                  {item.badge > 0 && (
                    <span className="absolute top-0.5 right-2 bg-danger text-white text-[10px] font-bold min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center">
                      {item.badge > 9 ? '9+' : item.badge}
                    </span>
                  )}
                </Link>
              );
            })}

            <button
              type="button"
              onClick={() => setMobileMore((open) => !open)}
              className={`flex flex-col items-center px-2 py-1.5 rounded-lg transition-colors min-w-[4rem]
                ${mobileMore ? 'text-primary-500 dark:text-primary-300' : 'text-subtle hover:text-body'}`}
              aria-expanded={mobileMore}
              aria-label={mobileMore ? 'Close more options' : 'More options'}
            >
              {mobileMore ? <HiX className="w-5 h-5" aria-hidden="true" /> : <HiDotsHorizontal className="w-5 h-5" aria-hidden="true" />}
              <span className="text-[11px] mt-0.5 font-medium">More</span>
            </button>
          </div>
        </nav>

        {mobileMore && (
          <div className="lg:hidden fixed inset-0 z-30" role="dialog" aria-modal="true" aria-label="More portal options">
            <button
              type="button"
              className="absolute inset-0 bg-black/40"
              onClick={() => setMobileMore(false)}
              aria-label="Close"
            />
            <div className="absolute bottom-14 left-0 right-0 bg-surface-raised border-t border-line rounded-t-2xl shadow-overlay p-4 pb-6 max-h-[70vh] overflow-y-auto animate-fade-in">
              <div className="w-10 h-1 rounded-full bg-muted-strong mx-auto mb-4" aria-hidden="true" />
              <div className="grid grid-cols-3 gap-2">
                {navItems.slice(4).map((item) => {
                  const current = isCurrent(item.href);
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      aria-current={current ? 'page' : undefined}
                      className={`flex flex-col items-center gap-1.5 p-3 rounded-xl transition-colors relative
                        ${current ? 'bg-primary-500/10 text-primary-500 dark:text-primary-300' : 'text-body hover:bg-muted'}`}
                    >
                      <item.icon className="w-6 h-6" aria-hidden="true" />
                      <span className="text-xs font-medium text-center leading-tight">{item.label}</span>
                      {item.badge > 0 && (
                        <span className="absolute top-2 right-2 bg-danger text-white text-[10px] font-bold min-w-[1rem] h-4 px-1 rounded-full flex items-center justify-center">
                          {item.badge > 9 ? '9+' : item.badge}
                        </span>
                      )}
                    </Link>
                  );
                })}

                <button
                  type="button"
                  onClick={signOut}
                  className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-danger hover:bg-danger-soft transition-colors"
                >
                  <HiLogout className="w-6 h-6" aria-hidden="true" />
                  <span className="text-xs font-medium">Sign out</span>
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 lg:ml-64 pb-24 lg:pb-0 min-w-0">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
