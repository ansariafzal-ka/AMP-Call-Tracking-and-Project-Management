import React, { useState, useEffect } from 'react';
import {
  X,
  FolderKanban,
  AlertCircle,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import type { Project, CreateProjectPayload, UpdateProjectPayload } from '../types';

interface AdminProjectModalProps {
  isOpen: boolean;
  project: Project | null; // null = create, Project = edit
  onClose: () => void;
  onSuccess: (project: Project, mode: 'create' | 'edit') => void;
}

export const AdminProjectModal: React.FC<AdminProjectModalProps> = ({
  isOpen,
  project,
  onClose,
  onSuccess,
}) => {
  const isEdit = Boolean(project);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [status, setStatus] = useState<'active' | 'completed' | 'archived'>('active');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (project) {
      setName(project.name || '');
      setDescription(project.description || '');
      // Format ISO string to YYYY-MM-DD for date inputs
      const rawStart = project.start_date || project.startDate;
      const rawEnd = project.end_date || project.endDate;
      setStartDate(rawStart ? rawStart.substring(0, 10) : '');
      setEndDate(rawEnd ? rawEnd.substring(0, 10) : '');
      setStatus(project.status || 'active');
    } else {
      setName('');
      setDescription('');
      setStartDate('');
      setEndDate('');
      setStatus('active');
    }
    setError(null);
    setSubmitting(false);
  }, [project, isOpen]);

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

    const cleanName = name.trim();
    if (!cleanName) {
      setError('Project name is required.');
      return;
    }

    setSubmitting(true);
    try {
      if (!isEdit) {
        const payload: CreateProjectPayload = {
          name: cleanName,
          description: description.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          status,
        };

        const res = await apiClient.post('/api/admin/projects', payload);
        const newProject: Project = {
          id: res.data?.data?.id || Date.now(),
          name: cleanName,
          description: description.trim() || null,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          end_date: endDate ? new Date(endDate).toISOString() : null,
          status,
          total_contacts: 0,
          total_callers: 0,
          total_calls_made: 0,
          connected_calls: 0,
          created_at: new Date().toISOString(),
        };

        onSuccess(newProject, 'create');
        onClose();
      } else if (isEdit && project) {
        const payload: UpdateProjectPayload = {
          name: cleanName,
          description: description.trim() || undefined,
          startDate: startDate ? new Date(startDate).toISOString() : undefined,
          endDate: endDate ? new Date(endDate).toISOString() : undefined,
          status,
        };

        const res = await apiClient.patch(`/api/admin/projects/${project.id}`, payload);
        const updated = res.data?.data || {};

        const updatedProject: Project = {
          ...project,
          name: cleanName,
          description: description.trim() || null,
          start_date: startDate ? new Date(startDate).toISOString() : null,
          end_date: endDate ? new Date(endDate).toISOString() : null,
          status,
          ...updated,
        };

        onSuccess(updatedProject, 'edit');
        onClose();
      }
    } catch (err: any) {
      setError(getErrorMessage(err, 'Failed to save project.'));
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
              <FolderKanban size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text-main">
                {isEdit ? 'Edit Project Campaign' : 'Create New Project'}
              </h2>
              <p className="text-xs text-text-muted mt-0.5">
                {isEdit
                  ? `Configure campaign details for ${project?.name}`
                  : 'Set up campaign name, duration, and status'}
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Project Name */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Project Name <span className="text-red-600">*</span>
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Ramadan Zakat & Scholarship Drive 2026"
              className="w-full h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief description of the campaign objective and target audience..."
              className="w-full p-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition resize-none"
            />
          </div>

          {/* Start and End Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                Start Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-text-main mb-1">
                End Date
              </label>
              <div className="relative">
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-[40px] px-3 rounded-lg border border-gray-200 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition cursor-pointer"
                />
              </div>
            </div>
          </div>

          {/* Status Toggle */}
          <div>
            <label className="block text-xs font-semibold text-text-main mb-1">
              Project Status
            </label>
            <div className="grid grid-cols-3 gap-1 bg-gray-100 p-1 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setStatus('active')}
                className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                  status === 'active'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => setStatus('completed')}
                className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                  status === 'completed'
                    ? 'bg-blue-600 text-white shadow-2xs font-bold'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Completed
              </button>
              <button
                type="button"
                onClick={() => setStatus('archived')}
                className={`py-1.5 rounded-md transition-colors cursor-pointer text-center ${
                  status === 'archived'
                    ? 'bg-gray-700 text-white shadow-2xs font-bold'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Archived
              </button>
            </div>
          </div>

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
              disabled={submitting}
              className="px-6 h-[40px] rounded-lg bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
