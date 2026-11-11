import React, { useState } from 'react';
import { X, CalendarClock, AlertCircle } from 'lucide-react';
import apiClient from '../api/client';
import type { FollowUpItem } from '../types';
import { formatDateTime, getErrorMessage } from '../utils/format';

interface RescheduleFollowUpModalProps {
  followUp: FollowUpItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const RescheduleFollowUpModal: React.FC<RescheduleFollowUpModalProps> = ({
  followUp,
  onClose,
  onSuccess,
}) => {
  // Default to tomorrow 10:00 AM
  const getDefaultDateTime = () => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(10, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const [dueAt, setDueAt] = useState<string>(getDefaultDateTime());
  const [notes, setNotes] = useState<string>(followUp?.notes || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!followUp) return null;

  const setPreset = (daysFromNow: number, hour = 10) => {
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    d.setHours(hour, 0, 0, 0);
    const pad = (n: number) => String(n).padStart(2, '0');
    setDueAt(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dueAt) {
      setError('Please select a new follow-up date and time.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      await apiClient.patch(`/api/follow-ups/${followUp.id}/reschedule`, {
        newDueAt: new Date(dueAt).toISOString(),
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to reschedule follow-up.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/45 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-gray-100 bg-[#FAF7F7]">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center">
              <CalendarClock size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Reschedule Follow-up
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Contact: <strong className="text-gray-700">{followUp.contact_name}</strong> ({followUp.contact_mobile})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center gap-2 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0 text-red-500" />
              <span>{error}</span>
            </div>
          )}

          <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-xs text-gray-600 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-gray-500">Currently Scheduled:</span>
              <span className="font-semibold text-gray-800">{formatDateTime(followUp.due_at)}</span>
            </div>
            {followUp.notes && (
              <div className="pt-1 border-t border-gray-200 text-gray-600">
                <span className="text-gray-400">Previous Note:</span> {followUp.notes}
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
              Quick Shortcuts
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPreset(1, 10)}
                className="px-2.5 py-1 text-xs rounded-lg font-medium bg-gray-100 hover:bg-maroon/10 hover:text-maroon text-gray-700 border border-gray-200 transition-colors"
              >
                Tomorrow 10 AM
              </button>
              <button
                type="button"
                onClick={() => setPreset(2, 10)}
                className="px-2.5 py-1 text-xs rounded-lg font-medium bg-gray-100 hover:bg-maroon/10 hover:text-maroon text-gray-700 border border-gray-200 transition-colors"
              >
                In 2 Days
              </button>
              <button
                type="button"
                onClick={() => setPreset(7, 10)}
                className="px-2.5 py-1 text-xs rounded-lg font-medium bg-gray-100 hover:bg-maroon/10 hover:text-maroon text-gray-700 border border-gray-200 transition-colors"
              >
                Next Week
              </button>
            </div>
          </div>

          {/* Date & Time Picker */}
          <div>
            <label htmlFor="dueAt" className="block text-xs font-semibold text-gray-700 mb-1">
              New Date & Time <span className="text-red-500">*</span>
            </label>
            <input
              id="dueAt"
              type="datetime-local"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              required
              className="w-full h-10 px-3 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon transition-all"
            />
          </div>

          {/* Reschedule Notes */}
          <div>
            <label htmlFor="notes" className="block text-xs font-semibold text-gray-700 mb-1">
              Update Notes (Optional)
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Call back after 4 PM, donor asked for updated project proposal"
              className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon transition-all resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-maroon hover:bg-[#600f1c] shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading && <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Save New Schedule
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

