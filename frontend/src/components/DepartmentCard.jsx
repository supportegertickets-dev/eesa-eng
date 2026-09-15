import Link from 'next/link';
import { HiArrowRight } from 'react-icons/hi';
import { departmentPath } from '@/lib/departments';

/**
 * Summary of a department that links to its page. `headingLevel` keeps the
 * outline correct wherever the card is placed.
 */
export default function DepartmentCard({ department, headingLevel = 3 }) {
  const { slug, name, summary, focusAreas, icon: Icon } = department;
  const Heading = `h${headingLevel}`;

  return (
    <Link href={departmentPath(slug)} className="card-interactive group flex flex-col h-full">
      <div className="w-12 h-12 rounded-xl bg-primary-100 dark:bg-primary-500/15 flex items-center justify-center mb-4 group-hover:bg-primary-500 transition-colors">
        <Icon className="w-6 h-6 text-primary-500 dark:text-primary-300 group-hover:text-white transition-colors" aria-hidden="true" />
      </div>

      <Heading className="font-heading font-semibold text-lg text-strong mb-2">{name}</Heading>
      <p className="text-muted-fg text-sm mb-4">{summary}</p>

      <ul className="flex flex-wrap gap-1.5 mb-5" aria-label={`${name} specialisations`}>
        {focusAreas.slice(0, 3).map((area) => (
          <li key={area.title} className="badge-neutral">{area.title}</li>
        ))}
      </ul>

      <span className="mt-auto inline-flex items-center gap-1.5 text-sm font-medium text-primary-500 dark:text-primary-300">
        Explore department
        <HiArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </span>
    </Link>
  );
}
