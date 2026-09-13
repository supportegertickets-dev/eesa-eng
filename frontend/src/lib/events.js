export const EVENT_CATEGORIES = ['workshop', 'seminar', 'competition', 'social', 'trip', 'meeting', 'other'];
export const EVENT_STATUSES = ['upcoming', 'ongoing', 'completed', 'cancelled'];
export const MAX_EVENT_PHOTOS = 10;

/** Placeholder backgrounds for events without a cover image. */
export const CATEGORY_GRADIENTS = {
  workshop: 'from-blue-600 to-indigo-800',
  seminar: 'from-purple-600 to-fuchsia-800',
  competition: 'from-rose-600 to-red-900',
  social: 'from-emerald-600 to-teal-800',
  trip: 'from-orange-500 to-amber-700',
  meeting: 'from-slate-600 to-slate-800',
  other: 'from-primary-500 to-primary-800',
};

export const STATUS_BADGES = {
  upcoming: 'badge-success',
  ongoing: 'badge-info',
  completed: 'badge-neutral',
  cancelled: 'badge-danger',
};

/** An event is past once it has ended, or when it is marked completed or cancelled. */
export const isPastEvent = (event) =>
  ['completed', 'cancelled'].includes(event.status)
  || (event.status !== 'ongoing' && new Date(event.endDate || event.date) < new Date());
