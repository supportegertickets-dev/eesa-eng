'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { format } from 'date-fns';
import { getArticle } from '@/lib/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { HiArrowLeft } from 'react-icons/hi';
import Link from 'next/link';

export default function NewsDetailPage({ params }) {
  const { id } = params;
  const [article, setArticle] = useState(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    loadArticle();
  }, [id]);

  const loadArticle = async () => {
    try {
      const data = await getArticle(id);
      setArticle(data);
    } catch {
      toast.error('Article not found');
      router.push('/news');
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <LoadingSpinner size="lg" />;
  if (!article) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="bg-gradient-to-r from-primary-500 to-primary-700 text-white py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/news" className="inline-flex items-center text-gray-200 hover:text-white mb-6 transition-colors">
            <HiArrowLeft className="w-5 h-5 mr-1" /> Back to News
          </Link>
          <span className="px-3 py-1 bg-white/20 rounded-full text-sm font-medium capitalize mb-4 inline-block">
            {article.category}
          </span>
          <h1 className="font-heading text-3xl sm:text-4xl font-bold mb-4">{article.title}</h1>
          <div className="flex items-center gap-4 text-gray-200 text-sm">
            {article.author && (
              <span>By {article.author.firstName} {article.author.lastName}</span>
            )}
            {article.publishedAt && (
              <span>{format(new Date(article.publishedAt), 'MMMM dd, yyyy')}</span>
            )}
          </div>
        </div>
      </section>

      <section className="py-12">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="card">
            {article.image && (
              <img src={article.image} alt={article.title} className="w-full rounded-lg mb-8 shadow-md" />
            )}
            <div className="prose max-w-none text-gray-700 whitespace-pre-wrap leading-relaxed">
              {article.content}
            </div>
            {article.tags && article.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-8 pt-6 border-t">
                {article.tags.map((tag, i) => (
                  <span key={i} className="px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-sm">
                    #{tag}
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
