import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  HiAcademicCap, HiArrowRight, HiBeaker, HiBookOpen, HiBriefcase, HiCalendar,
  HiCheckCircle, HiChevronRight, HiLightBulb, HiOfficeBuilding,
} from 'react-icons/hi';
import { DEPARTMENT_PROFILES, departmentPath, getDepartment } from '@/lib/departments';

// Pages exist only for the departments in lib/departments.js; any other slug is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return DEPARTMENT_PROFILES.map(({ slug }) => ({ slug }));
}

export function generateMetadata({ params }) {
  const department = getDepartment(params.slug);
  if (!department) return { title: 'Department not found' };

  const path = departmentPath(department.slug);
  return {
    title: department.name,
    description: department.summary,
    alternates: { canonical: path },
    openGraph: { type: 'website', title: department.name, description: department.summary, url: path },
  };
}

const EESA_LINKS = [
  { href: '/projects', icon: HiLightBulb, title: 'Projects', description: 'See what members are building and find a team to join.' },
  { href: '/events', icon: HiCalendar, title: 'Events', description: 'Workshops, industrial visits, talks and competitions.' },
  { href: '/portal/library', icon: HiBookOpen, title: 'Library', description: 'Notes and past papers shared by members, organised by unit.' },
];

function SectionHeading({ id, title, subtitle }) {
  return (
    <div className="mb-10">
      <h2 id={id} className="section-title mb-3">{title}</h2>
      {subtitle && <p className="section-subtitle">{subtitle}</p>}
    </div>
  );
}

function CheckList({ items, columns = false }) {
  return (
    <ul className={`grid gap-3 ${columns ? 'sm:grid-cols-2' : ''}`}>
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm text-body">
          <HiCheckCircle className="w-5 h-5 text-primary-500 dark:text-primary-300 shrink-0" aria-hidden="true" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function DepartmentPage({ params }) {
  const department = getDepartment(params.slug);
  if (!department) notFound();

  const {
    name, tagline, overview, focusAreas, coursework, practicals,
    careers, sectors, pathway, projectIdeas, icon: Icon,
  } = department;
  const otherDepartments = DEPARTMENT_PROFILES.filter((other) => other.slug !== department.slug);

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16 sm:py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav aria-label="Breadcrumb" className="mb-8">
            <ol className="flex items-center gap-1.5 text-sm text-white/75">
              <li><Link href="/departments" className="hover:text-white transition-colors">Departments</Link></li>
              <li aria-hidden="true"><HiChevronRight className="w-4 h-4" /></li>
              <li aria-current="page" className="text-white font-medium truncate">{name}</li>
            </ol>
          </nav>

          <div className="flex flex-col sm:flex-row sm:items-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-white/10 ring-1 ring-white/20 flex items-center justify-center shrink-0">
              <Icon className="w-8 h-8 text-accent-400" aria-hidden="true" />
            </div>
            <div>
              <h1 className="font-heading text-4xl sm:text-5xl font-bold">{name}</h1>
              <p className="text-lg sm:text-xl text-gray-200 mt-2 max-w-2xl">{tagline}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Overview */}
      <section className="py-16 bg-surface" aria-labelledby="overview">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 lg:grid-cols-3 gap-10 lg:gap-12">
          <div className="lg:col-span-2">
            <SectionHeading id="overview" title="Overview" />
            <div className="space-y-4 text-body leading-relaxed">
              {overview.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            </div>
          </div>

          <aside className="card bg-canvas h-fit" aria-labelledby="sectors">
            <div className="flex items-center gap-3 mb-4">
              <HiOfficeBuilding className="w-6 h-6 text-accent-600" aria-hidden="true" />
              <h2 id="sectors" className="font-heading font-semibold text-lg text-strong">Where graduates work</h2>
            </div>
            <CheckList items={sectors} />
          </aside>
        </div>
      </section>

      {/* Specialisations */}
      <section className="py-16 bg-canvas" aria-labelledby="specialisations">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="specialisations"
            title="Areas of specialisation"
            subtitle={`The main fields within ${name}, from first principles to final-year projects.`}
          />
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {focusAreas.map((area) => (
              <li key={area.title} className="card">
                <h3 className="font-heading font-semibold text-lg text-strong mb-2">{area.title}</h3>
                <p className="text-muted-fg text-sm leading-relaxed">{area.description}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Study */}
      <section className="py-16 bg-surface" aria-labelledby="study">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="study"
            title="What you will study"
            subtitle="Typical subjects and practical training. Exact units vary by year and programme."
          />
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="card lg:col-span-3">
              <div className="flex items-center gap-3 mb-5">
                <HiBookOpen className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                <h3 className="font-heading font-semibold text-lg text-strong">Core subjects</h3>
              </div>
              <CheckList items={coursework} columns />
            </div>
            <div className="card lg:col-span-2">
              <div className="flex items-center gap-3 mb-5">
                <HiBeaker className="w-6 h-6 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                <h3 className="font-heading font-semibold text-lg text-strong">Hands-on learning</h3>
              </div>
              <CheckList items={practicals} />
            </div>
          </div>
        </div>
      </section>

      {/* Careers */}
      <section className="py-16 bg-canvas" aria-labelledby="careers">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading id="careers" title="Career paths" subtitle="Roles graduates commonly go on to hold." />
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
            {careers.map((career) => (
              <li key={career} className="flex items-center gap-3 rounded-lg border border-line bg-surface px-4 py-3 text-sm font-medium text-body">
                <HiBriefcase className="w-5 h-5 text-accent-600 shrink-0" aria-hidden="true" />
                {career}
              </li>
            ))}
          </ul>

          <div className="card bg-primary-50 dark:bg-primary-500/10 border-primary-200 dark:border-primary-500/30 flex flex-col sm:flex-row gap-4">
            <div className="w-12 h-12 bg-primary-500 rounded-xl flex items-center justify-center shrink-0">
              <HiAcademicCap className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div>
              <h3 className="font-heading font-semibold text-lg text-strong mb-1">Professional registration</h3>
              <p className="text-body text-sm leading-relaxed">{pathway}</p>
            </div>
          </div>
        </div>
      </section>

      {/* EESA */}
      <section className="py-16 bg-surface" aria-labelledby="get-involved">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <SectionHeading
            id="get-involved"
            title={`${name} at EESA`}
            subtitle="Put your coursework to use with students from every department."
          />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="card bg-accent-50 dark:bg-accent-500/10 border-accent-200 dark:border-accent-500/30">
              <div className="flex items-center gap-3 mb-5">
                <HiLightBulb className="w-6 h-6 text-accent-600" aria-hidden="true" />
                <h3 className="font-heading font-semibold text-lg text-strong">Project ideas to get started</h3>
              </div>
              <CheckList items={projectIdeas} />
              <p className="text-sm text-muted-fg mt-5">
                Have an idea of your own? <Link href="/contact" className="font-medium text-primary-500 dark:text-primary-300 hover:underline">Tell the committee</Link>.
              </p>
            </div>

            <ul className="grid gap-4">
              {EESA_LINKS.map(({ href, icon: LinkIcon, title, description }) => (
                <li key={href}>
                  <Link href={href} className="card-interactive group flex items-center gap-4 !p-5">
                    <div className="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-500/15 flex items-center justify-center shrink-0">
                      <LinkIcon className="w-5 h-5 text-primary-500 dark:text-primary-300" aria-hidden="true" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-heading font-semibold text-strong">{title}</p>
                      <p className="text-sm text-muted-fg">{description}</p>
                    </div>
                    <HiArrowRight className="w-5 h-5 text-faint shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Other departments */}
      <section className="py-16 bg-canvas" aria-labelledby="other-departments">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between gap-4 mb-8">
            <h2 id="other-departments" className="section-title">Explore other departments</h2>
            <Link href="/departments" className="btn-outline hidden sm:inline-flex">All departments</Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {otherDepartments.map(({ slug, name: otherName, tagline: otherTagline, icon: OtherIcon }) => (
              <li key={slug}>
                <Link href={departmentPath(slug)} className="card-interactive group flex flex-col h-full !p-5">
                  <OtherIcon className="w-6 h-6 text-primary-500 dark:text-primary-300 mb-3" aria-hidden="true" />
                  <p className="font-heading font-semibold text-strong mb-1">{otherName}</p>
                  <p className="text-sm text-muted-fg">{otherTagline}</p>
                </Link>
              </li>
            ))}
          </ul>
          <div className="text-center mt-8 sm:hidden">
            <Link href="/departments" className="btn-outline">All departments</Link>
          </div>
        </div>
      </section>
    </>
  );
}
