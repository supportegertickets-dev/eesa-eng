import Link from 'next/link';

export default function ProjectCard({ project }) {
  const statusColors = {
    planning: 'bg-yellow-100 dark:bg-yellow-500/15 text-yellow-800 dark:text-yellow-300',
    'in-progress': 'bg-blue-100 dark:bg-blue-500/15 text-blue-800 dark:text-blue-300',
    completed: 'bg-green-100 dark:bg-green-500/15 text-green-800 dark:text-green-300',
    'on-hold': 'bg-muted text-strong',
  };

  return (
    <div className="bg-surface rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-line">
      {project.image && (
        <div className="h-48 bg-muted-strong overflow-hidden">
          <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[project.status] || statusColors['on-hold']}`}>
            {project.status}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 dark:bg-primary-500/15 text-primary-800 dark:text-primary-300">
            {project.category}
          </span>
        </div>

        <h3 className="font-heading font-semibold text-lg text-strong mb-2">
          {project.title}
        </h3>

        <p className="text-muted-fg text-sm mb-4 line-clamp-3">
          {project.description}
        </p>

        {project.technologies && project.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.technologies.slice(0, 4).map((tech, i) => (
              <span key={i} className="px-2 py-0.5 bg-muted text-muted-fg rounded text-xs">
                {tech}
              </span>
            ))}
            {project.technologies.length > 4 && (
              <span className="px-2 py-0.5 bg-muted text-muted-fg rounded text-xs">
                +{project.technologies.length - 4}
              </span>
            )}
          </div>
        )}

        {project.teamLead && (
          <p className="text-xs text-subtle mb-4">
            Lead: {project.teamLead.firstName} {project.teamLead.lastName}
          </p>
        )}

        <Link
          href={`/projects/${project._id}`}
          className="inline-flex items-center text-primary-500 dark:text-primary-300 font-medium text-sm hover:text-primary-700 dark:hover:text-primary-200 transition-colors"
        >
          View Project →
        </Link>
      </div>
    </div>
  );
}
