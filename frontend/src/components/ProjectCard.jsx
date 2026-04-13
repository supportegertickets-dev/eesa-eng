import Link from 'next/link';

export default function ProjectCard({ project }) {
  const statusColors = {
    planning: 'bg-yellow-100 text-yellow-800',
    'in-progress': 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    'on-hold': 'bg-gray-100 text-gray-800',
  };

  return (
    <div className="bg-white rounded-xl shadow-md hover:shadow-lg transition-shadow overflow-hidden border border-gray-100">
      {project.image && (
        <div className="h-48 bg-gray-200 overflow-hidden">
          <img src={project.image} alt={project.title} className="w-full h-full object-cover" />
        </div>
      )}
      <div className="p-6">
        <div className="flex items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${statusColors[project.status] || statusColors['on-hold']}`}>
            {project.status}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800">
            {project.category}
          </span>
        </div>

        <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">
          {project.title}
        </h3>

        <p className="text-gray-600 text-sm mb-4 line-clamp-3">
          {project.description}
        </p>

        {project.technologies && project.technologies.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {project.technologies.slice(0, 4).map((tech, i) => (
              <span key={i} className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                {tech}
              </span>
            ))}
            {project.technologies.length > 4 && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-600 rounded text-xs">
                +{project.technologies.length - 4}
              </span>
            )}
          </div>
        )}

        {project.teamLead && (
          <p className="text-xs text-gray-500 mb-4">
            Lead: {project.teamLead.firstName} {project.teamLead.lastName}
          </p>
        )}

        <Link
          href={`/projects/${project._id}`}
          className="inline-flex items-center text-primary-500 font-medium text-sm hover:text-primary-700 transition-colors"
        >
          View Project →
        </Link>
      </div>
    </div>
  );
}
