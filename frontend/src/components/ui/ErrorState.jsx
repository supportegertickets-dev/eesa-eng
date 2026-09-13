import { HiExclamationCircle, HiRefresh, HiWifi } from 'react-icons/hi';

/**
 * Inline failure state for a page section that could not load.
 *
 * Failures previously surfaced only as a toast that vanished after a few
 * seconds, leaving an empty page behind and no way to retry without a reload.
 */
export default function ErrorState({ error, onRetry, title }) {
  const isOffline = error?.status === 0;
  const Icon = isOffline ? HiWifi : HiExclamationCircle;

  const heading = title || (isOffline ? 'Cannot reach the server' : 'Something went wrong');
  const message = error?.message
    || 'We could not load this right now. Please try again in a moment.';

  return (
    <div className="card flex flex-col items-center justify-center text-center py-12 px-6" role="alert">
      <span className="w-14 h-14 rounded-full bg-danger-soft flex items-center justify-center mb-4">
        <Icon className="w-7 h-7 text-danger" aria-hidden="true" />
      </span>
      <h3 className="font-heading text-lg font-semibold text-strong">{heading}</h3>
      <p className="mt-1.5 text-sm text-muted-fg max-w-sm">{message}</p>

      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-outline mt-5">
          <HiRefresh className="w-4 h-4" aria-hidden="true" />
          Try again
        </button>
      )}
    </div>
  );
}
