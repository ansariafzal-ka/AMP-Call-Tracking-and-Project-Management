import React, { useState, useEffect } from 'react';
import {
  X,
  Target,
  Phone,
  Mail,
  Eye,
  EyeOff,
  AlertCircle,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type {
  AdminUser,
  CreateAdminUserPayload,
  UpdateAdminUserPayload,
} from '../types';

interface AdminUserModalProps {
  isOpen: boolean;
  user: AdminUser | null; // null = create mode, user = edit mode
  onClose: () => void;
  onSuccess: (savedUser: AdminUser, mode: 'create' | 'edit') => void;
}

export const AdminUserModal: React.FC<AdminUserModalProps> = ({
  isOpen,
  user,
  onClose,
  onSuccess,
}) => {
  const isEdit = Boolean(user);

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<'admin' | 'caller'>('caller');
  const [isActive, setIsActive] = useState(true);
  const [dailyTarget, setDailyTarget] = useState(50);
  const [weeklyTarget, setWeeklyTarget] = useState(250);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name || '');
      setEmail(user.email || '');
      setMobileNumber(user.mobile_number || '');
      setPassword('');
      setRole(user.role || 'caller');
      setIsActive(user.is_active ?? true);
      setDailyTarget(user.daily_target || 50);
      setWeeklyTarget(user.weekly_target || 250);
    } else {
      setFullName('');
      setEmail('');
      setMobileNumber('');
      setPassword('');
      setRole('caller');
      setIsActive(true);
      setDailyTarget(50);
      setWeeklyTarget(250);
    }
    setShowPassword(false);
    setError(null);
    setSubmitting(false);
  }, [user, isOpen]);

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

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanName = fullName.trim();
    const cleanMobile = mobileNumber.trim();

    if (!cleanName || !cleanMobile) {
      setError('Full Name and Mobile Number are required.');
      return;
    }

    if (!isEdit) {
      const cleanEmail = email.trim().toLowerCase();
      if (!cleanEmail || !password) {
        setError('Email and Temporary Password are required for new accounts.');
        return;
      }
      if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
      }

      setSubmitting(true);
      try {
        const payload: CreateAdminUserPayload = {
          fullName: cleanName,
          email: cleanEmail,
          mobileNumber: cleanMobile,
          password,
          role,
          dailyTarget: Number(dailyTarget) || 50,
          weeklyTarget: Number(weeklyTarget) || 250,
        };

        const res = await apiClient.post('/api/admin/users', payload);
        const createdUser: AdminUser = {
          id: res.data?.data?.id || Date.now(),
          full_name: cleanName,
          email: cleanEmail,
          mobile_number: cleanMobile,
          role,
          is_active: true,
          daily_target: Number(dailyTarget) || 50,
          weekly_target: Number(weeklyTarget) || 250,
          total_assigned_contacts: 0,
          calls_made_today: 0,
          created_at: new Date().toISOString(),
        };

        onSuccess(createdUser, 'create');
        onClose();
      } catch (err: any) {
        setError(getErrorMessage(err, 'Failed to create user.'));
      } finally {
        setSubmitting(false);
      }
    } else if (isEdit && user) {
      setSubmitting(true);
      try {
        const payload: UpdateAdminUserPayload = {
          fullName: cleanName,
          mobileNumber: cleanMobile,
          role,
          isActive,
          dailyTarget: Number(dailyTarget) || 50,
          weeklyTarget: Number(weeklyTarget) || 250,
        };

        const res = await apiClient.patch(`/api/admin/users/${user.id}`, payload);
        const updated = res.data?.data;
        const updatedUser: AdminUser = {
          ...user,
          full_name: cleanName,
          mobile_number: cleanMobile,
          role,
          is_active: isActive,
          daily_target: Number(dailyTarget) || 50,
          weekly_target: Number(weeklyTarget) || 250,
          ...(updated || {}),
        };

        onSuccess(updatedUser, 'edit');
        onClose();
      } catch (err: any) {
        setError(getErrorMessage(err, 'Failed to update user.'));
      } finally {
        setSubmitting(false);
      }
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
              <Target size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                {isEdit ? 'Edit User & Targets' : 'Add New Coordinator'}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                {isEdit
                  ? `Configure account details and targets for ${user?.full_name}`
                  : 'Create account and set daily & weekly calling targets'}
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
        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[calc(85vh-130px)] overflow-y-auto">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Full Name */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Full Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Zaid Shaikh"
              className="w-full h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
          </div>

          {/* Mobile & Email Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Mobile Number <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <Phone
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="text"
                  required
                  value={mobileNumber}
                  onChange={(e) => setMobileNumber(e.target.value)}
                  placeholder="e.g. 9811223344"
                  className="w-full h-[40px] pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Email Address {!isEdit && <span className="text-red-600">*</span>}
              </label>
              <div className="relative">
                <Mail
                  size={15}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
                />
                <input
                  type="email"
                  required={!isEdit}
                  disabled={isEdit}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. zaid@example.com"
                  className={`w-full h-[40px] pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition ${
                    isEdit ? 'bg-gray-100 text-text-muted cursor-not-allowed' : ''
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Temporary Password (Create Mode only) */}
          {!isEdit && (
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Temporary Password <span className="text-red-600">*</span>
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full h-[40px] px-3 pr-10 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-main cursor-pointer"
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {/* Role & Status Toggles */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">Role</label>
              <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setRole('caller')}
                  className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                    role === 'caller'
                      ? 'bg-white text-text-main shadow-2xs font-bold'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Caller
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                    role === 'admin'
                      ? 'bg-maroon text-white shadow-2xs font-bold'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Admin
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Account Status
              </label>
              <div className="grid grid-cols-2 gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
                <button
                  type="button"
                  onClick={() => setIsActive(true)}
                  className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                    isActive
                      ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Active
                </button>
                <button
                  type="button"
                  onClick={() => setIsActive(false)}
                  className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                    !isActive
                      ? 'bg-gray-700 text-white shadow-2xs font-bold'
                      : 'text-text-muted hover:text-text-main'
                  }`}
                >
                  Inactive
                </button>
              </div>
            </div>
          </div>

          {/* Calling Targets Container */}
          <div className="bg-amber-50/60 rounded-xl border border-amber-200/70 p-4 space-y-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Target size={15} />
              <span>Calling Targets</span>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-text-main mb-1">
                  Daily Target
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={500}
                    value={dailyTarget}
                    onChange={(e) => setDailyTarget(parseInt(e.target.value, 10) || 0)}
                    className="w-full h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                    calls
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-text-main mb-1">
                  Weekly Target
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min={1}
                    max={2500}
                    value={weeklyTarget}
                    onChange={(e) => setWeeklyTarget(parseInt(e.target.value, 10) || 0)}
                    className="w-full h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-sm font-semibold text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40"
                  />
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted">
                    calls
                  </span>
                </div>
              </div>
            </div>

            <p className="text-[11px] text-amber-800/80 leading-snug">
              These targets feed directly into progress bars on the coordinator and admin dashboards.
            </p>
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-2 flex items-center justify-end gap-2.5 border-t border-gray-100">
            <button
              type="button"
              disabled={submitting}
              onClick={onClose}
              className="px-4 h-[42px] rounded-lg border border-gray-200 text-sm font-semibold text-text-main hover:bg-gray-50 transition-colors cursor-pointer"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="px-6 h-[42px] rounded-lg bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

