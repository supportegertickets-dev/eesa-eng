/**
 * Display helpers shared by the members directory, profile pages and member
 * administration.
 */

export const fullName = (member) => [member?.firstName, member?.lastName].filter(Boolean).join(' ');

export const memberHref = (id) => `/portal/members/${id}`;
export const adminMemberHref = (id) => `/portal/admin/members/${id}`;

export const studyLabel = (member) => (member?.academicStatus === 'alumni' ? 'Alumni' : `Year ${member?.yearOfStudy}`);

/**
 * Verifying a payment sets `membershipPaid` and an expiry, but nothing clears
 * the flag when the expiry passes, so the expiry decides. Mirrors the server's
 * membership filter.
 */
export const membershipState = (member, now = new Date()) => {
  if (!member?.membershipPaid) return { id: 'none', label: 'Not paid', badge: 'badge-neutral' };
  if (member.membershipExpiry && new Date(member.membershipExpiry) <= now) {
    return { id: 'expired', label: 'Expired', badge: 'badge-warning' };
  }
  return { id: 'current', label: 'Paid', badge: 'badge-success' };
};

export const MEMBERSHIP_FILTERS = [
  { value: '', label: 'Any membership' },
  { value: 'current', label: 'Paid' },
  { value: 'expired', label: 'Expired' },
  { value: 'none', label: 'Not paid' },
];

/** Review states used by payments, library uploads and nominations. */
export const STATUS_BADGES = {
  pending: 'badge-warning',
  verified: 'badge-success',
  approved: 'badge-success',
  rejected: 'badge-danger',
};

export const PROJECT_STATUS_LABELS = {
  planning: 'Planning',
  'in-progress': 'In progress',
  completed: 'Completed',
  'on-hold': 'On hold',
};

export const formatAmount = (amount) => `KSh ${Number(amount || 0).toLocaleString()}`;

/** Hand a downloaded Blob to the browser as a file. */
export const saveBlob = (blob, fileName) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking straight away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
