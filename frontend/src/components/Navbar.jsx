'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { roleLabel } from '@/lib/roles';
import Avatar from '@/components/ui/Avatar';
import ThemeToggle from '@/components/ui/ThemeToggle';
import { HiMenu, HiX, HiChevronDown, HiUser, HiViewGrid, HiLogout } from 'react-icons/hi';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/about', label: 'About' },
  { href: '/events', label: 'Events' },
  { href: '/projects', label: 'Projects' },
  { href: '/gallery', label: 'Gallery' },
  { href: '/news', label: 'News' },
  { href: '/contact', label: 'Contact' },
];

export default function Navbar() {
  const { user, logout, loading } = useAuth();
  const pathname = usePathname();

  const [menuOpen, setMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef(null);

  // Close both menus on navigation. Previously the mobile menu stayed open
  // behind the new page after every tap.
  useEffect(() => {
    setMenuOpen(false);
    setUserMenuOpen(false);
  }, [pathname]);

  // Lock body scroll while the mobile menu covers the page.
  useEffect(() => {
    document.body.classList.toggle('overflow-hidden', menuOpen);
    return () => document.body.classList.remove('overflow-hidden');
  }, [menuOpen]);

  useEffect(() => {
    if (!userMenuOpen) return undefined;

    const onPointerDown = (event) => {
      if (!userMenuRef.current?.contains(event.target)) setUserMenuOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setUserMenuOpen(false);
    };

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [userMenuOpen]);

  /**
   * A link is current when the path matches exactly, or sits beneath it. The
   * bar previously gave no indication of the current page at all.
   */
  const isCurrent = (href) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);

  const fullName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');

  return (
    <nav className="bg-primary-500 text-white shadow-raised sticky top-0 z-50" aria-label="Main">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0 rounded-md" aria-label="EESA home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.png" alt="" className="w-10 h-10 rounded-full object-cover bg-white/10" width={40} height={40} />
            <span className="font-heading font-bold text-xl hidden sm:block">EESA</span>
          </Link>

          <div className="hidden md:flex items-center gap-0.5">
            {NAV_LINKS.map((link) => {
              const current = isCurrent(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  aria-current={current ? 'page' : undefined}
                  className={`px-3 py-2 rounded-md text-sm font-medium transition-colors
                    ${current ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10 hover:text-white'}`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-2">
            <ThemeToggle />

            {loading ? (
              // Reserve the space the auth controls will occupy, so the bar does
              // not jump once the session resolves.
              <div className="w-28 h-9 rounded-md bg-white/10 animate-pulse" aria-hidden="true" />
            ) : user ? (
              <div className="relative" ref={userMenuRef}>
                <button
                  type="button"
                  onClick={() => setUserMenuOpen((open) => !open)}
                  className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-full hover:bg-white/10 transition-colors"
                  aria-haspopup="menu"
                  aria-expanded={userMenuOpen}
                  aria-label={`Account menu for ${fullName}`}
                >
                  <Avatar src={user.avatar} name={fullName} size="sm" tone="onBrand" />
                  <span className="text-sm font-medium max-w-[7rem] truncate">{user.firstName}</span>
                  <HiChevronDown className={`w-4 h-4 transition-transform ${userMenuOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>

                {userMenuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 mt-2 w-60 rounded-lg bg-surface-raised border border-line shadow-overlay py-1 animate-fade-in"
                  >
                    <div className="px-4 py-3 border-b border-line">
                      <p className="text-sm font-semibold text-strong truncate">{fullName}</p>
                      <p className="text-xs text-subtle truncate">{user.email}</p>
                      <span className="badge-brand mt-2">{roleLabel(user.role)}</span>
                    </div>

                    <Link href="/portal" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-muted transition-colors">
                      <HiViewGrid className="w-4 h-4 text-faint" aria-hidden="true" />
                      Member portal
                    </Link>
                    <Link href="/portal/profile" role="menuitem" className="flex items-center gap-3 px-4 py-2.5 text-sm text-body hover:bg-muted transition-colors">
                      <HiUser className="w-4 h-4 text-faint" aria-hidden="true" />
                      Your profile
                    </Link>

                    <div className="border-t border-line mt-1 pt-1">
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => logout({ redirect: '/' })}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger-soft transition-colors"
                      >
                        <HiLogout className="w-4 h-4" aria-hidden="true" />
                        Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <Link href="/login" className="px-4 py-2 border border-white/30 rounded-md text-sm font-medium hover:bg-white/10 transition-colors">
                  Sign in
                </Link>
                <Link href="/register" className="px-4 py-2 bg-accent-500 text-primary-900 rounded-md text-sm font-semibold hover:bg-accent-400 transition-colors">
                  Join EESA
                </Link>
              </>
            )}
          </div>

          <div className="flex md:hidden items-center gap-1">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              className="p-2 rounded-md hover:bg-white/10 transition-colors"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={menuOpen}
              aria-controls="mobile-menu"
            >
              {menuOpen ? <HiX className="w-6 h-6" aria-hidden="true" /> : <HiMenu className="w-6 h-6" aria-hidden="true" />}
            </button>
          </div>
        </div>

        {menuOpen && (
          <div id="mobile-menu" className="md:hidden pb-4 animate-fade-in">
            {user && (
              <div className="flex items-center gap-3 px-3 py-3 mb-2 rounded-lg bg-white/10">
                <Avatar src={user.avatar} name={fullName} size="md" tone="onBrand" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{fullName}</p>
                  <p className="text-xs text-white/70 truncate">{roleLabel(user.role)}</p>
                </div>
              </div>
            )}

            <div className="space-y-0.5">
              {NAV_LINKS.map((link) => {
                const current = isCurrent(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={current ? 'page' : undefined}
                    className={`block px-3 py-2.5 rounded-md text-base font-medium transition-colors
                      ${current ? 'bg-white/15 text-white' : 'text-white/85 hover:bg-white/10'}`}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </div>

            <div className="mt-4 pt-4 border-t border-white/20 space-y-2">
              {user ? (
                <>
                  <Link href="/portal" className="block px-3 py-2.5 bg-accent-500 text-primary-900 rounded-md text-center font-semibold">
                    Member portal
                  </Link>
                  <button
                    type="button"
                    onClick={() => logout({ redirect: '/' })}
                    className="block w-full px-3 py-2.5 border border-white/30 rounded-md font-medium hover:bg-white/10 transition-colors"
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link href="/login" className="block px-3 py-2.5 border border-white/30 rounded-md text-center font-medium hover:bg-white/10 transition-colors">
                    Sign in
                  </Link>
                  <Link href="/register" className="block px-3 py-2.5 bg-accent-500 text-primary-900 rounded-md text-center font-semibold">
                    Join EESA
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
