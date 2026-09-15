import Link from 'next/link';
import DepartmentCard from '@/components/DepartmentCard';
import { DEPARTMENT_PROFILES } from '@/lib/departments';

export const metadata = {
  title: 'Departments',
  description: 'The engineering and technology departments EESA brings together at Egerton University: what each one studies, its specialisations and where its graduates work.',
  alternates: { canonical: '/departments' },
};

export default function DepartmentsPage() {
  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4">Departments</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">
            Five disciplines, one association. Explore what each department studies and where it can take you.
          </p>
        </div>
      </section>

      <section className="py-16 bg-canvas">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <ul className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {DEPARTMENT_PROFILES.map((department) => (
              <li key={department.slug}>
                <DepartmentCard department={department} headingLevel={2} />
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="py-16 bg-surface">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="section-title mb-4">Every discipline has a place in EESA</h2>
          <p className="section-subtitle mx-auto mb-8">
            Real engineering problems rarely stay inside one department. EESA brings students from all of them
            together on projects, competitions, industrial visits and events.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link href="/register" className="btn-primary">Join EESA</Link>
            <Link href="/projects" className="btn-outline">See member projects</Link>
          </div>
        </div>
      </section>
    </>
  );
}
