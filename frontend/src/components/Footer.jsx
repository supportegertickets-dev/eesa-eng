import Link from 'next/link';
import { HiMail, HiPhone, HiLocationMarker } from 'react-icons/hi';
import { FaWhatsapp, FaLinkedin, FaInstagram } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';
import { DEPARTMENT_PROFILES, departmentPath } from '@/lib/departments';

const QUICK_LINKS = [
  { href: '/about', label: 'About us' },
  { href: '/departments', label: 'Departments' },
  { href: '/events', label: 'Events' },
  { href: '/projects', label: 'Projects' },
  { href: '/news', label: 'News' },
  { href: '/contact', label: 'Contact' },
];

const SOCIALS = [
  { href: 'https://chat.whatsapp.com/ERuFPO3DPkF9r1QJwP8iak', label: 'WhatsApp group', icon: FaWhatsapp, hover: 'hover:text-green-400' },
  { href: 'https://x.com/EESA_Egertonuni', label: 'EESA on X', icon: FaXTwitter, hover: 'hover:text-accent-400' },
  { href: 'https://www.linkedin.com', label: 'EESA on LinkedIn', icon: FaLinkedin, hover: 'hover:text-accent-400' },
  { href: 'https://www.instagram.com', label: 'EESA on Instagram', icon: FaInstagram, hover: 'hover:text-accent-400' },
];

const CONTACT_EMAIL = 'egertonengineeringstudentsasso@gmail.com';

/**
 * Site footer.
 *
 * Deliberately dark in both themes, so its colours are fixed rather than
 * themed: a footer that flips to light would break the page's visual anchor,
 * and the semantic tokens exist for surfaces that should flip.
 */
export default function Footer() {
  return (
    <footer className="bg-[#12151b] text-slate-300 border-t border-white/10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-10">
          <div>
            <Link href="/" className="flex items-center gap-2 mb-4 w-fit">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/logo.png" alt="" className="w-10 h-10 rounded-full object-cover" width={40} height={40} />
              <span className="font-heading font-bold text-xl text-white">EESA</span>
            </Link>
            <p className="text-sm text-slate-400 mb-5 leading-relaxed">
              Egerton Engineering Student Association. Empowering future engineers through
              collaboration, innovation and community.
            </p>

            <ul className="flex gap-3">
              {SOCIALS.map(({ href, label, icon: Icon, hover }) => (
                <li key={label}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className={`inline-flex p-2 rounded-lg bg-white/5 text-slate-400 transition-colors ${hover}`}
                  >
                    <Icon className="w-4 h-4" aria-hidden="true" />
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <nav aria-labelledby="footer-links">
            <h2 id="footer-links" className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">
              Quick links
            </h2>
            <ul className="space-y-2.5">
              {QUICK_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm text-slate-400 hover:text-accent-400 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-labelledby="footer-departments">
            <h2 id="footer-departments" className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">
              Departments
            </h2>
            <ul className="space-y-2.5">
              {DEPARTMENT_PROFILES.map(({ slug, name }) => (
                <li key={slug}>
                  <Link href={departmentPath(slug)} className="text-sm text-slate-400 hover:text-accent-400 transition-colors">
                    {name}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div>
            <h2 className="text-white font-semibold mb-4 text-sm uppercase tracking-wide">Contact us</h2>
            <ul className="space-y-3 text-sm text-slate-400">
              <li className="flex items-start gap-2.5">
                <HiLocationMarker className="w-5 h-5 text-accent-500 shrink-0 mt-0.5" aria-hidden="true" />
                <span>Egerton University, Njoro, Kenya</span>
              </li>
              <li className="flex items-start gap-2.5">
                <HiMail className="w-5 h-5 text-accent-500 shrink-0 mt-0.5" aria-hidden="true" />
                {/* break-all keeps this long address from overflowing on a phone. */}
                <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-accent-400 transition-colors break-all">
                  {CONTACT_EMAIL}
                </a>
              </li>
              <li className="flex items-center gap-2.5">
                <HiPhone className="w-5 h-5 text-accent-500 shrink-0" aria-hidden="true" />
                <a href="tel:+254700000000" className="hover:text-accent-400 transition-colors">+254 700 000 000</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 mt-10 pt-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-500">
          <p>&copy; {new Date().getFullYear()} Egerton Engineering Student Association. All rights reserved.</p>
          <p>Njoro, Nakuru County, Kenya</p>
        </div>
      </div>
    </footer>
  );
}
