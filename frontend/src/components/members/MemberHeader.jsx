import Avatar from '@/components/ui/Avatar';
import { formatDate } from '@/lib/dates';
import { fullName, studyLabel } from '@/lib/members';
import { roleLabel } from '@/lib/roles';

/** Identity block at the top of a member's profile, shared by the member and admin views. */
export default function MemberHeader({ member, badges, actions }) {
  const name = fullName(member);
  const details = [
    member.department,
    studyLabel(member),
    member.createdAt && `Joined ${formatDate(member.createdAt)}`,
  ].filter(Boolean);

  return (
    <section className="card flex flex-col md:flex-row md:items-center gap-5">
      <Avatar src={member.avatar} name={name} size="xl" />

      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="page-title break-words">{name}</h1>
          {member.role && member.role !== 'member' && <span className="badge-brand">{roleLabel(member.role)}</span>}
          {badges}
        </div>
        {member.username && <p className="text-sm text-subtle mt-0.5">@{member.username}</p>}
        <p className="text-sm text-muted-fg mt-2">{details.join(' · ')}</p>
      </div>

      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
    </section>
  );
}
