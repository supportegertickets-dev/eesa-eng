import { format, formatDistanceToNowStrict, isValid } from 'date-fns';

const toDate = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return isValid(date) ? date : null;
};

/** Value for an <input type="datetime-local">, in the viewer's time zone. */
export const toLocalInput = (value) => {
  const date = toDate(value);
  return date ? format(date, "yyyy-MM-dd'T'HH:mm") : '';
};

/**
 * Convert a datetime-local value to an ISO timestamp.
 *
 * The input's value carries no time zone. Sending it raw let a server running
 * in UTC read "10:00" as 10:00 UTC, three hours after 10:00 in Nairobi.
 * The browser parses it in the viewer's zone, so converting here is correct.
 */
export const fromLocalInput = (value) => {
  const date = toDate(value);
  return date ? date.toISOString() : '';
};

export const formatDateTime = (value) => {
  const date = toDate(value);
  return date ? format(date, 'EEE d MMM yyyy, h:mm a') : '';
};

/** "in 3 days" or "2 hours ago". */
export const relativeTime = (value) => {
  const date = toDate(value);
  if (!date) return '';
  const distance = formatDistanceToNowStrict(date);
  return date > new Date() ? `in ${distance}` : `${distance} ago`;
};
