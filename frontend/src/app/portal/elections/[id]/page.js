'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  HiArrowLeft, HiCheckCircle, HiClock, HiPencil, HiPlay, HiStop, HiTrash, HiUserAdd,
} from 'react-icons/hi';
import {
  castVote, closeElectionVoting, deleteElection, getElection, openElectionVoting, removeCandidate, reviewCandidate,
} from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import {
  CANDIDATE_STATUS, ELECTION_STATUS, candidateName, formatDateTime, relativeTime,
} from '@/lib/elections';
import AddCandidateForm from '@/components/elections/AddCandidateForm';
import ApplyForm from '@/components/elections/ApplyForm';
import CandidateCard from '@/components/elections/CandidateCard';
import ElectionForm from '@/components/elections/ElectionForm';
import ResultsView from '@/components/elections/ResultsView';
import Avatar from '@/components/ui/Avatar';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import ErrorState from '@/components/ui/ErrorState';
import { Skeleton, SkeletonGrid } from '@/components/ui/Skeleton';

// setTimeout overflows above roughly 24.8 days.
const MAX_TIMEOUT = 2147483647;

function BackLink() {
  return (
    <Link href="/portal/elections" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong">
      <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> All elections
    </Link>
  );
}

function Timeline({ election }) {
  const now = Date.now();
  const steps = [
    { label: 'Nominations close', at: election.nominationsCloseAt },
    { label: 'Voting opens', at: election.startDate },
    { label: 'Voting closes', at: election.endDate },
  ];

  return (
    <ol className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {steps.map((step) => {
        const done = new Date(step.at).getTime() <= now;
        return (
          <li key={step.label} className={`rounded-lg border p-3 ${done ? 'border-line bg-muted/40' : 'border-primary-500/30 bg-primary-500/5'}`}>
            <p className="text-xs font-medium uppercase tracking-wide text-subtle flex items-center gap-1.5">
              {done
                ? <HiCheckCircle className="w-4 h-4 text-success" aria-hidden="true" />
                : <HiClock className="w-4 h-4 text-primary-500 dark:text-primary-300" aria-hidden="true" />}
              {step.label}
            </p>
            <p className="mt-1 text-sm font-semibold text-strong">{formatDateTime(step.at)}</p>
            <p className="text-xs text-subtle">{relativeTime(step.at)}</p>
          </li>
        );
      })}
    </ol>
  );
}

export default function ElectionDetailPage({ params }) {
  const { id } = params;
  const router = useRouter();
  const { isAdmin } = useAuth();

  const [election, setElection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [panel, setPanel] = useState(null); // 'edit' | 'apply' | 'add'
  const [confirm, setConfirm] = useState(null); // { kind, candidate }
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async ({ quiet = false } = {}) => {
    if (!quiet) setLoading(true);
    try {
      setElection(await getElection(id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Reload when the schedule says voting opens or closes, so the ballot and
  // results appear on time without the member refreshing.
  useEffect(() => {
    if (!election || election.status === 'completed') return undefined;
    const next = new Date(election.status === 'upcoming' ? election.startDate : election.endDate).getTime();
    const delay = next - Date.now();
    if (delay <= 0 || delay > MAX_TIMEOUT) return undefined;
    const timer = setTimeout(() => load({ quiet: true }), delay + 1500);
    return () => clearTimeout(timer);
  }, [election, load]);

  const applyResult = useCallback((result) => {
    if (result?.election) setElection(result.election);
    if (result?.message) toast.success(result.message);
  }, []);

  const derived = useMemo(() => {
    if (!election) return null;
    const approved = election.candidates.filter((c) => c.status === 'approved');
    return {
      approved,
      pending: election.candidates.filter((c) => c.status === 'pending'),
      byPosition: election.positions.map((position) => ({
        position,
        candidates: approved.filter((c) => c.position === position),
      })),
      votedCount: Object.keys(election.myVotes || {}).length,
    };
  }, [election]);

  const runConfirm = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      switch (confirm.kind) {
        case 'vote': {
          const result = await castVote(election._id, confirm.candidate._id);
          toast.success(result.message);
          setElection((current) => ({
            ...current,
            myVotes: { ...current.myVotes, [result.position]: result.candidateId },
          }));
          break;
        }
        case 'open':
          applyResult(await openElectionVoting(election._id));
          break;
        case 'close':
          applyResult(await closeElectionVoting(election._id));
          break;
        case 'remove':
        case 'withdraw':
          applyResult(await removeCandidate(election._id, confirm.candidate._id));
          break;
        case 'delete':
          await deleteElection(election._id);
          toast.success('Election deleted.');
          router.push('/portal/elections');
          return;
        default:
          break;
      }
      setConfirm(null);
    } catch (err) {
      toast.error(err.message);
      setConfirm(null);
      // The page may be out of date, for example if voting has just closed.
      if ([400, 404, 409].includes(err.status)) load({ quiet: true });
    } finally {
      setBusy(false);
    }
  };

  const review = async (candidate, status) => {
    if (status === 'rejected' && reason.trim().length < 5) {
      toast.error('Give the applicant a reason of at least 5 characters.');
      return;
    }
    setBusy(true);
    try {
      applyResult(await reviewCandidate(election._id, candidate._id, {
        status,
        ...(status === 'rejected' ? { rejectionReason: reason.trim() } : {}),
      }));
      setRejecting(null);
      setReason('');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-4 w-28" />
        <div className="card space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <SkeletonGrid count={3} />
      </div>
    );
  }

  if (error || !election) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState
          error={error}
          title={error?.status === 404 ? 'Election not found' : undefined}
          onRetry={error?.status === 404 ? undefined : () => load()}
        />
      </div>
    );
  }

  const status = ELECTION_STATUS[election.status] || ELECTION_STATUS.upcoming;
  const application = election.myApplication;
  const canApply = election.nominationsOpen && (!application || application.status === 'rejected');
  const { pending, byPosition, votedCount } = derived;
  const allVoted = votedCount >= election.positions.length;

  const confirmCopy = confirm ? {
    vote: {
      title: `Vote for ${candidateName(confirm.candidate)}?`,
      description: `This is your vote for ${confirm.candidate?.position}. Votes are secret and cannot be changed once cast.`,
      confirmLabel: 'Cast my vote',
      destructive: false,
    },
    open: {
      title: 'Open voting now?',
      description: `Voting starts immediately and closes ${formatDateTime(election.endDate)}. All members will be notified.${pending.length ? ` ${pending.length} pending application${pending.length === 1 ? '' : 's'} will not appear on the ballot.` : ''}`,
      confirmLabel: 'Open voting',
      destructive: false,
    },
    close: {
      title: 'Close voting now?',
      description: 'No more votes will be accepted, and the results will be published to every member straight away.',
      confirmLabel: 'Close voting',
    },
    remove: {
      title: `Remove ${candidateName(confirm.candidate)}?`,
      description: 'They will be taken off this election. They can apply again while nominations are open.',
      confirmLabel: 'Remove candidate',
    },
    withdraw: {
      title: 'Withdraw your application?',
      description: 'You will be removed from this election. You can apply again while nominations are open.',
      confirmLabel: 'Withdraw',
    },
    delete: {
      title: 'Delete this election?',
      description: 'The election, its candidates and every vote cast will be permanently deleted. This cannot be undone.',
      confirmLabel: 'Delete election',
    },
  }[confirm.kind] : null;

  return (
    <div className="space-y-6">
      <BackLink />

      <header className="card space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className={status.badge}>{status.label}</span>
              {election.nominationsOpen && <span className="badge-info">Nominations open</span>}
            </div>
            <h1 className="page-title">{election.title}</h1>
            {election.description && <p className="text-muted-fg mt-2 whitespace-pre-line">{election.description}</p>}
          </div>

          {isAdmin && (
            <div className="flex flex-wrap gap-2 shrink-0">
              {election.status !== 'completed' && (
                <button type="button" onClick={() => setPanel(panel === 'edit' ? null : 'edit')} className="btn-ghost btn-sm">
                  <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit
                </button>
              )}
              {election.status === 'upcoming' && (
                <button type="button" onClick={() => setConfirm({ kind: 'open' })} className="btn-outline btn-sm">
                  <HiPlay className="w-4 h-4" aria-hidden="true" /> Open voting now
                </button>
              )}
              {election.status === 'active' && (
                <button type="button" onClick={() => setConfirm({ kind: 'close' })} className="btn-outline btn-sm">
                  <HiStop className="w-4 h-4" aria-hidden="true" /> Close voting now
                </button>
              )}
              <button type="button" onClick={() => setConfirm({ kind: 'delete' })} className="btn-ghost btn-sm text-danger">
                <HiTrash className="w-4 h-4" aria-hidden="true" /> Delete
              </button>
            </div>
          )}
        </div>

        <Timeline election={election} />
      </header>

      {panel === 'edit' && (
        <ElectionForm
          election={election}
          onSaved={(saved) => { setElection(saved); setPanel(null); }}
          onCancel={() => setPanel(null)}
        />
      )}

      {/* What this member can do right now. */}
      {election.status === 'active' && (
        <div className={`card flex items-center gap-3 ${allVoted ? 'border-success/40' : 'border-primary-500/40'}`}>
          <HiCheckCircle className={`w-6 h-6 shrink-0 ${allVoted ? 'text-success' : 'text-primary-500 dark:text-primary-300'}`} aria-hidden="true" />
          <p className="text-sm text-body">
            {allVoted
              ? 'Thank you for voting. Results will be published when voting closes.'
              : `Voting is open until ${formatDateTime(election.endDate)}. You have voted in ${votedCount} of ${election.positions.length} position${election.positions.length === 1 ? '' : 's'}.`}
          </p>
        </div>
      )}

      {election.status === 'upcoming' && !election.nominationsOpen && (
        <div className="card flex items-center gap-3">
          <HiClock className="w-6 h-6 shrink-0 text-primary-500 dark:text-primary-300" aria-hidden="true" />
          <p className="text-sm text-body">Nominations have closed. Voting opens {formatDateTime(election.startDate)}.</p>
        </div>
      )}

      {application && application.status !== 'rejected' && (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-strong">Your candidacy for {application.position}</p>
              <span className={CANDIDATE_STATUS[application.status]?.badge}>{CANDIDATE_STATUS[application.status]?.label}</span>
            </div>
            <p className="text-sm text-muted-fg mt-1">
              {application.status === 'pending'
                ? 'An administrator will review your application before nominations close.'
                : election.status === 'upcoming'
                  ? `You are on the ballot. Voting opens ${formatDateTime(election.startDate)}.`
                  : 'You are on the ballot.'}
            </p>
          </div>
          {election.status === 'upcoming' && (
            <div className="flex gap-2 shrink-0">
              {application.status === 'pending' && election.nominationsOpen && panel !== 'apply' && (
                <button type="button" onClick={() => setPanel('apply')} className="btn-outline btn-sm">Edit application</button>
              )}
              <button type="button" onClick={() => setConfirm({ kind: 'withdraw', candidate: application })} className="btn-ghost btn-sm text-danger">
                Withdraw
              </button>
            </div>
          )}
        </div>
      )}

      {canApply && panel !== 'apply' && (
        <div className="card flex flex-col sm:flex-row sm:items-center gap-4 border-primary-500/40">
          <div className="flex-1">
            {application?.status === 'rejected' ? (
              <>
                <p className="font-semibold text-strong">Your application was not approved</p>
                {application.rejectionReason && <p className="text-sm text-muted-fg mt-1">Reason: {application.rejectionReason}</p>}
                <p className="text-sm text-muted-fg mt-1">You can update it and resubmit until {formatDateTime(election.nominationsCloseAt)}.</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-strong">Want to stand for office?</p>
                <p className="text-sm text-muted-fg mt-1">
                  Nominations are open until {formatDateTime(election.nominationsCloseAt)}. Any active member can apply.
                </p>
              </>
            )}
          </div>
          <button type="button" onClick={() => setPanel('apply')} className="btn-primary shrink-0">
            {application?.status === 'rejected' ? 'Update and resubmit' : 'Apply to stand'}
          </button>
        </div>
      )}

      {panel === 'apply' && (
        <ApplyForm
          election={election}
          application={application}
          onDone={(result) => { applyResult(result); setPanel(null); }}
          onCancel={() => setPanel(null)}
        />
      )}

      {/* Admin review queue, before voting starts. */}
      {isAdmin && election.status === 'upcoming' && (
        <section className="card space-y-4" aria-labelledby="review-heading">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="review-heading" className="font-heading text-lg font-semibold text-strong">Applications to review</h2>
              <p className="text-sm text-muted-fg">
                {pending.length
                  ? `${pending.length} waiting. Only approved candidates appear on the ballot.`
                  : 'No applications are waiting for review.'}
              </p>
            </div>
            {panel !== 'add' && (
              <button type="button" onClick={() => setPanel('add')} className="btn-outline btn-sm">
                <HiUserAdd className="w-4 h-4" aria-hidden="true" /> Add candidate directly
              </button>
            )}
          </div>

          {pending.length > 0 && (
            <ul className="divide-y divide-line">
              {pending.map((candidate) => (
                <li key={candidate._id} className="py-4 first:pt-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <Avatar src={candidate.photo || candidate.user?.avatar} name={candidateName(candidate)} size="lg" />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-strong">{candidateName(candidate)}</p>
                      <p className="text-sm text-primary-500 dark:text-primary-300">{candidate.position}</p>
                      <p className="text-sm text-body mt-2 whitespace-pre-line line-clamp-6">{candidate.manifesto}</p>

                      {rejecting === candidate._id ? (
                        <div className="mt-3 space-y-2">
                          <label htmlFor={`reason-${candidate._id}`} className="form-label">Reason, shared with the applicant</label>
                          <textarea
                            id={`reason-${candidate._id}`}
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            rows={2}
                            maxLength={500}
                            className="input-field"
                            placeholder="e.g. Please add more detail about your plans."
                          />
                          <div className="flex gap-2">
                            <button type="button" disabled={busy} onClick={() => review(candidate, 'rejected')} className="btn-danger btn-sm">Reject application</button>
                            <button type="button" disabled={busy} onClick={() => { setRejecting(null); setReason(''); }} className="btn-ghost btn-sm">Cancel</button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex gap-2">
                          <button type="button" disabled={busy} onClick={() => review(candidate, 'approved')} className="btn-primary btn-sm">Approve</button>
                          <button type="button" disabled={busy} onClick={() => { setRejecting(candidate._id); setReason(''); }} className="btn-ghost btn-sm text-danger">Reject</button>
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {panel === 'add' && (
        <AddCandidateForm
          election={election}
          onDone={(result) => { applyResult(result); setPanel(null); }}
          onCancel={() => setPanel(null)}
        />
      )}

      {election.status === 'completed' && election.results ? (
        <section aria-labelledby="results-heading" className="space-y-4">
          <h2 id="results-heading" className="font-heading text-xl font-semibold text-strong">Results</h2>
          <ResultsView results={election.results} candidates={derived.approved} />
        </section>
      ) : (
        <section aria-labelledby="ballot-heading" className="space-y-8">
          <h2 id="ballot-heading" className="font-heading text-xl font-semibold text-strong">
            {election.status === 'active' ? 'Ballot' : 'Candidates'}
          </h2>

          {byPosition.map(({ position, candidates }) => {
            const choice = election.myVotes?.[position];
            return (
              <div key={position} className="space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-heading text-lg font-semibold text-strong">{position}</h3>
                  {choice && <span className="badge-success"><HiCheckCircle className="w-3.5 h-3.5" aria-hidden="true" /> Voted</span>}
                </div>

                {candidates.length === 0 ? (
                  <p className="text-sm text-subtle card py-6 text-center">
                    {election.status === 'upcoming' ? 'No approved candidates for this position yet.' : 'No candidates stood for this position.'}
                  </p>
                ) : (
                  <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {candidates.map((candidate) => {
                      const isChoice = choice === String(candidate._id);
                      return (
                        <li key={candidate._id} className="flex">
                          <div className="w-full">
                            <CandidateCard candidate={candidate} voted={isChoice} dimmed={Boolean(choice) && !isChoice}>
                              {election.status === 'active' && !choice && (
                                <button type="button" onClick={() => setConfirm({ kind: 'vote', candidate })} className="btn-primary w-full">
                                  Vote for {candidate.user?.firstName || 'this candidate'}
                                </button>
                              )}
                              {isAdmin && election.status === 'upcoming' && (
                                <button type="button" onClick={() => setConfirm({ kind: 'remove', candidate })} className="btn-ghost btn-sm text-danger w-full">
                                  <HiTrash className="w-4 h-4" aria-hidden="true" /> Remove from ballot
                                </button>
                              )}
                            </CandidateCard>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}

      <ConfirmDialog
        open={Boolean(confirm)}
        title={confirmCopy?.title}
        description={confirmCopy?.description}
        confirmLabel={confirmCopy?.confirmLabel}
        destructive={confirmCopy?.destructive !== false}
        busy={busy}
        onConfirm={runConfirm}
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
}
