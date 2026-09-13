import { HiUsers } from 'react-icons/hi';
import Avatar from '@/components/ui/Avatar';
import { candidateName } from '@/lib/elections';

/** Published results: turnout, then each position's candidates ranked by votes. */
export default function ResultsView({ results, candidates }) {
  const byId = new Map(candidates.map((c) => [String(c._id), c]));

  return (
    <div className="space-y-6">
      <div className="card flex items-center gap-4">
        <span className="w-12 h-12 rounded-full bg-primary-500/10 flex items-center justify-center">
          <HiUsers className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
        </span>
        <div>
          <p className="text-2xl font-bold text-strong">{results.turnout}</p>
          <p className="text-sm text-muted-fg">member{results.turnout === 1 ? '' : 's'} voted</p>
        </div>
      </div>

      {results.positions.map((position) => (
        <section key={position.position} className="card" aria-labelledby={`result-${position.position}`}>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
            <h3 id={`result-${position.position}`} className="font-heading text-lg font-semibold text-strong">{position.position}</h3>
            <span className="text-sm text-subtle">{position.totalVotes} vote{position.totalVotes === 1 ? '' : 's'}</span>
          </div>

          {position.tie && (
            <p className="badge-warning mb-4">Tied for first place. The committee will decide how to resolve it.</p>
          )}

          {position.candidates.length === 0 ? (
            <p className="text-sm text-subtle">No candidates stood for this position.</p>
          ) : (
            <ol className="space-y-4">
              {position.candidates.map((result) => {
                const candidate = byId.get(String(result._id));
                const name = candidateName(candidate);
                return (
                  <li key={result._id} className="flex items-center gap-3">
                    <Avatar src={candidate?.photo || candidate?.user?.avatar} name={name} size="md" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-3 text-sm">
                        <span className="font-medium text-strong truncate">
                          {name}
                          {result.isWinner && <span className="badge-success ml-2 align-middle">Elected</span>}
                        </span>
                        <span className="text-subtle tabular-nums shrink-0">
                          {result.voteCount} · {result.percentage}%
                        </span>
                      </div>
                      <div
                        className="mt-1.5 h-2.5 rounded-full bg-muted overflow-hidden"
                        role="progressbar"
                        aria-label={`${name}: ${result.percentage} percent`}
                        aria-valuenow={result.percentage}
                        aria-valuemin={0}
                        aria-valuemax={100}
                      >
                        <div
                          className={`h-full rounded-full ${result.isWinner ? 'bg-primary-500 dark:bg-primary-400' : 'bg-faint'}`}
                          style={{ width: `${result.percentage}%` }}
                        />
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      ))}
    </div>
  );
}
