import Link from 'next/link';
import { HiArrowRight } from 'react-icons/hi';

export default function Hero() {
  return (
    <section className="relative bg-gradient-to-br from-primary-500 via-primary-600 to-primary-800 text-white overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-10">
        <div className="absolute inset-0" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.4'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />
      </div>

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24 lg:py-36">
        <div className="max-w-3xl">
          <div className="inline-flex items-center px-4 py-1.5 bg-accent-500/20 border border-accent-500/30 rounded-full text-accent-300 text-sm font-medium mb-6">
            Engineering Excellence at Egerton University
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight mb-6">
            Empowering Future{' '}
            <span className="text-accent-400">Engineers</span>
          </h1>
          <p className="text-lg sm:text-xl text-gray-200 mb-8 max-w-2xl">
            Join the Egerton Engineering Student Association — where innovation meets 
            community. Collaborate on projects, attend workshops, and build the skills 
            that shape tomorrow.
          </p>
          <div className="flex flex-col sm:flex-row gap-4">
            <Link
              href="/register"
              className="inline-flex items-center justify-center px-8 py-3 bg-accent-500 text-white rounded-lg font-semibold hover:bg-accent-600 transition-colors shadow-lg"
            >
              Join EESA Today
              <HiArrowRight className="ml-2 w-5 h-5" />
            </Link>
            <Link
              href="/about"
              className="inline-flex items-center justify-center px-8 py-3 border-2 border-white/30 rounded-lg font-semibold hover:bg-white/10 transition-colors"
            >
              Learn More
            </Link>
          </div>
        </div>
      </div>

      {/* Wave divider */}
      <div className="absolute bottom-0 left-0 right-0">
        <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="white"/>
        </svg>
      </div>
    </section>
  );
}
