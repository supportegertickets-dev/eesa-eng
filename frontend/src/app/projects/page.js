'use client';

import { useState, useEffect } from 'react';
import ProjectCard from '@/components/ProjectCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getProjects } from '@/lib/api';

export default function ProjectsPage() {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadProjects();
  }, [page, filter]);

  const loadProjects = async () => {
    setLoading(true);
    try {
      const params = `?page=${page}&limit=9${filter ? `&category=${filter}` : ''}`;
      const data = await getProjects(params);
      setProjects(data.projects || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Error loading projects:', error);
    } finally {
      setLoading(false);
    }
  };

  const categories = ['research', 'community', 'competition', 'innovation'];

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4">Projects</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">
            Explore innovative engineering projects built by EESA members
          </p>
        </div>
      </section>

      <section className="py-12 bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-wrap gap-2 justify-center">
            <button
              onClick={() => { setFilter(''); setPage(1); }}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                !filter ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              All Projects
            </button>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setFilter(cat); setPage(1); }}
                className={`px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors ${
                  filter === cat ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingSpinner size="lg" />
          ) : projects.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map((project) => (
                  <ProjectCard key={project._id} project={project} />
                ))}
              </div>
              {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 mt-12">
                  <button
                    onClick={() => setPage(p => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="btn-outline disabled:opacity-50"
                  >
                    Previous
                  </button>
                  <span className="text-gray-600">Page {page} of {totalPages}</span>
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    className="btn-outline disabled:opacity-50"
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-20">
              <p className="text-gray-500 text-lg">No projects yet. Stay tuned!</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
