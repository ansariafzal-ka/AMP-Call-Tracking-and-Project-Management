import React, { useState, useEffect } from 'react';
import apiClient from '../api/client';
import type { Call, CallOutcome, UpdateCallResponse } from '../types';
import {
  formatDateTime,
  toDateTimeLocalValue,
  toServerDateTime,
  getErrorMessage,
} from '../utils/format';

interface UpdateCallModalProps {
  call: Call | null;
  onClose: () => void;
  onSuccess: (updatedCall: Call) => void;
}

const OUTCOME_RADIO_OPTIONS: { value: Exclude<CallOutcome, null>; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'not_interested', label: 'Not interested' },
  { value: 'unanswered', label: 'Unanswered' },
  { value: 'follow_up_required', label: 'Follow-up required' },
];

export const UpdateCallModal: React.FC<UpdateCallModalProps> = ({
  call,
  onClose,
  onSuccess,
}) => {
  const [note, setNote] = useState('');
  const [outcome, setOutcome] = useState<CallOutcome>(null);
  const [followUpLocal, setFollowUpLocal] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (call) {
      setNote(call.purpose || '');
      setOutcome(call.outcome || null);
      setFollowUpLocal(toDateTimeLocalValue(call.follow_up_date));
      setError(null);
      setSaving(false);
    }
  }, [call]);

  useEffect(() => {
    if (!call) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [call, saving, onClose]);

  if (!call) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!outcome) {
      setError('Please select an outcome.');
      return;
    }

    if (outcome === 'follow_up_required' && !followUpLocal.trim()) {
      setError('Please select a follow-up date and time.');
      return;
    }

    const trimmedNote = note.trim();
    const followUpFormatted =
      outcome === 'follow_up_required' ? toServerDateTime(followUpLocal) : null;

    setSaving(true);
    try {
      const res = await apiClient.patch<UpdateCallResponse>(`/api/calls/${call.id}`, {
        purpose: trimmedNote ? trimmedNote : null,
        outcome,
        follow_up_date: followUpFormatted,
      });

      if (res.data?.call) {
        onSuccess(res.data.call);
        onClose();
      } else {
        setError(res.data?.message || 'Failed to update call.');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to update call.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="w-full max-w-md bg-card-bg rounded-xl shadow-lg border border-gray-100 p-6"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="update-call-modal-title"
      >
        <div className="mb-5">
          <h2
            id="update-call-modal-title"
            className="text-lg font-bold text-text-main"
          >
            Update call
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            {call.contact_number} &bull; {formatDateTime(call.called_at)}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {/* Note Textarea */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label
                htmlFor="update-call-note"
                className="text-sm font-medium text-text-main"
              >
                Note
              </label>
              <span className="text-xs text-text-muted">{note.length}/255</span>
            </div>
            <textarea
              id="update-call-note"
              rows={3}
              maxLength={255}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add discussion notes..."
              className="w-full p-3 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition resize-none"
            />
          </div>

          {/* Outcome Radio Rows */}
          <div>
            <div className="text-sm font-medium text-text-main mb-2">
              Outcome <span className="text-red-600">*</span>
            </div>
            <div className="space-y-2">
              {OUTCOME_RADIO_OPTIONS.map((opt) => {
                const isSelected = outcome === opt.value;
                return (
                  <label
                    key={opt.value}
                    className={`flex items-center justify-between px-3.5 h-[44px] rounded-lg border text-sm font-medium cursor-pointer transition ${
                      isSelected
                        ? 'border-maroon bg-maroon/5 text-maroon'
                        : 'border-gray-200 bg-white text-text-main hover:border-gray-300'
                    }`}
                  >
                    <span>{opt.label}</span>
                    <input
                      type="radio"
                      name="call-outcome"
                      value={opt.value}
                      checked={isSelected}
                      onChange={() => setOutcome(opt.value)}
                      className="h-4 w-4 accent-maroon cursor-pointer"
                    />
                  </label>
                );
              })}
            </div>
          </div>

          {/* Mandatory Follow-up Date & Time when Follow-up required is selected */}
          {outcome === 'follow_up_required' && (
            <div>
              <label
                htmlFor="update-call-followup"
                className="block text-sm font-medium text-text-main mb-1.5"
              >
                Follow-up date &amp; time <span className="text-red-600">*</span>
              </label>
              <input
                id="update-call-followup"
                type="datetime-local"
                value={followUpLocal}
                onChange={(e) => setFollowUpLocal(e.target.value)}
                className="w-full h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
            </div>
          )}

          {error && (
            <p className="text-sm text-red-600 font-medium" role="alert">
              {error}
            </p>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="h-[44px] px-4 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-60 text-sm font-medium text-text-main transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-[44px] px-5 rounded-lg bg-maroon hover:bg-maroon-hover disabled:opacity-60 disabled:cursor-not-allowed text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
