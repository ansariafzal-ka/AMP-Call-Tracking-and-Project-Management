import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  UserPlus,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  X,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import { getErrorMessage } from '../utils/format';
import { AdminUserModal } from '../components/AdminUserModal';
import { DeleteUserModal } from '../components/DeleteUserModal';
import type { AdminUser, GetAdminUsersResponse } from '../types';

export const AdminUsersPage: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalUser, setModalUser] = useState<AdminUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, any> = {
      page,
      limit,
    };

    if (search.trim()) params.search = search.trim();
    if (roleFilter !== 'all') params.role = roleFilter;
    if (statusFilter !== 'all') params.status = statusFilter;

    try {
      const res = await apiClient.get<GetAdminUsersResponse>('/api/admin/users', { params });
      if (res.data?.data) {
        setUsers(res.data.data.users);
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setTotalCount(res.data.data.pagination.total || 0);
      }
    } catch (err) {
      console.error('Failed to load users:', err);
      setError(getErrorMessage(err, 'Failed to retrieve users. Please try again.'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, roleFilter, statusFilter]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleOpenCreate = () => {
    setModalUser(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (user: AdminUser) => {
    setModalUser(user);
    setIsModalOpen(true);
  };

  const handleModalSuccess = (savedUser: AdminUser, mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setSuccessMessage(`User "${savedUser.full_name}" created successfully!`);
      fetchUsers();
    } else {
      setSuccessMessage(`User "${savedUser.full_name}" updated successfully!`);
      setUsers((prev) =>
        prev.map((u) => (u.id === savedUser.id ? { ...u, ...savedUser } : u))
      );
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Users &amp; Calling Targets
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-amber-800">
              Admin
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Manage coordinator accounts, roles, access status, and daily &amp; weekly calling targets
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <UserPlus size={16} />
          <span>Add New User</span>
        </button>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchUsers()}
            className="font-semibold text-red-900 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Full-Width Users Directory Card */}
      <div className="w-full bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar with Search & Filters */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search by name, mobile, email..."
              className="w-full h-[40px] pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
          </div>

          {/* Filter Dropdowns & Refresh */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              className="h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="caller">Callers</option>
              <option value="admin">Admins</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            <button
              type="button"
              onClick={() => fetchUsers()}
              title="Refresh user list"
              className="h-[40px] w-[40px] flex items-center justify-center rounded-lg border border-gray-200 text-text-muted hover:text-maroon hover:bg-maroon/5 transition-colors cursor-pointer shrink-0"
            >
              <RefreshCw size={15} className={loading ? 'animate-spin text-maroon' : ''} />
            </button>
          </div>
        </div>

        {/* Table */}
        {loading && users.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">Loading users directory...</div>
        ) : users.length === 0 ? (
          <div className="p-12 text-center text-text-muted text-sm">
            No coordinators found matching your search and filter criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3.5 px-6 whitespace-nowrap">Name &amp; Credentials</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Role</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Daily Target</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Weekly Target</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Assigned Contacts</th>
                  <th className="py-3.5 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3.5 px-6 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((user) => (
                  <tr
                    key={user.id}
                    className="hover:bg-page-bg/40 transition-colors"
                  >
                    {/* Name & Credentials */}
                    <td className="py-4 px-6 min-w-[240px]">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-maroon/10 text-maroon font-bold text-xs flex items-center justify-center shrink-0">
                          {user.full_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="font-semibold text-text-main flex items-center gap-1.5 whitespace-nowrap">
                            <span>{user.full_name}</span>
                            {user.role === 'admin' && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-[#C9A04A] text-white">
                                Admin
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-text-muted truncate mt-0.5 flex items-center gap-2">
                            <span>{user.mobile_number}</span>
                            <span>&bull;</span>
                            <span className="truncate">{user.email}</span>
                          </div>
                        </div>
                      </div>
                    </td>

                    {/* Role */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                          user.role === 'admin'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>

                    {/* Daily Target */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-maroon/8 text-maroon border border-maroon/15">
                        {user.daily_target} / day
                      </span>
                    </td>

                    {/* Weekly Target */}
                    <td className="py-4 px-4 whitespace-nowrap text-text-main font-medium">
                      {user.weekly_target} / wk
                    </td>

                    {/* Assigned Contacts */}
                    <td className="py-4 px-4 whitespace-nowrap text-text-main font-medium">
                      {user.total_assigned_contacts} contacts
                    </td>

                    {/* Status */}
                    <td className="py-4 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          user.is_active
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {user.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-4 px-6 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenEdit(user)}
                          title="Edit user"
                          className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-maroon text-maroon hover:bg-maroon hover:text-white transition-colors cursor-pointer"
                        >
                          <Edit2 size={15} />
                        </button>

                        <button
                          type="button"
                          disabled={currentUser?.id === user.id}
                          onClick={() => setDeleteUser(user)}
                          title={currentUser?.id === user.id ? 'You cannot delete your own account' : 'Delete user'}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 hover:bg-red-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                        >
                          <Trash2 size={13} />
                          <span>Delete</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1.5">
                <label htmlFor="users-page-size" className="text-xs">
                  Rows:
                </label>
                <select
                  id="users-page-size"
                  value={limit}
                  onChange={(e) => {
                    setLimit(Number(e.target.value));
                    setPage(1);
                  }}
                  className="h-8 px-2 rounded-md border border-gray-300 bg-white text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold cursor-pointer"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                Next
                <ChevronRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Admin User Modal (Create & Edit) */}
      <AdminUserModal
        isOpen={isModalOpen}
        user={modalUser}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
      />

      {/* Delete User Modal */}
      {deleteUser && (
        <DeleteUserModal
          user={deleteUser}
          currentAdminId={currentUser?.id}
          availableUsers={users}
          onClose={() => setDeleteUser(null)}
          onSuccess={(deletedName, transferredCount) => {
            setDeleteUser(null);
            fetchUsers();
            if (transferredCount > 0) {
              setSuccessMessage(
                `User "${deletedName}" was deleted and ${transferredCount} contact(s) were reassigned.`
              );
            } else {
              setSuccessMessage(`User "${deletedName}" was deleted successfully.`);
            }
          }}
        />
      )}
    </div>
  );
};
