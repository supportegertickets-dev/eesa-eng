'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { HiMenu, HiX } from 'react-icons/hi';

export default function Navbar() {
  const { user, logout } = useAuth();
  const [isOpen, setIsOpen] = useState(false);

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/about', label: 'About' },
    { href: '/events', label: 'Events' },
    { href: '/projects', label: 'Projects' },
    { href: '/gallery', label: 'Gallery' },
    { href: '/news', label: 'News' },
    { href: '/contact', label: 'Contact' },
  ];

  return (
    <nav className="bg-primary-500 text-white shadow-lg sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-10 h-10 bg-accent-500 rounded-full flex items-center justify-center font-heading font-bold text-lg text-white">
              E
            </div>
            <span className="font-heading font-bold text-xl hidden sm:block">EESA</span>
          </Link>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center space-x-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="px-3 py-2 rounded-md text-sm font-medium hover:bg-primary-600 transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Auth Buttons */}
          <div className="hidden md:flex items-center space-x-3">
            {user ? (
              <>
                <Link
                  href="/portal"
                  className="px-4 py-2 bg-accent-500 text-white rounded-md text-sm font-medium hover:bg-accent-600 transition-colors"
                >
                  Portal
                </Link>
                <button
                  onClick={logout}
                  className="px-4 py-2 border border-white/30 rounded-md text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 border border-white/30 rounded-md text-sm font-medium hover:bg-primary-600 transition-colors"
                >
                  Login
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 bg-accent-500 text-white rounded-md text-sm font-medium hover:bg-accent-600 transition-colors"
                >
                  Join EESA
                </Link>
              </>
            )}
          </div>

          {/* Mobile menu button */}
          <button
            onClick={() => setIsOpen(!isOpen)}
            className="md:hidden p-2 rounded-md hover:bg-primary-600"
          >
            {isOpen ? <HiX className="w-6 h-6" /> : <HiMenu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Nav */}
        {isOpen && (
          <div className="md:hidden pb-4">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setIsOpen(false)}
                className="block px-3 py-2 rounded-md text-base font-medium hover:bg-primary-600 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-4 pt-4 border-t border-primary-400 space-y-2">
              {user ? (
                <>
                  <Link
                    href="/portal"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2 bg-accent-500 rounded-md text-center font-medium"
                  >
                    Portal
                  </Link>
                  <button
                    onClick={() => { logout(); setIsOpen(false); }}
                    className="block w-full px-3 py-2 border border-white/30 rounded-md font-medium"
                  >
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2 border border-white/30 rounded-md text-center font-medium"
                  >
                    Login
                  </Link>
                  <Link
                    href="/register"
                    onClick={() => setIsOpen(false)}
                    className="block px-3 py-2 bg-accent-500 rounded-md text-center font-medium"
                  >
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
