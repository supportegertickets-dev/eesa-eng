'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getNews } from '@/lib/api';

export default function NewsPage() {
  const [news, setNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => {
    loadNews();
  }, [page]);

  const loadNews = async () => {
    setLoading(true);
    try {
      const data = await getNews(`?page=${page}&limit=9`);
      setNews(data.news || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Error loading news:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h1 className="font-heading text-4xl sm:text-5xl font-bold mb-4">News & Updates</h1>
          <p className="text-xl text-gray-200 max-w-2xl mx-auto">
            Stay informed about the latest EESA activities and achievements
          </p>
        </div>
      </section>

      <section className="py-16 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading ? (
            <LoadingSpinner size="lg" />
          ) : news.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {news.map((article) => (
                  <Link
                    key={article._id}
                    href={`/news/${article._id}`}
                    className="card hover:shadow-lg transition-shadow group"
                  >
                    {article.image && (
                      <div className="h-48 -mx-6 -mt-6 mb-4 overflow-hidden rounded-t-xl">
                        <img src={article.image} alt={article.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-3">
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 capitalize">
                        {article.category}
                      </span>
                      {article.publishedAt && (
                        <span className="text-xs text-gray-500">
                          {format(new Date(article.publishedAt), 'MMM dd, yyyy')}
                        </span>
                      )}
                    </div>
                    <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2 group-hover:text-primary-500 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-gray-600 text-sm line-clamp-3">
                      {article.excerpt || article.content?.substring(0, 200)}
                    </p>
                    {article.author && (
                      <p className="text-xs text-gray-400 mt-4">
                        By {article.author.firstName} {article.author.lastName}
                      </p>
                    )}
                  </Link>
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
              <p className="text-gray-500 text-lg">No news articles yet. Stay tuned!</p>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
