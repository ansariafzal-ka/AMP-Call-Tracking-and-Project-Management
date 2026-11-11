import React, { useState, useEffect } from 'react';
import {
  X,
  Users,
  AlertCircle,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { Project, AdminUser, GetAdminUsersResponse } from '../types';

interface AssignProjectCallersModalProps {
  isOpen: boolean;
  project: Project | null;
  onClose: () => void;
  onSuccess: (updatedCallersCount: number) => void;
}

export const AssignProjectCallersModal: React.FC<AssignProjectCallersModalProps> = ({
  isOpen,
  project,
  onClose,
  onSuccess,
}) => {
  const [allUsers, setAllUsers] = useState<AdminUser[]>([]);
  const [initialUserIds, setInitialUserIds] = useState<Set<number>>(new Set());
  const [selectedUserIds, setSelectedUserIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !project) return;

    setError(null);
    setLoading(true);

    Promise.all([
      apiClient.get<GetAdminUsersResponse>('/api/admin/users', {
        params: { status: 'active', limit: 100 },
      }),
      apiClient.get<{ success: boolean; data: { callers: any[] } }>(
        `/api/admin/projects/${project.id}`
      ),
    ])
      .then(([usersRes, projectDetailsRes]) => {
        if (usersRes.data?.data?.users) {
          setAllUsers(usersRes.data.data.users);
        }

        const currentCallers = projectDetailsRes.data?.data?.callers || [];
        const currentIds = new Set<number>(currentCallers.map((c: any) => c.id));
        setInitialUserIds(currentIds);
        setSelectedUserIds(new Set(currentIds));
      })
      .catch((err) => {
        console.error('Failed to load project callers:', err);
        setError('Failed to load project coordinators. Please try again.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen, project]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !submitting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, submitting, onClose]);

  if (!isOpen || !project) return null;

  const handleToggleUser = (userId: number) => {
    setSelectedUserIds((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  };

  const handleSelectAll = () => {
    if (selectedUserIds.size === allUsers.length) {
      setSelectedUserIds(new Set());
    } else {
      setSelectedUserIds(new Set(allUsers.map((u) => u.id)));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const toAdd = Array.from(selectedUserIds).filter((id) => !initialUserIds.has(id));
    const toRemove = Array.from(initialUserIds).filter((id) => !selectedUserIds.has(id));

    try {
      const promises: Promise<any>[] = [];

      if (toAdd.length > 0) {
        promises.push(
          apiClient.post(`/api/admin/projects/${project.id}/assign`, {
            userIds: toAdd,
            action: 'add',
          })
        );
      }

      if (toRemove.length > 0) {
        promises.push(
          apiClient.post(`/api/admin/projects/${project.id}/assign`, {
            userIds: toRemove,
            action: 'remove',
          })
        );
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      onSuccess(selectedUserIds.size);
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to update project callers.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 backdrop-blur-[2px] p-4 overflow-y-auto animate-in fade-in duration-150"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="w-full max-w-lg bg-card-bg rounded-2xl shadow-xl border border-gray-100 overflow-hidden my-6 animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                Assign Coordinators
              </h2>
              <p className="text-xs text-text-muted mt-0.5 truncate max-w-xs">
                {project.name}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            title="Close"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-text-muted hover:text-text-main hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Top selection bar */}
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-text-main">
              Select Coordinators ({selectedUserIds.size} assigned)
            </span>
            <button
              type="button"
              onClick={handleSelectAll}
              className="font-semibold text-maroon hover:underline cursor-pointer"
            >
              {selectedUserIds.size === allUsers.length && allUsers.length > 0
                ? 'Deselect All'
                : 'Select All'}
            </button>
          </div>

          {/* Coordinators List */}
          {loading ? (
            <div className="p-8 text-center text-xs text-text-muted">Loading coordinators...</div>
          ) : allUsers.length === 0 ? (
            <div className="p-8 text-center text-xs text-text-muted">
              No active coordinators found. Add coordinators in Users &amp; Targets first.
            </div>
          ) : (
            <div className="max-h-64 overflow-y-auto divide-y divide-gray-100 border border-gray-100 rounded-xl">
              {allUsers.map((user) => {
                const isSelected = selectedUserIds.has(user.id);

                return (
                  <label
                    key={user.id}
                    className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                      isSelected ? 'bg-maroon/4' : 'hover:bg-page-bg/40'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-maroon/10 text-maroon font-bold text-xs flex items-center justify-center shrink-0">
                        {user.full_name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-text-main text-xs flex items-center gap-1.5 truncate">
                          <span>{user.full_name}</span>
                          {user.role === 'admin' && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold uppercase bg-[#C9A04A] text-white">
                              Admin
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-text-muted truncate mt-0.5">
                          {user.email} &bull; {user.daily_target} calls/day
                        </div>
                      </div>
                    </div>

                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleUser(user.id)}
                      className="rounded text-maroon focus:ring-maroon cursor-pointer ml-3 shrink-0"
                    />
                  </label>
                );
              })}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-gray-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 h-[40px] rounded-lg border border-gray-200 text-sm font-semibold text-text-main hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting || loading}
              className="px-6 h-[40px] rounded-lg bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : 'Save Assigned Callers'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
