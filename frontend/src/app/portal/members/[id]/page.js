'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { HiArrowLeft, HiBookOpen, HiLightBulb, HiPencil, HiShieldCheck } from 'react-icons/hi';
import { getMember } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import { TYPE_LABELS, plural, unitHref } from '@/lib/library';
import { PROJECT_STATUS_LABELS, adminMemberHref } from '@/lib/members';
import MemberHeader from '@/components/members/MemberHeader';
import ErrorState from '@/components/ui/ErrorState';
import { LoadingRegion, Skeleton, SkeletonText } from '@/components/ui/Skeleton';

const backLink = (
  <Link href="/portal/members" className="inline-flex items-center gap-1 text-sm text-muted-fg hover:text-strong mb-4">
    <HiArrowLeft className="w-4 h-4" aria-hidden="true" /> Members
  </Link>
);

const itemLinkClass = 'font-medium text-strong hover:text-primary-600 dark:hover:text-primary-300 truncate block';

function Section({ title, icon: Icon, meta, className = '', children }) {
  return (
    <section className={`card ${className}`}>
      <div className="flex items-center justify-between gap-3 mb-4">
        <h2 className="font-heading text-lg font-semibold text-strong flex items-center gap-2">
          {Icon && <Icon className="w-5 h-5 text-primary-500 dark:text-primary-300" aria-hidden="true" />}
          {title}
        </h2>
        {meta && <span className="text-sm text-subtle">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

/**
 * A member's profile as other members see it: who they are and what they
 * contribute. Contact details, payments and account state are deliberately
 * absent; administrators have a separate view for those.
 */
export default function MemberProfilePage({ params }) {
  const { id } = params;
  const { user, isAdmin } = useAuth();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await getMember(id));
      setError(null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <LoadingRegion label="Loading profile">
        {backLink}
        <div className="card flex flex-col md:flex-row md:items-center gap-5">
          <Skeleton className="w-24 h-24 rounded-full" />
          <div className="flex-1 space-y-3">
            <Skeleton className="h-7 w-1/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
          <div className="card"><SkeletonText lines={4} /></div>
          <div className="card lg:col-span-2"><SkeletonText lines={5} /></div>
        </div>
      </LoadingRegion>
    );
  }

  if (error) {
    // A malformed link is as much "not found" as a member who has left.
    const notFound = error.status === 404 || error.status === 400;
    return (
      <div>
        {backLink}
        <ErrorState
          title={notFound ? 'Member not found' : undefined}
          error={notFound ? { message: 'This member may no longer be active, or the link is incorrect.' } : error}
          onRetry={notFound ? undefined : load}
        />
      </div>
    );
  }

  const { user: member, contributions } = data;
  const { projects, resources, resourceCount } = contributions;
  const isSelf = user?._id === member._id;

  const actions = (isSelf || isAdmin) && (
    <>
      {isSelf && (
        <Link href="/portal/profile" className="btn-outline btn-sm">
          <HiPencil className="w-4 h-4" aria-hidden="true" /> Edit your profile
        </Link>
      )}
      {isAdmin && (
        <Link href={adminMemberHref(member._id)} className="btn-ghost btn-sm">
          <HiShieldCheck className="w-4 h-4" aria-hidden="true" /> Admin view
        </Link>
      )}
    </>
  );

  return (
    <div>
      {backLink}
      <MemberHeader member={member} actions={actions} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6 items-start">
        <Section title="About">
          {member.bio ? (
            <p className="text-sm text-body whitespace-pre-line break-words">{member.bio}</p>
          ) : (
            <p className="text-sm text-subtle">
              {isSelf ? 'You have not written a bio yet. Add one from your profile.' : `${member.firstName} has not written a bio yet.`}
            </p>
          )}
        </Section>

        <div className="lg:col-span-2 space-y-6">
          <Section title="Projects" icon={HiLightBulb}>
            {projects.length === 0 ? (
              <p className="text-sm text-subtle">Not part of any projects yet.</p>
            ) : (
              <ul className="divide-y divide-line -my-2.5">
                {projects.map((project) => (
                  <li key={project._id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <Link href="/projects" className={itemLinkClass}>{project.title}</Link>
                      <p className="text-xs text-subtle">{project.isLead ? 'Team lead' : 'Team member'}</p>
                    </div>
                    <span className="badge-neutral shrink-0">{PROJECT_STATUS_LABELS[project.status] || project.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="Library contributions" icon={HiBookOpen} meta={resourceCount ? plural(resourceCount, 'approved upload') : null}>
            {resources.length === 0 ? (
              <p className="text-sm text-subtle">No approved uploads yet.</p>
            ) : (
              <>
                <ul className="divide-y divide-line -my-2.5">
                  {resources.map((resource) => (
                    <li key={resource._id} className="py-2.5 min-w-0">
                      {resource.unitCode ? (
                        <Link
                          href={unitHref({ year: resource.year, semester: resource.semester, code: resource.unitCode })}
                          className={itemLinkClass}
                        >
                          {resource.title}
                        </Link>
                      ) : (
                        <p className="font-medium text-strong truncate">{resource.title}</p>
                      )}
                      <p className="text-xs text-subtle">
                        {[resource.unitCode, TYPE_LABELS[resource.category]].filter(Boolean).join(' · ')}
                      </p>
                    </li>
                  ))}
                </ul>
                {resourceCount > resources.length && (
                  <p className="text-xs text-subtle mt-5">Showing the latest {resources.length}.</p>
                )}
              </>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
