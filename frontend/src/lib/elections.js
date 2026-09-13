export { formatDateTime, relativeTime, toLocalInput, fromLocalInput } from '@/lib/dates';
import { relativeTime } from '@/lib/dates';

export const ELECTION_STATUS = {
  upcoming: { label: 'Upcoming', badge: 'badge-warning' },
  active: { label: 'Voting open', badge: 'badge-success' },
  completed: { label: 'Closed', badge: 'badge-neutral' },
};

export const CANDIDATE_STATUS = {
  pending: { label: 'Pending review', badge: 'badge-warning' },
  approved: { label: 'Approved', badge: 'badge-success' },
  rejected: { label: 'Not approved', badge: 'badge-danger' },
};

// Offered as one-click additions when creating an election; matches the
// association's offices.
export const SUGGESTED_POSITIONS = [
  'Chairperson', 'Vice Chairperson', 'Secretary General', 'Organizing Secretary',
  'Treasurer', 'Publicity Manager', 'Project Manager', '1st Cohort Rep',
];

export const MIN_MANIFESTO = 20;

export const candidateName = (candidate) =>
  [candidate?.user?.firstName, candidate?.user?.lastName].filter(Boolean).join(' ') || 'Former member';

/** One line describing where an election is in its schedule. */
export const electionHeadline = (election) => {
  if (election.status === 'active') return `Voting closes ${relativeTime(election.endDate)}`;
  if (election.status === 'completed') return `Voting closed ${relativeTime(election.endDate)}`;
  if (election.nominationsOpen) return `Nominations close ${relativeTime(election.nominationsCloseAt)}`;
  return `Voting opens ${relativeTime(election.startDate)}`;
};
