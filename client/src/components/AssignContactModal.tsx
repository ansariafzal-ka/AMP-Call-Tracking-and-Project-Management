import React, { useState, useEffect } from 'react';
import {
  X,
  UserCheck,
  AlertCircle,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { AdminContact, AdminUser, GetAdminUsersResponse } from '../types';

interface AssignContactModalProps {
  isOpen: boolean;
  contacts: AdminContact[];
  onClose: () => void;
  onSuccess: (assignedCount: number, targetUserName: string) => void;
}

export const AssignContactModal: React.FC<AssignContactModalProps> = ({
  isOpen,
  contacts,
  onClose,
  onSuccess,
}) => {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState<boolean>(true);
  const [selectedUserId, setSelectedUserId] = useState<number | ''>('');
  const [reassignFollowUps, setReassignFollowUps] = useState<boolean>(true);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;

    setError(null);
    setSelectedUserId('');
    setReassignFollowUps(true);
    setLoadingUsers(true);

    apiClient
      .get<GetAdminUsersResponse>('/api/admin/users', {
        params: { status: 'active', limit: 100 },
      })
      .then((res) => {
        if (res.data?.data?.users) {
          // Filter to active callers only (admins do not take calls)
          setUsers(res.data.data.users.filter((u) => u.is_active && u.role === 'caller'));
        }
      })
      .catch((err) => {
        console.error('Failed to load coordinators for assignment:', err);
        setError('Failed to load coordinators list. Please try again.');
      })
      .finally(() => {
        setLoadingUsers(false);
      });
  }, [isOpen]);

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

  if (!isOpen || contacts.length === 0) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setError('Please select a coordinator to assign these contacts to.');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const contactIds = contacts.map((c) => c.id);
      const res = await apiClient.post('/api/admin/contacts/assign', {
        contactIds,
        targetUserId: Number(selectedUserId),
        reassignFollowUps,
      });

      const assignedCount = res.data?.data?.assignedCount || contactIds.length;
      const targetUserName = res.data?.data?.targetUserName || 'selected coordinator';

      onSuccess(assignedCount, targetUserName);
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to assign contacts.'));
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
        {/* Modal Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
              <UserCheck size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                {contacts.length === 1
                  ? 'Assign Contact'
                  : `Assign ${contacts.length} Contacts`}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Assign selected contacts to an active coordinator
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

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Selected Contacts Preview */}
          <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100 space-y-2">
            <div className="text-xs font-semibold text-text-muted uppercase tracking-wider flex items-center justify-between">
              <span>Selected Contacts ({contacts.length})</span>
            </div>
            <div className="max-h-28 overflow-y-auto divide-y divide-gray-200/60 text-xs">
              {contacts.map((c) => (
                <div key={c.id} className="py-1.5 flex items-center justify-between">
                  <div>
                    <span className="font-semibold text-text-main">{c.name}</span>
                    <span className="text-text-muted ml-2">{c.mobile_number}</span>
                  </div>
                  <span className="text-[11px] text-text-muted font-medium">
                    {c.assigned_user_name ? `Assigned: ${c.assigned_user_name}` : 'Unassigned'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Select Coordinator */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              Select Assignee Coordinator <span className="text-red-600">*</span>
            </label>
            {loadingUsers ? (
              <div className="h-[42px] px-3 rounded-lg border border-gray-200 bg-gray-50 flex items-center text-xs text-text-muted">
                Loading active coordinators...
              </div>
            ) : users.length === 0 ? (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                No active coordinators found. Please add or activate a coordinator in Users &amp; Targets first.
              </div>
            ) : (
              <select
                required
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value ? Number(e.target.value) : '')}
                className="w-full h-[42px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition cursor-pointer"
              >
                <option value="">-- Choose a Coordinator --</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.role}) &bull; {u.mobile_number}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Reassign Follow-ups Checkbox */}
          <label className="flex items-start gap-2.5 pt-1 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reassignFollowUps}
              onChange={(e) => setReassignFollowUps(e.target.checked)}
              className="mt-0.5 rounded text-maroon focus:ring-maroon cursor-pointer"
            />
            <div className="text-xs">
              <span className="font-semibold text-text-main">
                Reassign pending follow-ups
              </span>
              <p className="text-text-muted mt-0.5 leading-snug">
                Transfers any active follow-up tasks and call history for these contacts to the new coordinator.
              </p>
            </div>
          </label>

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
              disabled={submitting || !selectedUserId || users.length === 0}
              className="px-6 h-[40px] rounded-lg bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting
                ? 'Assigning...'
                : `Assign ${contacts.length} Contact${contacts.length > 1 ? 's' : ''}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
