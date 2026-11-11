import React, { useState } from 'react';
import { X, CheckCircle2, AlertCircle } from 'lucide-react';
import apiClient from '../api/client';
import type { FollowUpItem } from '../types';
import { getErrorMessage } from '../utils/format';

interface CompleteFollowUpModalProps {
  followUp: FollowUpItem | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const CompleteFollowUpModal: React.FC<CompleteFollowUpModalProps> = ({
  followUp,
  onClose,
  onSuccess,
}) => {
  const [notes, setNotes] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!followUp) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      await apiClient.patch(`/api/follow-ups/${followUp.id}/complete`, {
        notes: notes.trim() || undefined,
      });
      onSuccess();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to complete follow-up.'));
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
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <CheckCircle2 size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-gray-900 leading-tight">
                Mark as Completed
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Contact: <strong className="text-gray-700">{followUp.contact_name}</strong>
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

          <p className="text-xs text-gray-600">
            Are you sure you want to resolve this follow-up call with{' '}
            <strong className="text-gray-900">{followUp.contact_name}</strong> ({followUp.contact_mobile})?
          </p>

          <div>
            <label htmlFor="completionNotes" className="block text-xs font-semibold text-gray-700 mb-1">
              Resolution Note (Optional)
            </label>
            <textarea
              id="completionNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Spoke with donor, committed to support scholarship program, sent bank details."
              className="w-full p-2.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600 transition-all resize-none"
            />
          </div>

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
              className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {loading && <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />}
              Confirm Completed
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

