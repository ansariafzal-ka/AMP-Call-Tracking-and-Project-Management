import React, { useState, useEffect, useCallback } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  X,
  Calendar,
  Users,
  CheckCircle,
  Edit2,
  UserPlus,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import apiClient from '../api/client';
import { getErrorMessage } from '../utils/format';
import { AdminProjectModal } from '../components/AdminProjectModal';
import { AssignProjectCallersModal } from '../components/AssignProjectCallersModal';
import type { Project, GetAdminProjectsResponse } from '../types';

const STATUS_FILTERS = ['All', 'Active', 'Completed', 'Archived'];

export const AdminProjectsPage: React.FC = () => {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filters & Pagination
  const [search, setSearch] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Modal states
  const [isProjectModalOpen, setIsProjectModalOpen] = useState<boolean>(false);
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null);

  const [isAssignModalOpen, setIsAssignModalOpen] = useState<boolean>(false);
  const [projectToAssign, setProjectToAssign] = useState<Project | null>(null);

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params: Record<string, any> = {
      page,
      limit,
    };

    if (search.trim()) params.search = search.trim();
    if (statusFilter !== 'All') params.status = statusFilter.toLowerCase();

    try {
      const res = await apiClient.get<GetAdminProjectsResponse>('/api/admin/projects', { params });
      if (res.data?.data) {
        setProjects(res.data.data.projects);
        setTotalPages(res.data.data.pagination.totalPages || 1);
        setTotalCount(res.data.data.pagination.total || 0);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
      setError(getErrorMessage(err, 'Failed to retrieve projects.'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, search, statusFilter]);

  useEffect(() => {
    fetchProjects();
  }, [fetchProjects]);

  // Open Create Project Modal
  const handleOpenCreate = () => {
    setProjectToEdit(null);
    setIsProjectModalOpen(true);
  };

  // Open Edit Project Modal
  const handleOpenEdit = (proj: Project) => {
    setProjectToEdit(proj);
    setIsProjectModalOpen(true);
  };

  // Open Assign Callers Modal
  const handleOpenAssignCallers = (proj: Project) => {
    setProjectToAssign(proj);
    setIsAssignModalOpen(true);
  };

  const handleProjectSuccess = (savedProject: Project, mode: 'create' | 'edit') => {
    if (mode === 'create') {
      setSuccessMessage(`Project "${savedProject.name}" created successfully!`);
      fetchProjects();
    } else {
      setSuccessMessage(`Project "${savedProject.name}" updated successfully!`);
      setProjects((prev) =>
        prev.map((p) => (p.id === savedProject.id ? { ...p, ...savedProject } : p))
      );
    }
  };

  const handleAssignCallersSuccess = (updatedCallersCount: number) => {
    if (projectToAssign) {
      setSuccessMessage(
        `Assigned callers updated for "${projectToAssign.name}" (${updatedCallersCount} coordinators)!`
      );
      fetchProjects();
    }
  };

  const formatDateDisplay = (isoDate: string | null | undefined) => {
    if (!isoDate) return 'Ongoing';
    try {
      const d = new Date(isoDate);
      if (isNaN(d.getTime())) return 'Ongoing';
      return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    } catch {
      return 'Ongoing';
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              AMP Projects Management
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-amber-800">
              Admin
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Create and manage calling campaigns, timelines, and coordinator teams
          </p>
        </div>

        <button
          type="button"
          onClick={handleOpenCreate}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-maroon text-white text-sm font-semibold hover:bg-maroon-hover transition-colors shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus size={16} />
          <span>Create Project</span>
        </button>
      </div>

      {/* Global Alerts */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
            <span>{successMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessMessage(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchProjects()}
            className="font-semibold text-red-900 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Status Filter Tabs & Search Bar */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        {/* Status Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto">
          {STATUS_FILTERS.map((s) => {
            const isActive = statusFilter === s;
            return (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setStatusFilter(s);
                  setPage(1);
                }}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'bg-maroon text-white shadow-2xs'
                    : 'bg-gray-100 text-text-main hover:bg-gray-200/70'
                }`}
              >
                {s}
              </button>
            );
          })}
        </div>

        {/* Search Input & Refresh */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-72">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search project name..."
              className="w-full h-[38px] pl-9 pr-3 rounded-lg border border-gray-200 bg-white text-xs text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold/40 focus:border-gold transition"
            />
          </div>

          <button
            type="button"
            onClick={() => fetchProjects()}
            title="Refresh projects"
            className="h-[38px] w-[38px] flex items-center justify-center rounded-lg border border-gray-200 text-text-muted hover:text-maroon hover:bg-maroon/5 transition-colors cursor-pointer shrink-0"
          >
            <RefreshCw size={15} className={loading ? 'animate-spin text-maroon' : ''} />
          </button>
        </div>
      </div>

      {/* Projects Cards List */}
      {loading && projects.length === 0 ? (
        <div className="p-12 text-center text-text-muted text-sm bg-card-bg rounded-xl shadow-sm border border-gray-100">
          Loading project campaigns...
        </div>
      ) : projects.length === 0 ? (
        <div className="p-12 text-center text-text-muted text-sm bg-card-bg rounded-xl shadow-sm border border-gray-100">
          No project campaigns found. Click "+ Create Project" to start your first campaign.
        </div>
      ) : (
        <div className="space-y-4">
          {projects.map((proj) => {
            const callers = parseInt(String(proj.total_callers || '0'), 10);
            const contacts = parseInt(String(proj.total_contacts || '0'), 10);
            const calls = parseInt(String(proj.total_calls_made || '0'), 10);
            const connected = parseInt(String(proj.connected_calls || '0'), 10);
            const reached = parseInt(String(proj.contacts_reached || '0'), 10);
            const percent = contacts > 0 ? Math.min(100, Math.round((reached / contacts) * 100)) : 0;
            const connectRate = calls > 0 ? Math.round((connected / calls) * 100) : 0;

            const startDateStr = proj.start_date || proj.startDate;
            const endDateStr = proj.end_date || proj.endDate;

            return (
              <div
                key={proj.id}
                className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 hover:border-gray-200 transition-all"
              >
                {/* Top Row: Title, Status, and Actions */}
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-base font-bold text-text-main truncate">
                        {proj.name}
                      </h2>
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize whitespace-nowrap ${
                          proj.status === 'active'
                            ? 'bg-emerald-100 text-emerald-800'
                            : proj.status === 'completed'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {proj.status}
                      </span>
                    </div>

                    {proj.description && (
                      <p className="text-xs text-text-muted leading-relaxed line-clamp-2">
                        {proj.description}
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-start sm:self-auto">
                    <button
                      type="button"
                      onClick={() => handleOpenAssignCallers(proj)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-text-main hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      <UserPlus size={13} className="text-maroon" />
                      <span>Assign Callers</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleOpenEdit(proj)}
                      title="Edit project"
                      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-maroon text-maroon hover:bg-maroon hover:text-white transition-colors cursor-pointer"
                    >
                      <Edit2 size={15} />
                    </button>
                  </div>
                </div>

                {/* Metrics & Timeline Row */}
                <div className="mt-4 pt-3.5 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  {/* Timeline */}
                  <div className="flex items-center gap-2 text-text-muted">
                    <Calendar size={14} className="text-maroon shrink-0" />
                    <span className="truncate font-medium text-text-main">
                      {formatDateDisplay(startDateStr)} &mdash; {formatDateDisplay(endDateStr)}
                    </span>
                  </div>

                  {/* Team Members */}
                  <div className="flex items-center gap-2 text-text-muted">
                    <Users size={14} className="text-maroon shrink-0" />
                    <span className="font-semibold text-text-main">
                      {callers} {callers === 1 ? 'Coordinator' : 'Coordinators'} assigned
                    </span>
                  </div>

                  {/* Connected Calls */}
                  <div className="flex items-center gap-2 text-text-muted">
                    <CheckCircle size={14} className="text-emerald-600 shrink-0" />
                    <span className="font-semibold text-text-main">
                      {connected} connected ({connectRate}% rate)
                    </span>
                  </div>
                </div>

                {/* Calling Progress Bar */}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-text-muted font-medium">
                      Campaign Outreach Progress
                    </span>
                    <span className="font-bold text-text-main">
                      {reached} / {contacts} contacts ({percent}%)
                    </span>
                  </div>
                  <div className="w-full bg-gray-100 h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        percent >= 100 ? 'bg-emerald-600' : 'bg-maroon'
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination Footer */}
      {totalCount > 0 && (
        <div className="px-4 sm:px-5 py-3.5 bg-card-bg rounded-xl shadow-sm border border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-muted">
          <div className="flex items-center gap-3">
            <span>
              Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex items-center gap-1.5">
              <label htmlFor="projects-page-size" className="text-xs">
                Rows:
              </label>
              <select
                id="projects-page-size"
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="h-8 px-2 rounded-md border border-gray-300 bg-white text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold cursor-pointer"
              >
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
            >
              <ChevronLeft size={15} />
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
            >
              Next
              <ChevronRight size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <AdminProjectModal
        isOpen={isProjectModalOpen}
        project={projectToEdit}
        onClose={() => setIsProjectModalOpen(false)}
        onSuccess={handleProjectSuccess}
      />

      <AssignProjectCallersModal
        isOpen={isAssignModalOpen}
        project={projectToAssign}
        onClose={() => setIsAssignModalOpen(false)}
        onSuccess={handleAssignCallersSuccess}
      />
    </div>
  );
};
