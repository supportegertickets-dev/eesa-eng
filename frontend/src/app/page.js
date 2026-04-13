'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Hero from '@/components/Hero';
import EventCard from '@/components/EventCard';
import ProjectCard from '@/components/ProjectCard';
import LoadingSpinner from '@/components/LoadingSpinner';
import { getEvents, getProjects, getNews, getUserStats, getSponsors } from '@/lib/api';
import { HiAcademicCap, HiUserGroup, HiLightBulb, HiCalendar, HiExternalLink } from 'react-icons/hi';

export default function Home() {
  const [events, setEvents] = useState([]);
  const [projects, setProjects] = useState([]);
  const [news, setNews] = useState([]);
  const [stats, setStats] = useState(null);
  const [sponsors, setSponsors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [eventsData, projectsData, newsData, statsData, sponsorsData] = await Promise.allSettled([
        getEvents('?limit=3&status=upcoming'),
        getProjects('?limit=3'),
        getNews('?limit=3'),
        getUserStats(),
        getSponsors(),
      ]);

      if (eventsData.status === 'fulfilled') setEvents(eventsData.value.events || []);
      if (projectsData.status === 'fulfilled') setProjects(projectsData.value.projects || []);
      if (newsData.status === 'fulfilled') setNews(newsData.value.news || []);
      if (statsData.status === 'fulfilled') setStats(statsData.value);
      if (sponsorsData.status === 'fulfilled') setSponsors(sponsorsData.value.sponsors || sponsorsData.value || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const features = [
    {
      icon: HiAcademicCap,
      title: 'Academic Excellence',
      description: 'Access workshops, study resources, and mentorship programs to excel in your engineering studies.',
    },
    {
      icon: HiUserGroup,
      title: 'Strong Community',
      description: 'Connect with fellow engineering students across all departments and build lasting professional networks.',
    },
    {
      icon: HiLightBulb,
      title: 'Innovation Hub',
      description: 'Work on real-world engineering projects, participate in competitions, and showcase your inventions.',
    },
    {
      icon: HiCalendar,
      title: 'Exciting Events',
      description: 'From technical workshops to industrial visits and social gatherings — there is always something happening.',
    },
  ];

  return (
    <>
      <Hero />

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-title mb-4">Why Join EESA?</h2>
            <p className="section-subtitle mx-auto">
              We provide a platform for engineering students to grow academically, professionally, and socially.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {features.map((feature, i) => (
              <div key={i} className="text-center p-6 rounded-xl hover:bg-gray-50 transition-colors group">
                <div className="w-14 h-14 bg-primary-100 rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:bg-primary-500 transition-colors">
                  <feature.icon className="w-7 h-7 text-primary-500 group-hover:text-white transition-colors" />
                </div>
                <h3 className="font-heading font-semibold text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats */}
      {stats && (
        <section className="py-16 bg-primary-500 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
              <div>
                <div className="text-4xl font-heading font-bold text-accent-400">{stats.total || 0}+</div>
                <div className="text-sm text-gray-200 mt-1">Members</div>
              </div>
              <div>
                <div className="text-4xl font-heading font-bold text-accent-400">{stats.byDepartment?.length || 5}</div>
                <div className="text-sm text-gray-200 mt-1">Departments</div>
              </div>
              <div>
                <div className="text-4xl font-heading font-bold text-accent-400">{projects.length || 0}+</div>
                <div className="text-sm text-gray-200 mt-1">Projects</div>
              </div>
              <div>
                <div className="text-4xl font-heading font-bold text-accent-400">{events.length || 0}+</div>
                <div className="text-sm text-gray-200 mt-1">Events</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Events */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="section-title mb-2">Upcoming Events</h2>
              <p className="section-subtitle">Don&apos;t miss out on these exciting activities</p>
            </div>
            <Link href="/events" className="btn-outline hidden sm:inline-flex">
              View All Events
            </Link>
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : events.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {events.map((event) => (
                <EventCard key={event._id} event={event} />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-12">No upcoming events at the moment. Check back soon!</p>
          )}
          <div className="text-center mt-8 sm:hidden">
            <Link href="/events" className="btn-outline">View All Events</Link>
          </div>
        </div>
      </section>

      {/* Latest Projects */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between mb-12">
            <div>
              <h2 className="section-title mb-2">Our Projects</h2>
              <p className="section-subtitle">Innovations built by EESA members</p>
            </div>
            <Link href="/projects" className="btn-outline hidden sm:inline-flex">
              View All Projects
            </Link>
          </div>
          {loading ? (
            <LoadingSpinner />
          ) : projects.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {projects.map((project) => (
                <ProjectCard key={project._id} project={project} />
              ))}
            </div>
          ) : (
            <p className="text-center text-gray-500 py-12">Projects coming soon!</p>
          )}
        </div>
      </section>

      {/* Latest News */}
      {news.length > 0 && (
        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-12">
              <h2 className="section-title mb-2">Latest News</h2>
              <p className="section-subtitle mx-auto">Stay updated with EESA happenings</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {news.map((article) => (
                <Link key={article._id} href={`/news/${article._id}`} className="card hover:shadow-lg transition-shadow">
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-800 mb-3 inline-block">
                    {article.category}
                  </span>
                  <h3 className="font-heading font-semibold text-lg text-gray-900 mb-2">{article.title}</h3>
                  <p className="text-gray-600 text-sm line-clamp-3">{article.excerpt || article.content?.substring(0, 150)}</p>
                </Link>
              ))}
            </div>
            <div className="text-center mt-8">
              <Link href="/news" className="btn-outline">Read More News</Link>
            </div>
          </div>
        </section>
      )}

      {/* Sponsors */}
      {sponsors.length > 0 && (
        <section className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-10">
              <h2 className="section-title mb-2">Our Sponsors</h2>
              <p className="section-subtitle mx-auto">Proudly supported by these organizations</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-8">
              {sponsors.map((s) => (
                <a key={s._id} href={s.website || '#'} target="_blank" rel="noopener noreferrer" className="group flex flex-col items-center">
                  {s.logo ? (
                    <img src={s.logo} alt={s.name} className="h-16 w-auto object-contain grayscale group-hover:grayscale-0 transition-all opacity-60 group-hover:opacity-100" />
                  ) : (
                    <div className="h-16 w-28 bg-gray-100 rounded-lg flex items-center justify-center">
                      <span className="text-gray-400 font-medium text-sm">{s.name}</span>
                    </div>
                  )}
                  <span className="text-xs text-gray-400 mt-2 group-hover:text-primary-500 transition-colors">{s.name}</span>
                </a>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* CTA */}
      <section className="py-20 bg-gradient-to-r from-primary-600 to-primary-800 text-white">
        <div className="max-w-4xl mx-auto text-center px-4">
          <h2 className="font-heading text-3xl sm:text-4xl font-bold mb-4">
            Ready to Join the Engineering Community?
          </h2>
          <p className="text-lg text-gray-200 mb-8 max-w-2xl mx-auto">
            Become a member of EESA today and unlock access to exclusive events, projects, 
            resources, and a network of ambitious engineers.
          </p>
          <Link href="/register" className="btn-accent text-lg px-10 py-3">
            Become a Member
          </Link>
        </div>
      </section>
    </>
  );
}
