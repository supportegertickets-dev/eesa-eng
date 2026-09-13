'use client';

import { useState } from 'react';
import { HiCheckCircle } from 'react-icons/hi';
import Avatar from '@/components/ui/Avatar';
import { cloudinaryImage } from '@/lib/images';
import { candidateName } from '@/lib/elections';

/**
 * A candidate on the ballot: portrait, name, position and manifesto.
 * `children` renders in the footer, for the vote button or admin actions.
 */
export default function CandidateCard({ candidate, voted = false, dimmed = false, badge = null, children }) {
  const [expanded, setExpanded] = useState(false);
  const name = candidateName(candidate);
  // Fall back to the member's profile picture when no campaign photo was uploaded.
  const photo = candidate.photo || candidate.user?.avatar;
  const manifesto = candidate.manifesto || '';
  const isLong = manifesto.length > 200;
  const details = [
    candidate.user?.department,
    candidate.user?.academicStatus === 'alumni' ? 'Alumni' : candidate.user?.yearOfStudy ? `Year ${candidate.user.yearOfStudy}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <article
      className={`card p-0 overflow-hidden flex flex-col transition-opacity ${voted ? 'ring-2 ring-primary-500' : ''} ${dimmed ? 'opacity-60' : ''}`}
    >
      <div className="relative aspect-[3/4] bg-muted">
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cloudinaryImage(photo, { width: 480, height: 640, crop: 'fill' })}
            alt={`Photo of ${name}`}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-gradient-to-b from-primary-500/15 to-primary-500/5">
            <Avatar name={name} size="xl" />
          </div>
        )}
        {voted && (
          <span className="absolute top-3 left-3 badge bg-primary-500 text-white shadow-card">
            <HiCheckCircle className="w-4 h-4" aria-hidden="true" /> Your vote
          </span>
        )}
        {badge && <span className="absolute top-3 right-3">{badge}</span>}
      </div>

      <div className="p-4 flex-1 flex flex-col">
        <h3 className="font-heading font-semibold text-strong text-lg leading-tight">{name}</h3>
        <p className="text-sm font-medium text-primary-500 dark:text-primary-300 mt-0.5">{candidate.position}</p>
        {details && <p className="text-xs text-subtle mt-0.5">{details}</p>}

        {manifesto && (
          <div className="mt-3 text-sm text-body">
            <p className={`whitespace-pre-line ${expanded ? '' : 'line-clamp-4'}`}>{manifesto}</p>
            {isLong && (
              <button
                type="button"
                onClick={() => setExpanded((open) => !open)}
                aria-expanded={expanded}
                className="mt-1 text-xs font-medium text-primary-500 dark:text-primary-300 hover:underline"
              >
                {expanded ? 'Show less' : 'Read full manifesto'}
              </button>
            )}
          </div>
        )}

        {children && <div className="mt-auto pt-4">{children}</div>}
      </div>
    </article>
  );
}
