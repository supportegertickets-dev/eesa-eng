'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { HiChevronRight, HiClipboardList, HiClock, HiPlus, HiUserGroup } from 'react-icons/hi';
import { getElections } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { CANDIDATE_STATUS, ELECTION_STATUS, electionHeadline } from '@/lib/elections';
import ElectionForm from '@/components/elections/ElectionForm';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import { SkeletonList } from '@/components/ui/Skeleton';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Voting open' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'completed', label: 'Closed' },
];

export default function ElectionsPage() {
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [elections, setElections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await getElections();
      setElections(data.elections || []);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => ({
    all: elections.length,
    active: elections.filter((e) => e.status === 'active').length,
    upcoming: elections.filter((e) => e.status === 'upcoming').length,
    completed: elections.filter((e) => e.status === 'completed').length,
  }), [elections]);

  const visible = filter === 'all' ? elections : elections.filter((e) => e.status === filter);

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="page-title">Elections</h1>
          <p className="text-muted-fg mt-1">Stand for office, vote in secret, and see the results when voting closes.</p>
        </div>
        {isAdmin && !creating && (
          <button type="button" onClick={() => setCreating(true)} className="btn-primary">
            <HiPlus className="w-4 h-4" aria-hidden="true" /> New election
          </button>
        )}
      </div>

      {creating && (
        <div className="mb-8">
          <ElectionForm
            onSaved={(saved) => { setCreating(false); router.push(`/portal/elections/${saved._id}`); }}
            onCancel={() => setCreating(false)}
          />
        </div>
      )}

      <div className="flex flex-wrap gap-2 mb-5" role="tablist" aria-label="Filter elections">
        {FILTERS.map((option) => (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={filter === option.id}
            onClick={() => setFilter(option.id)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === option.id ? 'bg-primary-500 text-white' : 'bg-muted text-muted-fg hover:bg-muted-strong'
            }`}
          >
            {option.label}
            {!loading && <span className="ml-1.5 opacity-75">{counts[option.id]}</span>}
          </button>
        ))}
      </div>

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : loading ? (
        <SkeletonList count={3} />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={HiClipboardList}
          title={filter === 'all' ? 'No elections yet' : 'Nothing here right now'}
          description={filter === 'all' ? 'Elections will appear here when the committee announces them.' : 'Try another filter.'}
          action={isAdmin && filter === 'all' ? 'Create an election' : undefined}
          onAction={isAdmin ? () => setCreating(true) : undefined}
        />
      ) : (
        <ul className="space-y-4">
          {visible.map((election) => {
            const status = ELECTION_STATUS[election.status] || ELECTION_STATUS.upcoming;
            const approved = election.candidates.filter((c) => c.status === 'approved').length;
            const pending = election.candidates.filter((c) => c.status === 'pending').length;
            const voted = Object.keys(election.myVotes || {}).length;
            const application = election.myApplication;

            return (
              <li key={election._id}>
                <Link
                  href={`/portal/elections/${election._id}`}
                  className="card-interactive flex items-center gap-4 group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-1.5">
                      <span className={status.badge}>{status.label}</span>
                      {election.nominationsOpen && <span className="badge-info">Nominations open</span>}
                      {isAdmin && pending > 0 && <span className="badge-warning">{pending} to review</span>}
                      {application && (
                        <span className={CANDIDATE_STATUS[application.status]?.badge}>
                          Your application: {CANDIDATE_STATUS[application.status]?.label.toLowerCase()}
                        </span>
                      )}
                    </div>

                    <h2 className="font-heading text-lg font-semibold text-strong group-hover:text-primary-500 dark:group-hover:text-primary-300 transition-colors">
                      {election.title}
                    </h2>
                    {election.description && <p className="text-sm text-muted-fg mt-1 line-clamp-2">{election.description}</p>}

                    <div className="flex flex-wrap gap-x-5 gap-y-1 mt-3 text-sm text-subtle">
                      <span className="inline-flex items-center gap-1.5">
                        <HiClock className="w-4 h-4" aria-hidden="true" /> {electionHeadline(election)}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <HiUserGroup className="w-4 h-4" aria-hidden="true" />
                        {approved} candidate{approved === 1 ? '' : 's'} for {election.positions.length} position{election.positions.length === 1 ? '' : 's'}
                      </span>
                      {election.status === 'active' && (
                        <span className={voted === election.positions.length ? 'text-success font-medium' : 'text-warning font-medium'}>
                          {voted === election.positions.length ? 'You have voted' : `You have voted in ${voted} of ${election.positions.length}`}
                        </span>
                      )}
                    </div>
                  </div>
                  <HiChevronRight className="w-5 h-5 text-faint shrink-0 group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
