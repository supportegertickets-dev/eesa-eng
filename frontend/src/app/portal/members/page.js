'use client';

import { useState, useEffect } from 'react';
import { getUsers, updateUserRole, deactivateUser } from '@/lib/api';
import { useAuth } from '@/lib/AuthContext';
import LoadingSpinner from '@/components/LoadingSpinner';
import toast from 'react-hot-toast';
import { HiSearch, HiTrash } from 'react-icons/hi';

export default function MembersPage() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [department, setDepartment] = useState('');
  const isAdmin = ['admin', 'chairperson'].includes(currentUser?.role);

  const departments = [
    'Civil Engineering', 'Mechanical Engineering', 'Electrical Engineering',
    'Agricultural Engineering', 'Chemical Engineering',
  ];

  useEffect(() => {
    loadUsers();
  }, [page, department]);

  const loadUsers = async () => {
    setLoading(true);
    try {
      const params = `?page=${page}&limit=20${department ? `&department=${encodeURIComponent(department)}` : ''}`;
      const data = await getUsers(params);
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
    } catch (error) {
      console.error('Error loading members:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleRoleChange = async (id, role) => {
    try {
      await updateUserRole(id, role);
      toast.success(`Role updated to ${role}`);
      loadUsers();
    } catch (err) { toast.error(err.message); }
  };

  const handleDeactivate = async (id, name) => {
    if (!confirm(`Deactivate ${name}? They will lose access.`)) return;
    try {
      await deactivateUser(id);
      toast.success('User deactivated');
      loadUsers();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div>
      <h1 className="font-heading text-2xl font-bold text-gray-900 mb-8">Members Directory</h1>

      {/* Filters */}
      <div className="card mb-8">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setDepartment(''); setPage(1); }}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              !department ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            All
          </button>
          {departments.map((dept) => (
            <button
              key={dept}
              onClick={() => { setDepartment(dept); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                department === dept ? 'bg-primary-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {dept.replace(' Engineering', '')}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : users.length > 0 ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {users.map((member) => (
              <div key={member._id} className="card text-center hover:shadow-lg transition-shadow relative group">
                {isAdmin && member._id !== currentUser._id && (
                  <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={() => handleDeactivate(member._id, `${member.firstName} ${member.lastName}`)} className="p-1.5 bg-white border rounded-lg shadow-sm text-red-500 hover:bg-red-50" title="Deactivate user">
                      <HiTrash className="w-4 h-4" />
                    </button>
                  </div>
                )}
                <div className="w-16 h-16 bg-primary-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <span className="text-xl font-bold text-primary-500">
                    {member.firstName[0]}{member.lastName[0]}
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900">{member.firstName} {member.lastName}</h3>
                <p className="text-xs text-gray-500 mt-1">{member.department}</p>
                <p className="text-xs text-gray-400">Year {member.yearOfStudy}</p>
                {isAdmin && member._id !== currentUser._id ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member._id, e.target.value)}
                    className="mt-2 text-xs border rounded px-2 py-1 text-gray-600 bg-white mx-auto"
                  >
                    <option value="member">Member</option>
                    <option value="chairperson">Chairperson</option>
                    <option value="vice_chairperson">Vice Chairperson</option>
                    <option value="organizing_secretary">Organizing Secretary</option>
                    <option value="secretary_general">Secretary General</option>
                    <option value="publicity_manager">Publicity Manager</option>
                    <option value="1st_cohort_rep">1st Cohort Rep</option>
                    <option value="treasurer">Treasurer</option>
                  </select>
                ) : member.role !== 'member' && (
                  <span className="inline-block mt-2 px-2 py-0.5 rounded-full text-xs font-medium bg-accent-100 text-accent-700">
                    {{ chairperson: 'Chairperson', vice_chairperson: 'Vice Chairperson', organizing_secretary: 'Organizing Secretary', secretary_general: 'Secretary General', publicity_manager: 'Publicity Manager', '1st_cohort_rep': '1st Cohort Rep', treasurer: 'Treasurer' }[member.role] || member.role}
                  </span>
                )}
                {member.bio && (
                  <p className="text-xs text-gray-500 mt-2 line-clamp-2">{member.bio}</p>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center items-center gap-4 mt-8">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-outline text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <span className="text-gray-600 text-sm">Page {page} of {totalPages}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="btn-outline text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-20">
          <p className="text-gray-500">No members found</p>
        </div>
      )}
    </div>
  );
}
