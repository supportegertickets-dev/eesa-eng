import { Inter, Poppins } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';
import { ThemeProvider } from '@/lib/ThemeContext';
import { themeInitScript } from '@/lib/themeScript';
import Navbar from '@/components/Navbar';
import Footer from '@/components/Footer';
import ToastHost from '@/components/ToastHost';
import ServiceWorkerRegistrar from '@/components/ServiceWorkerRegistrar';

/*
 * Fonts are self-hosted by next/font. globals.css previously used
 * `@import url(fonts.googleapis.com)` placed after the @tailwind directives,
 * which is invalid CSS — @import must come first — so the browser discarded it
 * and the site silently fell back to system fonts. next/font also inlines the
 * font-face rules and preloads the files, removing a render-blocking round trip.
 */
const inter = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

const poppins = Poppins({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-poppins',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://eesa-en.vercel.app';

export const metadata = {
  // Required for Open Graph and canonical URLs to resolve as absolute.
  metadataBase: new URL(siteUrl),
  title: {
    default: 'EESA — Egerton Engineering Student Association',
    // Pages set only their own name; the suffix is appended here.
    template: '%s | EESA',
  },
  description:
    'The official website and member portal of the Egerton Engineering Student Association: events, projects, news, a shared resource library and elections.',
  keywords: ['Egerton University', 'Engineering', 'Student Association', 'EESA', 'Kenya', 'Njoro'],
  authors: [{ name: 'Egerton Engineering Student Association' }],
  manifest: '/manifest.json',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'EESA',
    title: 'EESA — Egerton Engineering Student Association',
    description: 'Events, projects, news and resources for engineering students at Egerton University.',
    url: siteUrl,
    locale: 'en_KE',
    images: [{ url: '/logo.png', width: 512, height: 512, alt: 'EESA logo' }],
  },
  twitter: {
    card: 'summary',
    title: 'EESA — Egerton Engineering Student Association',
    description: 'Events, projects, news and resources for engineering students at Egerton University.',
    images: ['/logo.png'],
  },
  robots: { index: true, follow: true },
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'EESA' },
  icons: { icon: '/logo.png', apple: '/logo.png' },
  formatDetection: { telephone: false },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // `maximumScale: 1` was preventing pinch-zoom, which fails WCAG 1.4.4 and
  // makes the site unusable for anyone who needs to magnify text.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#800020' },
    { media: '(prefers-color-scheme: dark)', color: '#0f1217' },
  ],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        {/*
          Applies the stored theme before first paint. Any later and the page
          renders light, then snaps to dark, which is worse than no dark mode.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className="min-h-screen flex flex-col bg-canvas text-body">
        {/* First tab stop on every page, so keyboard users can bypass the nav. */}
        <a href="#main-content" className="skip-link">Skip to main content</a>

        <ThemeProvider>
          <AuthProvider>
            <Navbar />
            <main id="main-content" className="flex-1">{children}</main>
            <Footer />
            <ToastHost />
          </AuthProvider>
        </ThemeProvider>

        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
