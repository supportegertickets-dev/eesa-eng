'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext';
import { getEvents, getProjects, getUserStats } from '@/lib/api';
import { HiCalendar, HiLightBulb, HiUserGroup, HiArrowRight } from 'react-icons/hi';

export default function PortalDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState({ events: 0, projects: 0, members: 0 });
  const [upcomingEvents, setUpcomingEvents] = useState([]);

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    try {
      const [eventsData, projectsData, statsData] = await Promise.allSettled([
        getEvents('?limit=5&status=upcoming'),
        getProjects('?limit=3'),
        getUserStats(),
      ]);

      if (eventsData.status === 'fulfilled') setUpcomingEvents(eventsData.value.events || []);
      
      setStats({
        events: eventsData.status === 'fulfilled' ? eventsData.value.total || 0 : 0,
        projects: projectsData.status === 'fulfilled' ? projectsData.value.total || 0 : 0,
        members: statsData.status === 'fulfilled' ? statsData.value.total || 0 : 0,
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
    }
  };

  return (
    <div>
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="font-heading text-2xl sm:text-3xl font-bold text-strong">
          Welcome back, {user?.firstName}!
        </h1>
        <p className="text-muted-fg mt-1">Here&apos;s what&apos;s happening in EESA</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-blue-100 dark:bg-blue-500/15 rounded-xl flex items-center justify-center">
            <HiCalendar className="w-6 h-6 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <p className="text-2xl font-bold text-strong">{stats.events}</p>
            <p className="text-sm text-subtle">Total Events</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-green-100 dark:bg-green-500/15 rounded-xl flex items-center justify-center">
            <HiLightBulb className="w-6 h-6 text-green-600 dark:text-green-300" />
          </div>
          <div>
            <p className="text-2xl font-bold text-strong">{stats.projects}</p>
            <p className="text-sm text-subtle">Active Projects</p>
          </div>
        </div>
        <div className="card flex items-center gap-4">
          <div className="w-12 h-12 bg-purple-100 dark:bg-purple-500/15 rounded-xl flex items-center justify-center">
            <HiUserGroup className="w-6 h-6 text-purple-600 dark:text-purple-300" />
          </div>
          <div>
            <p className="text-2xl font-bold text-strong">{stats.members}</p>
            <p className="text-sm text-subtle">Members</p>
          </div>
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-heading text-lg font-semibold">Upcoming Events</h2>
          <Link href="/portal/events" className="text-primary-500 dark:text-primary-300 text-sm font-medium hover:underline flex items-center gap-1">
            View All <HiArrowRight className="w-4 h-4" />
          </Link>
        </div>
        {upcomingEvents.length > 0 ? (
          <div className="space-y-4">
            {upcomingEvents.map((event) => (
              <div key={event._id} className="flex items-center gap-4 p-3 rounded-lg hover:bg-canvas transition-colors">
                <div className="w-12 h-12 bg-primary-100 dark:bg-primary-500/15 rounded-lg flex items-center justify-center flex-shrink-0">
                  <HiCalendar className="w-6 h-6 text-primary-500 dark:text-primary-300" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-strong truncate">{event.title}</p>
                  <p className="text-sm text-subtle">{event.location}</p>
                </div>
                <div className="text-right text-sm text-subtle">
                  <p>{new Date(event.date).toLocaleDateString()}</p>
                  <p className="capitalize text-xs">{event.category}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-subtle text-center py-8">No upcoming events</p>
        )}
      </div>

      {/* Quick Actions */}
      {['admin', 'chairperson'].includes(user?.role) && (
        <div className="mt-8">
          <h2 className="font-heading text-lg font-semibold mb-4">Quick Actions</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Link href="/portal/manage" className="card hover:border-primary-300 dark:hover:border-primary-500/30 transition-colors text-center">
              <HiCalendar className="w-8 h-8 text-primary-500 dark:text-primary-300 mx-auto mb-2" />
              <p className="font-medium">Create Event</p>
            </Link>
            <Link href="/portal/manage" className="card hover:border-primary-300 dark:hover:border-primary-500/30 transition-colors text-center">
              <HiLightBulb className="w-8 h-8 text-primary-500 dark:text-primary-300 mx-auto mb-2" />
              <p className="font-medium">New Project</p>
            </Link>
            <Link href="/portal/members" className="card hover:border-primary-300 dark:hover:border-primary-500/30 transition-colors text-center">
              <HiUserGroup className="w-8 h-8 text-primary-500 dark:text-primary-300 mx-auto mb-2" />
              <p className="font-medium">View Members</p>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
