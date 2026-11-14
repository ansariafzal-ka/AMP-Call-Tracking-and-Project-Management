import React, { useState, useEffect } from 'react';
import {
  X,
  FileSpreadsheet,
  Calendar,
  User,
  Users,
  CheckCircle2,
  AlertCircle,
  Folder,
  ArrowRight,
  Filter,
  RefreshCw,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { ContactBatch, AdminUser } from '../types';

interface UploadHistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectBatch: (batchId: number) => void;
  coordinators: AdminUser[];
  onBatchAssigned?: () => void;
}

export const UploadHistoryModal: React.FC<UploadHistoryModalProps> = ({
  isOpen,
  onClose,
  onSelectBatch,
  coordinators,
  onBatchAssigned,
}) => {
  const [batches, setBatches] = useState<ContactBatch[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Assign state
  const [assigningBatchId, setAssigningBatchId] = useState<number | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(true);
  const [submittingAssign, setSubmittingAssign] = useState<boolean>(false);

  const fetchBatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get<{ success: boolean; data: ContactBatch[] }>('/api/admin/contacts/batches');
      setBatches(res.data?.data || []);
    } catch (err) {
      console.error('Failed to load batches:', err);
      setError(getErrorMessage(err, 'Failed to load upload history.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchBatches();
      setAssigningBatchId(null);
      setSelectedUserId('');
      setSuccessMessage(null);
    }
  }, [isOpen]);

  const handleAssignBatch = async (batchId: number) => {
    if (!selectedUserId) {
      alert('Please select a coordinator to assign this batch.');
      return;
    }

    setSubmittingAssign(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiClient.post('/api/admin/contacts/batches/assign', {
        batchId,
        targetUserId: parseInt(selectedUserId, 10),
        unassignedOnly,
        reassignFollowUps: true,
      });

      const count = res.data?.data?.assignedCount || 0;
      setSuccessMessage(`Successfully assigned ${count} contacts from Batch #${batchId}!`);
      setAssigningBatchId(null);
      setSelectedUserId('');
      fetchBatches();
      if (onBatchAssigned) {
        onBatchAssigned();
      }
    } catch (err) {
      console.error('Failed to assign batch:', err);
      setError(getErrorMessage(err, 'Failed to assign batch to coordinator.'));
    } finally {
      setSubmittingAssign(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-200">
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden border border-gray-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-5 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-gray-50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
              <FileSpreadsheet size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold text-gray-900">Upload History & Batches</h2>
              <p className="text-xs text-gray-500">
                Track all bulk contact imports, audit dates, and assign entire batches
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={fetchBatches}
              disabled={loading}
              title="Refresh list"
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
            >
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-800 text-xs flex items-center gap-2">
            <AlertCircle size={16} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1">
          {loading && batches.length === 0 ? (
            <div className="py-16 text-center text-gray-500 text-sm">
              <RefreshCw size={24} className="animate-spin mx-auto mb-2 text-maroon" />
              Loading upload history...
            </div>
          ) : batches.length === 0 ? (
            <div className="py-16 text-center text-gray-500">
              <FileSpreadsheet size={40} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-gray-700">No upload batches yet</p>
              <p className="text-xs text-gray-400 mt-1">
                When you import CSV contact lists, each upload will appear here as a recorded batch.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((batch) => {
                const isAssigning = assigningBatchId === batch.id;
                const uploadDate = new Date(batch.uploaded_at);

                return (
                  <div
                    key={batch.id}
                    className="p-4 rounded-xl border border-gray-200 bg-white hover:border-gray-300 transition-all shadow-2xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      {/* Left: Batch Details */}
                      <div className="space-y-1.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-maroon/10 text-maroon">
                            Batch #{batch.id}
                          </span>
                          <span className="font-semibold text-gray-900 text-sm truncate" title={batch.file_name}>
                            {batch.file_name}
                          </span>
                          {batch.project_name && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                              <Folder size={11} />
                              {batch.project_name}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-4 text-xs text-gray-500 flex-wrap">
                          <span className="inline-flex items-center gap-1">
                            <Calendar size={13} className="text-gray-400" />
                            {uploadDate.toLocaleDateString('en-IN', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}{' '}
                            at{' '}
                            {uploadDate.toLocaleTimeString('en-IN', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                          {batch.uploaded_by_name && (
                            <span className="inline-flex items-center gap-1">
                              <User size={13} className="text-gray-400" />
                              {batch.uploaded_by_name}
                            </span>
                          )}
                        </div>

                        {/* Counts Breakdown Pills */}
                        <div className="flex items-center gap-2 text-xs pt-1 flex-wrap">
                          <span className="font-semibold text-gray-800">
                            {batch.total_rows || batch.total_contacts || 0} Total Rows
                          </span>
                          <span className="text-gray-300">•</span>
                          <span className="text-emerald-700 font-medium">
                            {batch.imported_count || 0} New
                          </span>
                          {batch.merged_count > 0 && (
                            <>
                              <span className="text-gray-300">•</span>
                              <span className="text-amber-700 font-medium">
                                {batch.merged_count} Merged
                              </span>
                            </>
                          )}
                          <span className="text-gray-300">•</span>
                          <span className="text-gray-600">
                            {batch.assigned_count || 0} Assigned / {batch.unassigned_count || 0} Unassigned
                          </span>
                        </div>
                      </div>

                      {/* Right: Actions */}
                      <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
                        <button
                          type="button"
                          onClick={() => {
                            onSelectBatch(batch.id);
                            onClose();
                          }}
                          className="h-[36px] px-3 rounded-lg border border-gray-200 bg-gray-50 text-xs font-semibold text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition flex items-center gap-1.5 cursor-pointer"
                        >
                          <Filter size={13} className="text-gray-500" />
                          <span>View Contacts</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (isAssigning) {
                              setAssigningBatchId(null);
                            } else {
                              setAssigningBatchId(batch.id);
                              setSelectedUserId('');
                            }
                          }}
                          className={`h-[36px] px-3.5 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                            isAssigning
                              ? 'bg-gray-200 text-gray-800'
                              : 'bg-maroon text-white hover:bg-maroon-hover'
                          }`}
                        >
                          <Users size={14} />
                          <span>{isAssigning ? 'Cancel' : 'Assign Batch'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Inline Assign Box */}
                    {isAssigning && (
                      <div className="mt-4 pt-4 border-t border-gray-100 bg-gray-50/70 -mx-4 -mb-4 p-4 rounded-b-xl animate-in slide-in-from-top-2 duration-150">
                        <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-1">
                            <label className="text-xs font-semibold text-gray-700 shrink-0">
                              Assign Batch #{batch.id} to:
                            </label>
                            <select
                              value={selectedUserId}
                              onChange={(e) => setSelectedUserId(e.target.value)}
                              className="h-[36px] px-3 rounded-lg border border-gray-300 bg-white text-xs font-medium text-gray-800 focus:outline-none focus:ring-2 focus:ring-maroon/30 cursor-pointer min-w-[200px]"
                            >
                              <option value="">Select Coordinator...</option>
                              {coordinators.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.full_name} ({c.email})
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={unassignedOnly}
                                onChange={(e) => setUnassignedOnly(e.target.checked)}
                                className="rounded text-maroon focus:ring-maroon"
                              />
                              <span>Only unassigned contacts</span>
                            </label>
                          </div>

                          <button
                            type="button"
                            disabled={!selectedUserId || submittingAssign}
                            onClick={() => handleAssignBatch(batch.id)}
                            className="h-[36px] px-4 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                          >
                            {submittingAssign ? (
                              'Assigning...'
                            ) : (
                              <>
                                <span>Confirm Assignment</span>
                                <ArrowRight size={13} />
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-gray-100 flex items-center justify-between bg-gray-50 text-xs text-gray-500">
          <span>{batches.length} total upload batch(es) recorded</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-gray-300 bg-white text-xs font-semibold text-gray-700 hover:bg-gray-100 transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

