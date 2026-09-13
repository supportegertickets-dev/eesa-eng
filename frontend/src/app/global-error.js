'use client';

/**
 * Last-resort boundary for errors thrown in the root layout itself.
 *
 * It replaces the entire document, so it must render its own <html> and <body>
 * and cannot rely on the app's providers, fonts or stylesheet. Styles are
 * therefore inline.
 */
export default function GlobalError({ error, reset }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        background: '#f9fafb',
        color: '#111827',
        padding: '1.5rem',
      }}>
        <div style={{ maxWidth: '28rem', textAlign: 'center' }}>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 700, margin: '0 0 0.5rem' }}>
            EESA is temporarily unavailable
          </h1>
          <p style={{ color: '#4b5563', margin: '0 0 1.5rem', lineHeight: 1.6 }}>
            The site failed to load. Please refresh the page, or try again in a few minutes.
          </p>
          {error?.digest && (
            <p style={{ color: '#6b7280', fontSize: '0.75rem', margin: '0 0 1.5rem' }}>
              Reference: {error.digest}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            style={{
              background: '#800020',
              color: '#fff',
              border: 0,
              padding: '0.7rem 1.5rem',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
