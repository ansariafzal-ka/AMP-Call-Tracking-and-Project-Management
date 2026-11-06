import React, { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import apiClient from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { ChangePasswordResponse } from '../types';
import { getErrorMessage } from '../utils/format';

export const SettingsPage: React.FC = () => {
  const { user } = useAuth();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(false);

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      setError('All password fields are required.');
      return;
    }

    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }

    if (newPassword === currentPassword) {
      setError('New password must be different from current password.');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setError('New passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiClient.patch<ChangePasswordResponse>(
        '/api/auth/change-password',
        {
          current_password: currentPassword,
          new_password: newPassword,
        }
      );

      if (res.data?.success) {
        setSuccess(true);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
      } else {
        setError(res.data?.error || 'Failed to update password.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update password.'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-bold text-text-main">Settings</h1>

      {/* Read-only Profile Card */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-bold text-text-main mb-4">Profile</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Full name
            </label>
            <input
              type="text"
              readOnly
              value={user?.fullName || user?.name || ''}
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-text-main cursor-default focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Email
            </label>
            <input
              type="email"
              readOnly
              value={user?.email || ''}
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-text-main cursor-default focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-text-muted mb-1.5">
              Mobile number
            </label>
            <input
              type="text"
              readOnly
              value={user?.mobileNumber || ''}
              className="w-full h-[44px] px-3.5 rounded-lg border border-gray-200 bg-gray-50 text-sm text-text-main cursor-default focus:outline-none"
            />
          </div>
        </div>
      </div>

      {/* Change Password Card */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-base font-bold text-text-main mb-4">
          Change password
        </h2>

        <form onSubmit={handlePasswordSubmit} className="space-y-4" noValidate>
          <div>
            <label
              htmlFor="current-password"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Current password
            </label>
            <div className="relative">
              <input
                id="current-password"
                type={showCurrent ? 'text' : 'password'}
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full h-[44px] pl-3.5 pr-10 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                aria-label={showCurrent ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
              >
                {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              New password
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showNew ? 'text' : 'password'}
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full h-[44px] pl-3.5 pr-10 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                aria-label={showNew ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
              >
                {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirm-new-password"
              className="block text-sm font-medium text-text-main mb-1.5"
            >
              Confirm new password
            </label>
            <div className="relative">
              <input
                id="confirm-new-password"
                type={showConfirm ? 'text' : 'password'}
                autoComplete="new-password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                className="w-full h-[44px] pl-3.5 pr-10 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          {error && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}

          {success && (
            <p className="text-sm text-emerald-700 font-medium" role="status">
              Password updated
            </p>
          )}

          <div className="pt-1">
            <button
              type="submit"
              disabled={submitting}
              className="h-[44px] px-5 rounded-lg bg-maroon hover:bg-maroon-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {submitting ? 'Updating...' : 'Update password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
