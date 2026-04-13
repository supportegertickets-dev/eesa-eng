'use client';

export default function OfflinePage() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="text-center max-w-md">
        <div className="w-20 h-20 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 5.636a9 9 0 11-12.728 0M12 9v4m0 4h.01" />
          </svg>
        </div>
        <h1 className="font-heading text-2xl font-bold text-gray-900 mb-3">You&apos;re Offline</h1>
        <p className="text-gray-600 mb-6">
          It looks like you&apos;ve lost your internet connection. Please check your network and try again.
        </p>
        <button
          onClick={() => typeof window !== 'undefined' && window.location.reload()}
          className="btn-primary"
        >
          Try Again
        </button>
      </div>
    </div>
  );
}
