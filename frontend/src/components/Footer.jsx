import Link from 'next/link';
import { HiMail, HiPhone, HiLocationMarker } from 'react-icons/hi';
import { FaFacebook, FaWhatsapp, FaLinkedin, FaInstagram } from 'react-icons/fa';
import { FaXTwitter } from 'react-icons/fa6';

export default function Footer() {
  return (
    <footer className="bg-gray-900 text-gray-300">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-1 md:col-span-1">
            <div className="flex items-center space-x-2 mb-4">
              <img src="/logo.png" alt="EESA Logo" className="w-10 h-10 rounded-full object-cover" />
              <span className="font-heading font-bold text-xl text-white">EESA</span>
            </div>
            <p className="text-sm text-gray-400 mb-4">
              Egerton Engineering Student Association — empowering future engineers through 
              collaboration, innovation, and community.
            </p>
            <div className="flex space-x-3">
              <a href="https://chat.whatsapp.com/ERuFPO3DPkF9r1QJwP8iak" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-green-500 transition-colors" aria-label="WhatsApp">
                <FaWhatsapp className="w-5 h-5" />
              </a>
              <a href="https://x.com/EESA_Egertonuni" target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-accent-500 transition-colors" aria-label="X">
                <FaXTwitter className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-accent-500 transition-colors" aria-label="LinkedIn">
                <FaLinkedin className="w-5 h-5" />
              </a>
              <a href="#" className="text-gray-400 hover:text-accent-500 transition-colors" aria-label="Instagram">
                <FaInstagram className="w-5 h-5" />
              </a>
            </div>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="text-white font-semibold mb-4">Quick Links</h3>
            <ul className="space-y-2">
              {[
                { href: '/about', label: 'About Us' },
                { href: '/events', label: 'Events' },
                { href: '/projects', label: 'Projects' },
                { href: '/news', label: 'News' },
                { href: '/contact', label: 'Contact' },
              ].map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-sm hover:text-accent-500 transition-colors">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Departments */}
          <div>
            <h3 className="text-white font-semibold mb-4">Departments</h3>
            <ul className="space-y-2 text-sm">
              <li>Civil Engineering</li>
              <li>Mechanical Engineering</li>
              <li>Electrical Engineering</li>
              <li>Agricultural Engineering</li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="text-white font-semibold mb-4">Contact Us</h3>
            <ul className="space-y-3">
              <li className="flex items-start space-x-2">
                <HiLocationMarker className="w-5 h-5 text-accent-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm">Egerton University, Njoro, Kenya</span>
              </li>
              <li className="flex items-center space-x-2">
                <HiMail className="w-5 h-5 text-accent-500 flex-shrink-0" />
                <a href="mailto:egertonengineeringstudentsasso@gmail.com" className="text-sm hover:text-accent-500 transition-colors">egertonengineeringstudentsasso@gmail.com</a>
              </li>
              <li className="flex items-center space-x-2">
                <HiPhone className="w-5 h-5 text-accent-500 flex-shrink-0" />
                <span className="text-sm">+254 700 000 000</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm text-gray-500">
          <p>&copy; {new Date().getFullYear()} Egerton Engineering Student Association. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
