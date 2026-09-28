import { HiCheck, HiX } from 'react-icons/hi';
import { formatDateTime } from '@/lib/dates';

const STEPS = [
  { status: 'awaiting_payment', label: 'Placed' },
  { status: 'paid', label: 'Paid' },
  { status: 'ready', label: 'Ready to collect' },
  { status: 'collected', label: 'Collected' },
];

/** Where an order is in its lifecycle, with when each step happened. */
export default function OrderProgress({ order }) {
  if (order.status === 'cancelled') {
    const cancelled = [...(order.history || [])].reverse().find((entry) => entry.status === 'cancelled');
    return (
      <div className="rounded-xl border border-danger/40 bg-danger-soft p-4 flex gap-3 items-start">
        <HiX className="w-5 h-5 text-danger shrink-0 mt-0.5" aria-hidden="true" />
        <div>
          <p className="font-semibold text-danger">Order cancelled</p>
          {order.cancelReason && <p className="text-sm text-body mt-0.5">{order.cancelReason}</p>}
          {cancelled?.at && <p className="text-xs text-subtle mt-1">{formatDateTime(cancelled.at)}</p>}
        </div>
      </div>
    );
  }

  const reached = STEPS.findIndex((step) => step.status === order.status);
  const whenReached = (status) => (order.history || []).find((entry) => entry.status === status)?.at
    || (status === 'awaiting_payment' ? order.createdAt : null);

  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Order progress">
      {STEPS.map((step, index) => {
        const done = index <= reached;
        const at = done ? whenReached(step.status) : null;
        return (
          <li key={step.status} className="flex flex-col items-center text-center" aria-current={index === reached ? 'step' : undefined}>
            <span className="relative w-full flex items-center justify-center">
              {index > 0 && <span className={`absolute right-1/2 w-[calc(100%+0.5rem)] h-0.5 ${index <= reached ? 'bg-primary-500' : 'bg-line'}`} aria-hidden="true" />}
              <span className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold
                ${done ? 'bg-primary-500 text-white' : 'bg-muted text-faint'}`}
              >
                {done ? <HiCheck className="w-4 h-4" aria-hidden="true" /> : index + 1}
              </span>
            </span>
            <span className={`mt-2 text-xs font-medium ${done ? 'text-strong' : 'text-subtle'}`}>
              {step.label}
              <span className="sr-only">{done ? ' (done)' : ' (not yet)'}</span>
            </span>
            {at && <span className="text-[11px] text-faint hidden sm:block">{formatDateTime(at)}</span>}
          </li>
        );
      })}
    </ol>
  );
}
