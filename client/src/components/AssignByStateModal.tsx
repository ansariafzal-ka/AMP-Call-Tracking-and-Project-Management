import React, { useState, useEffect } from 'react';
import {
  X,
  MapPin,
  Users,
  CheckCircle2,
  AlertCircle,
  Folder,
  Layers,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { AdminUser, Project } from '../types';

export interface StateSummaryItem {
  state: string;
  total_count: number;
  unassigned_count: number;
}

interface AssignByStateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (assignedCount: number, state: string, targetUserName: string) => void;
  coordinators: AdminUser[];
  projects: Project[];
}

export const AssignByStateModal: React.FC<AssignByStateModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  coordinators,
  projects,
}) => {
  const [statesSummary, setStatesSummary] = useState<StateSummaryItem[]>([]);
  const [loadingSummary, setLoadingSummary] = useState<boolean>(true);
  const [selectedState, setSelectedState] = useState<string>('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [unassignedOnly, setUnassignedOnly] = useState<boolean>(true);
  const [reassignFollowUps, setReassignFollowUps] = useState<boolean>(true);

  const [submitting, setSubmitting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const fetchSummary = async (projId?: string) => {
    setLoadingSummary(true);
    setError(null);
    try {
      const params: Record<string, any> = {};
      if (projId && projId !== 'all') {
        params.projectId = projId;
      }
      const res = await apiClient.get<{ success: boolean; data: StateSummaryItem[] }>(
        '/api/admin/contacts/states-summary',
        { params }
      );
      const list = res.data?.data || [];
      setStatesSummary(list);
      if (list.length > 0 && !selectedState) {
        setSelectedState(list[0].state);
      }
    } catch (err) {
      console.error('Failed to load states summary:', err);
      setError('Failed to load states summary. Please try again.');
    } finally {
      setLoadingSummary(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSelectedState('');
      setSelectedProjectId('all');
      setSelectedUserId('');
      setUnassignedOnly(true);
      setReassignFollowUps(true);
      fetchSummary();
    }
  }, [isOpen]);

  const handleProjectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newProj = e.target.value;
    setSelectedProjectId(newProj);
    fetchSummary(newProj);
  };

  const activeCoordinators = coordinators.filter(
    (u) => (u.role === 'caller' || u.role === 'admin') && u.is_active !== false
  );

  const currentStateItem = statesSummary.find(
    (s) => s.state.toLowerCase() === selectedState.toLowerCase()
  );

  const eligibleCount = currentStateItem
    ? unassignedOnly
      ? currentStateItem.unassigned_count
      : currentStateItem.total_count
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedState) {
      setError('Please select a state.');
      return;
    }
    if (!selectedUserId) {
      setError('Please select an assignee coordinator.');
      return;
    }
    if (eligibleCount <= 0) {
      setError(`No matching contacts found in ${selectedState} to assign.`);
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload: Record<string, any> = {
        state: selectedState,
        targetUserId: parseInt(selectedUserId, 10),
        unassignedOnly,
        reassignFollowUps,
      };

      if (selectedProjectId !== 'all') {
        payload.projectId = parseInt(selectedProjectId, 10);
      }

      const res = await apiClient.post<{
        success: boolean;
        message: string;
        data: { assignedCount: number };
      }>('/api/admin/contacts/assign-by-state', payload);

      const assignedCount = res.data?.data?.assignedCount || eligibleCount;
      const targetUser = coordinators.find((u) => String(u.id) === String(selectedUserId));
      const targetName = targetUser?.full_name || 'Selected Coordinator';

      onSuccess(assignedCount, selectedState, targetName);
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to assign contacts by state.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-xs p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-card-bg rounded-2xl shadow-xl border border-gray-100 w-full max-w-lg overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
              <MapPin size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                Assign Contacts by State
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                Bulk assign all contacts belonging to a specific state in one go
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="text-text-muted hover:text-text-main p-1.5 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <X size={18} />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5 text-red-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Optional Project Filter */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              Filter by Project (Optional)
            </label>
            <div className="relative">
              <Folder size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedProjectId}
                onChange={handleProjectChange}
                disabled={submitting}
                className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition cursor-pointer"
              >
                <option value="all">All Projects (Entire Directory)</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* State Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5 flex items-center justify-between">
              <span>Select State</span>
              {loadingSummary && (
                <span className="text-[10px] text-text-muted">Loading states...</span>
              )}
            </label>
            <div className="relative">
              <MapPin size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                disabled={submitting || loadingSummary || statesSummary.length === 0}
                className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition cursor-pointer"
              >
                {statesSummary.length === 0 ? (
                  <option value="">No states with contacts found</option>
                ) : (
                  statesSummary.map((s) => (
                    <option key={s.state} value={s.state}>
                      {s.state} ({s.unassigned_count} unassigned, {s.total_count} total)
                    </option>
                  ))
                )}
              </select>
            </div>
          </div>

          {/* Live Preview Card */}
          {selectedState && currentStateItem && (
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-50/70 to-amber-50/30 border border-amber-200/80 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2 text-amber-900 font-medium">
                <Layers size={16} className="text-amber-700 shrink-0" />
                <span>
                  Targeting <strong>{eligibleCount}</strong> {unassignedOnly ? 'unassigned' : ''} contact{eligibleCount === 1 ? '' : 's'} in {selectedState}
                </span>
              </div>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                {currentStateItem.total_count} in DB
              </span>
            </div>
          )}

          {/* Assignee Coordinator Selector */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1.5">
              Assign to Coordinator / Caller <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Users size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                disabled={submitting}
                className="w-full h-10 pl-9 pr-3 text-xs bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-maroon/30 focus:border-maroon transition cursor-pointer"
              >
                <option value="">-- Choose Coordinator --</option>
                {activeCoordinators.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name} ({u.email}) - {u.role === 'admin' ? 'Admin' : 'Caller'}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Options */}
          <div className="space-y-2 pt-1 border-t border-gray-100">
            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={unassignedOnly}
                onChange={(e) => setUnassignedOnly(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 rounded text-maroon focus:ring-maroon cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-text-main">
                  Only assign unassigned contacts
                </span>
                <p className="text-text-muted mt-0.5 text-[11px]">
                  Preserves existing caller assignments in {selectedState || 'this state'}.
                </p>
              </div>
            </label>

            <label className="flex items-start gap-2.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={reassignFollowUps}
                onChange={(e) => setReassignFollowUps(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 rounded text-maroon focus:ring-maroon cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-text-main">
                  Reassign pending follow-ups
                </span>
                <p className="text-text-muted mt-0.5 text-[11px]">
                  Transfers active follow-up tasks to the new assignee.
                </p>
              </div>
            </label>
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-xs font-semibold text-text-muted hover:text-text-main bg-gray-100 hover:bg-gray-200/70 rounded-xl transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || !selectedState || !selectedUserId || eligibleCount <= 0}
              className="px-5 py-2 text-xs font-bold text-white bg-maroon hover:bg-maroon-dark disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              {submitting ? (
                <span>Assigning...</span>
              ) : (
                <>
                  <CheckCircle2 size={14} />
                  <span>
                    Assign {eligibleCount > 0 ? `${eligibleCount} ` : ''}Contacts
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
