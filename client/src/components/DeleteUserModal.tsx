import React, { useState, useEffect } from 'react';
import { X, Trash2, AlertTriangle } from 'lucide-react';
import apiClient from '../api/client';
import type { AdminUser, GetAdminUsersResponse } from '../types';
import { getErrorMessage } from '../utils/format';

interface DeleteUserModalProps {
  user: AdminUser | null;
  currentAdminId?: number;
  availableUsers: AdminUser[];
  onClose: () => void;
  onSuccess: (deletedUserName: string, transferredCount: number) => void;
}

export const DeleteUserModal: React.FC<DeleteUserModalProps> = ({
  user,
  currentAdminId,
  availableUsers,
  onClose,
  onSuccess,
}) => {
  const [transferUserId, setTransferUserId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeCallers, setActiveCallers] = useState<AdminUser[]>(availableUsers);

  useEffect(() => {
    apiClient
      .get<GetAdminUsersResponse>('/api/admin/users', {
        params: { status: 'active', limit: 100 },
      })
      .then((res) => {
        if (res.data?.data?.users) {
          setActiveCallers(res.data.data.users);
        }
      })
      .catch((err) => {
        console.error('Failed to load coordinators for reassignment:', err);
      });
  }, []);

  if (!user) return null;

  const isSelf = currentAdminId !== undefined && currentAdminId === user.id;
  const assignedCount = Number(user.total_assigned_contacts || 0);

  // Filter out the user being deleted
  const otherUsers = (activeCallers.length > 0 ? activeCallers : availableUsers).filter(
    (u) => u.id !== user.id && u.is_active
  );

  const handleDelete = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSelf) {
      setError('You cannot delete your own logged-in admin account.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const payload = {
        transferUserId: transferUserId ? parseInt(transferUserId, 10) : null,
      };

      const res = await apiClient.delete<{
        success: boolean;
        message: string;
        data: {
          deleted_user_id: number;
          transferred_contacts_count: number;
          transferred_followups_count: number;
        };
      }>(`/api/admin/users/${user.id}`, { data: payload });

      if (res.data?.success) {
        onSuccess(
          user.full_name,
          res.data.data.transferred_contacts_count || 0
        );
        onClose();
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to delete user.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 bg-[#FAF7F7]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center">
              <Trash2 size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Delete Coordinator
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Remove account and manage assigned contacts
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleDelete} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertTriangle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          {isSelf ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
              <p className="font-bold">Self-Deletion Prevented</p>
              <p>
                You are currently logged in as <strong className="text-amber-950">{user.full_name}</strong>. An administrator cannot delete their own account.
              </p>
            </div>
          ) : (
            <>
              {/* User Summary Card */}
              <div className="p-3.5 bg-gray-50 rounded-xl border border-gray-100 text-xs space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900 text-sm">{user.full_name}</span>
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-gray-200/70 text-gray-700">
                    {user.role}
                  </span>
                </div>
                <div className="text-gray-500">{user.email} • {user.mobile_number}</div>
                <div className="pt-1 border-t border-gray-200 flex items-center justify-between">
                  <span className="text-gray-500">Assigned Contacts:</span>
                  <span className="font-bold text-gray-800">
                    {assignedCount} {assignedCount === 1 ? 'contact' : 'contacts'}
                  </span>
                </div>
              </div>

              {/* Contact Transfer Selection */}
              {assignedCount > 0 ? (
                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-gray-800">
                    Transfer {assignedCount} Contacts To:
                  </label>
                  <div className="relative">
                    <select
                      value={transferUserId}
                      onChange={(e) => setTransferUserId(e.target.value)}
                      className="w-full h-10 px-3 rounded-lg border border-gray-200 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon"
                    >
                      <option value="">-- Leave Unassigned (Return to pool) --</option>
                      {otherUsers.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[11px] text-gray-500">
                    {transferUserId ? (
                      <span className="text-emerald-700 font-medium">
                        ✓ Contacts and pending callbacks will be transferred to this coordinator.
                      </span>
                    ) : (
                      'Contacts will be unassigned and available in the master database for future reassignment.'
                    )}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-gray-600">
                  Are you sure you want to delete <strong className="text-gray-900">{user.full_name}</strong>? This user has no assigned contacts.
                </p>
              )}
            </>
          )}

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {!isSelf && (
              <button
                type="submit"
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-red-600 hover:bg-red-700 shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
              >
                {loading && <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
                Confirm Delete
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};
