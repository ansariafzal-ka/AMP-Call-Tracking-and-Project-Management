import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  RotateCcw,
  PhoneCall,
  PhoneIncoming,
  CheckCircle2,
  Clock,
  AlertCircle,
  Copy,
  Check,
  FileSpreadsheet,
  FolderKanban,
  User,
  History,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { formatDuration, formatDateTime, getErrorMessage } from '../utils/format';
import { ContactHistoryModal } from '../components/ContactHistoryModal';
import type {
  AdminCallItem,
  GetAdminCallsResponse,
  AdminUser,
  GetAdminUsersResponse,
  Project,
} from '../types';

export const AdminCallsPage: React.FC = () => {
  const [calls, setCalls] = useState<AdminCallItem[]>([]);
  const [coordinators, setCoordinators] = useState<AdminUser[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [summary, setSummary] = useState({
    totalCalls: 0,
    connectedCalls: 0,
    connectedRate: 0,
    totalDurationSeconds: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [selectedHistoryContactId, setSelectedHistoryContactId] = useState<number | null>(null);

  // Pagination
  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  // Filters
  const [searchInput, setSearchInput] = useState<string>('');
  const [selectedUserId, setSelectedUserId] = useState<string>('all');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [dateRange, setDateRange] = useState<'all' | 'today' | '7days' | '30days'>('all');

  // Load dropdown lists (Coordinators & Projects)
  useEffect(() => {
    apiClient
      .get<GetAdminUsersResponse>('/api/admin/users', { params: { limit: 100 } })
      .then((res) => {
        if (res.data?.data?.users) {
          setCoordinators(res.data.data.users.filter((u) => u.role === 'caller'));
        }
      })
      .catch(() => {});

    apiClient
      .get<{ success: boolean; data: { projects: Project[] } }>('/api/admin/projects', {
        params: { limit: 100 },
      })
      .then((res) => {
        if (res.data?.data?.projects) {
          setProjects(res.data.data.projects);
        }
      })
      .catch(() => {});
  }, []);

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params: Record<string, string | number> = {
        page,
        limit,
      };

      if (searchInput.trim()) params.search = searchInput.trim();
      if (selectedUserId !== 'all') params.userId = selectedUserId;
      if (selectedProjectId !== 'all') params.projectId = selectedProjectId;
      if (selectedOutcome !== 'all') params.outcome = selectedOutcome;
      if (selectedStatus !== 'all') params.status = selectedStatus;

      const now = new Date();
      if (dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.startDate = today.toISOString();
      } else if (dateRange === '7days') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.startDate = past7.toISOString();
      } else if (dateRange === '30days') {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.startDate = past30.toISOString();
      }

      const res = await apiClient.get<GetAdminCallsResponse>('/api/admin/calls', { params });
      if (res.data?.success && res.data.data) {
        setCalls(res.data.data.calls || []);
        setSummary(res.data.data.summary);
        const p = res.data.data.pagination;
        setTotalPages(p?.totalPages || 1);
        setTotalCount(p?.total || 0);
      }
    } catch (err) {
      console.error('Failed to fetch call logs:', err);
      setError(getErrorMessage(err, 'Failed to retrieve call logs.'));
    } finally {
      setLoading(false);
    }
  }, [
    page,
    limit,
    searchInput,
    selectedUserId,
    selectedProjectId,
    selectedOutcome,
    selectedStatus,
    dateRange,
  ]);

  useEffect(() => {
    fetchCalls();
  }, [fetchCalls]);

  const handleCopyPhone = (id: number, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);

      const params: Record<string, string | number> = {
        page: 1,
        limit: 10000,
      };

      if (searchInput.trim()) params.search = searchInput.trim();
      if (selectedUserId !== 'all') params.userId = selectedUserId;
      if (selectedProjectId !== 'all') params.projectId = selectedProjectId;
      if (selectedOutcome !== 'all') params.outcome = selectedOutcome;
      if (selectedStatus !== 'all') params.status = selectedStatus;

      const now = new Date();
      if (dateRange === 'today') {
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        params.startDate = today.toISOString();
      } else if (dateRange === '7days') {
        const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        params.startDate = past7.toISOString();
      } else if (dateRange === '30days') {
        const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        params.startDate = past30.toISOString();
      }

      const res = await apiClient.get<GetAdminCallsResponse>('/api/admin/calls', { params });
      const dataToExport = res.data?.data?.calls || [];

      if (dataToExport.length === 0) {
        alert('No call records available to export for the selected filters.');
        return;
      }

      const rows = dataToExport.map((c) => {
        let callDate = '';
        let callTime = '';
        if (c.called_at) {
          const d = new Date(c.called_at);
          if (!isNaN(d.getTime())) {
            callDate = d.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            callTime = d.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
        }

        let followUpDate = '';
        let followUpTime = '';
        if (c.follow_up_date) {
          const fd = new Date(c.follow_up_date);
          if (!isNaN(fd.getTime())) {
            followUpDate = fd.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            followUpTime = fd.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
        }

        return {
          'Call ID': c.id,
          'Contact Name': c.contact_name,
          'Contact Phone': String(c.contact_number || ''),
          'Coordinator Name': c.caller_name,
          'Coordinator Email': c.caller_email,
          'Project / Campaign': c.project_name || 'General / Unassigned',
          'Duration': formatDuration(c.duration_seconds || 0),
          'Duration (Seconds)': c.duration_seconds,
          'Call Status': c.status === 'answered' ? 'Answered' : 'Not Answered',
          'Call Outcome': c.outcome ? c.outcome.replace(/_/g, ' ') : 'Unspecified',
          'Follow-up Status': c.follow_up_status ? c.follow_up_status.toUpperCase() : '-',
          'Follow-up Date': followUpDate || '-',
          'Follow-up Time': followUpTime || '-',
          'Discussion Notes': c.purpose || '',
          'Call Date': callDate,
          'Call Time': callTime,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(rows);

      // Auto-fit column widths
      const headers = Object.keys(rows[0] || {});
      worksheet['!cols'] = headers.map((header) => {
        const maxLen = Math.max(
          header.length,
          ...rows.map((r) => String((r as any)[header] || '').length)
        );
        return { wch: Math.min(Math.max(maxLen + 2, 12), 35) };
      });

      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Team Call Logs');

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AMP_Team_Call_Logs_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Failed to export call logs:', err);
      alert('Failed to export call logs to Excel.');
    } finally {
      setExporting(false);
    }
  };

  const renderOutcomeBadge = (
    outcome: string | null | undefined,
    followUpStatus?: string | null
  ) => {
    if (!outcome) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-gray-100 text-gray-600">
          Unspecified
        </span>
      );
    }

    const lower = outcome.toLowerCase();
    if (lower === 'interested') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 whitespace-nowrap">
          Interested
        </span>
      );
    }
    if (lower === 'follow_up_required') {
      if (followUpStatus === 'completed') {
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 whitespace-nowrap">
            <CheckCircle2 size={12} className="text-emerald-600" />
            Follow-up done
          </span>
        );
      }
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">
          Follow-up
        </span>
      );
    }
    if (lower === 'not_interested') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800 whitespace-nowrap">
          Not Interested
        </span>
      );
    }
    if (lower === 'unanswered') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 whitespace-nowrap">
          Unanswered
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 capitalize whitespace-nowrap">
        {outcome.replace(/_/g, ' ')}
      </span>
    );
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Team Call Logs
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-amber-800">
              Admin
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Real-time chronological master history of calls placed across all coordinators and campaigns
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Excel Export Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || totalCount === 0}
            title="Download Team Call Logs in Excel"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={15} className="text-emerald-600" />
            <span>{exporting ? 'Exporting...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchCalls()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* Mini KPI Cards for Filtered Results */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-card-bg rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
            <PhoneCall size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main leading-tight">
              {summary.totalCalls}
            </div>
            <div className="text-xs text-text-muted mt-0.5">Calls in current view</div>
          </div>
        </div>

        <div className="bg-card-bg rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main leading-tight">
              {summary.connectedRate}%
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              Connected rate ({summary.connectedCalls} connected)
            </div>
          </div>
        </div>

        <div className="bg-card-bg rounded-xl p-4 shadow-sm border border-gray-100 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-2xl font-bold text-text-main leading-tight">
              {formatDuration(summary.totalDurationSeconds)}
            </div>
            <div className="text-xs text-text-muted mt-0.5">Total team talk time</div>
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
          {/* Search Box */}
          <div className="relative flex-1 max-w-md">
            <Search
              size={16}
              className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
            />
            <input
              type="text"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Search by contact, phone, caller, or notes..."
              className="w-full pl-10 pr-4 py-2 bg-gray-50/70 border border-gray-200 rounded-xl text-xs sm:text-sm text-gray-800 placeholder-gray-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-maroon/20 focus:border-maroon transition-all"
            />
          </div>

          {/* Dropdown Filters */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Coordinator Dropdown */}
            <select
              value={selectedUserId}
              onChange={(e) => {
                setSelectedUserId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by coordinator"
              className="h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer max-w-[170px] truncate"
            >
              <option value="all">All Coordinators</option>
              {coordinators.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name}
                </option>
              ))}
            </select>

            {/* Project Dropdown */}
            <select
              value={selectedProjectId}
              onChange={(e) => {
                setSelectedProjectId(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by project"
              className="h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer max-w-[170px] truncate"
            >
              <option value="all">All Projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>

            {/* Outcome Dropdown */}
            <select
              value={selectedOutcome}
              onChange={(e) => {
                setSelectedOutcome(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by outcome"
              className="h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer"
            >
              <option value="all">All Outcomes</option>
              <option value="interested">Interested</option>
              <option value="follow_up_required">Follow-up</option>
              <option value="not_interested">Not Interested</option>
              <option value="unanswered">Unanswered</option>
            </select>

            {/* Status Dropdown */}
            <select
              value={selectedStatus}
              onChange={(e) => {
                setSelectedStatus(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by call status"
              className="h-[38px] px-3 rounded-lg border border-gray-200 bg-white text-xs font-medium text-text-main focus:outline-none focus:ring-2 focus:ring-gold/40 cursor-pointer"
            >
              <option value="all">All Status</option>
              <option value="answered">Answered</option>
              <option value="not_answered">Not Answered</option>
            </select>
          </div>
        </div>

        {/* Date Filter Quick Pills */}
        <div className="pt-2 border-t border-gray-100 flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            <span className="text-text-muted font-semibold uppercase text-[10px] tracking-wider mr-1">
              Timeframe:
            </span>
            {(['all', 'today', '7days', '30days'] as const).map((range) => (
              <button
                key={range}
                type="button"
                onClick={() => {
                  setDateRange(range);
                  setPage(1);
                }}
                className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
                  dateRange === range
                    ? 'bg-maroon text-white shadow-2xs'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200/70'
                }`}
              >
                {range === 'all'
                  ? 'All Time'
                  : range === 'today'
                  ? 'Today'
                  : range === '7days'
                  ? 'Last 7 Days'
                  : 'Last 30 Days'}
              </button>
            ))}
          </div>

          {(selectedUserId !== 'all' ||
            selectedProjectId !== 'all' ||
            selectedOutcome !== 'all' ||
            selectedStatus !== 'all' ||
            dateRange !== 'all' ||
            searchInput.trim()) && (
            <button
              type="button"
              onClick={() => {
                setSelectedUserId('all');
                setSelectedProjectId('all');
                setSelectedOutcome('all');
                setSelectedStatus('all');
                setDateRange('all');
                setSearchInput('');
                setPage(1);
              }}
              className="text-maroon hover:underline font-semibold text-xs cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      </div>

      {/* Calls Table Container */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Sub-header */}
        <div className="border-b border-gray-100 px-4 sm:px-6 py-3 flex items-center justify-between bg-[#FCFAFA] text-xs text-gray-500">
          <div>
            Showing <strong className="text-gray-800">{calls.length}</strong> of{' '}
            <strong className="text-gray-800">{totalCount}</strong> calls
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="m-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertCircle size={16} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Table / Empty State */}
        {loading ? (
          <div className="p-12 text-center text-text-muted text-sm">
            <RotateCcw size={22} className="animate-spin text-maroon mx-auto mb-2.5" />
            Loading team call history...
          </div>
        ) : calls.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <PhoneIncoming size={32} className="text-gray-300 mx-auto" />
            <h3 className="text-base font-bold text-gray-800">No calls found</h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto">
              No calling activity matches your selected filters. Try widening the date range or clearing filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#FAF7F7] border-b border-gray-100 text-[11px] font-bold text-gray-500 uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4 w-12 text-center">#</th>
                  <th className="py-3 px-4 min-w-[200px]">Contact</th>
                  <th className="py-3 px-4 min-w-[180px]">Coordinator</th>
                  <th className="py-3 px-4 min-w-[160px]">Project</th>
                  <th className="py-3 px-4 min-w-[130px]">Status</th>
                  <th className="py-3 px-4 min-w-[150px]">Outcome</th>
                  <th className="py-3 px-4 min-w-[170px]">Follow-Up</th>
                  <th className="py-3 px-4 min-w-[90px]">Duration</th>
                  <th className="py-3 px-4 min-w-[220px]">Discussion Notes</th>
                  <th className="py-3 px-4 min-w-[110px]">Date</th>
                  <th className="py-3 px-4 text-right min-w-[90px]">Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {calls.map((c, index) => {
                  const rowIndex = (page - 1) * limit + index + 1;
                  return (
                    <tr key={c.id} className="hover:bg-page-bg/40 transition-colors">
                      {/* Row Index */}
                      <td className="py-3 px-4 text-xs font-semibold text-gray-400 text-center">
                        {rowIndex}
                      </td>

                      {/* Contact */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-text-main leading-tight flex items-center gap-1.5">
                          {c.contact_id ? (
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryContactId(c.contact_id!)}
                              className="hover:text-maroon hover:underline font-semibold text-left cursor-pointer transition-colors"
                              title="Click to view contact call history"
                            >
                              {c.contact_name}
                            </button>
                          ) : (
                            <span>{c.contact_name}</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 mt-0.5 text-xs text-gray-500">
                          <span>{c.contact_number}</span>
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(c.id, c.contact_number)}
                            title="Copy number"
                            className="text-gray-400 hover:text-gray-600 cursor-pointer"
                          >
                            {copiedId === c.id ? (
                              <Check size={12} className="text-emerald-600" />
                            ) : (
                              <Copy size={12} />
                            )}
                          </button>
                          {c.contact_id && (
                            <button
                              type="button"
                              onClick={() => setSelectedHistoryContactId(c.contact_id!)}
                              title="View full call history for this contact"
                              className="text-gray-400 hover:text-maroon transition-colors cursor-pointer ml-0.5"
                            >
                              <History size={12} />
                            </button>
                          )}
                        </div>
                      </td>

                      {/* Coordinator */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-text-main flex items-center gap-1.5">
                          <User size={13} className="text-maroon shrink-0" />
                          <span>{c.caller_name}</span>
                        </div>
                        <div className="text-xs text-gray-400 truncate max-w-[180px]">
                          {c.caller_email}
                        </div>
                      </td>

                      {/* Project */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {c.project_name ? (
                          <div className="flex items-center gap-1.5">
                            <FolderKanban size={13} className="text-maroon/70 shrink-0" />
                            <span className="text-xs font-semibold text-text-main">
                              {c.project_name}
                            </span>
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                            c.status === 'answered'
                              ? 'bg-emerald-50 text-emerald-800 border border-emerald-200/60'
                              : 'bg-red-50 text-red-700 border border-red-200/60'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              c.status === 'answered' ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span>{c.status === 'answered' ? 'Answered' : 'Not Answered'}</span>
                        </span>
                      </td>

                      {/* Outcome */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {renderOutcomeBadge(c.outcome, c.follow_up_status)}
                      </td>

                      {/* Follow-Up */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        {c.follow_up_status === 'completed' && c.follow_up_date ? (
                          <div className="flex flex-col">
                            <span className="text-xs text-text-muted line-through">
                              {formatDateTime(c.follow_up_date)}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600">
                              <CheckCircle2 size={11} /> Resolved
                            </span>
                          </div>
                        ) : c.follow_up_date ? (
                          <span className="text-xs font-medium text-gray-700">
                            {formatDateTime(c.follow_up_date)}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">—</span>
                        )}
                      </td>

                      {/* Duration */}
                      <td className="py-3 px-4 whitespace-nowrap text-xs font-semibold text-text-main">
                        {c.duration_seconds > 0 ? (
                          formatDuration(c.duration_seconds)
                        ) : (
                          <span className="text-gray-400">0s</span>
                        )}
                      </td>

                      {/* Notes */}
                      <td className="py-3 px-4">
                        {c.purpose ? (
                          <p className="text-xs text-gray-700 line-clamp-2 max-w-sm">
                            {c.purpose}
                          </p>
                        ) : (
                          <span className="text-xs text-gray-400 italic">No notes</span>
                        )}
                      </td>

                      {/* Date */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="text-xs font-semibold text-gray-900">
                          {c.called_at
                            ? new Date(c.called_at).toLocaleDateString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                              })
                            : '-'}
                        </div>
                      </td>

                      {/* Time */}
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="text-xs font-medium text-gray-600">
                          {c.called_at
                            ? new Date(c.called_at).toLocaleTimeString('en-IN', {
                                hour: '2-digit',
                                minute: '2-digit',
                                hour12: true,
                              })
                            : '-'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {totalCount > 0 && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-muted">
            <div className="flex items-center gap-3">
              <span>
                Showing {(page - 1) * limit + 1} to {Math.min(page * limit, totalCount)} of {totalCount}
              </span>
              <div className="flex items-center gap-1.5">
                <label htmlFor="calls-page-size" className="text-xs">
                  Rows:
                </label>
                <select
                  id="calls-page-size"
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
      </div>

      {/* Contact Call History Modal */}
      {selectedHistoryContactId && (
        <ContactHistoryModal
          contactId={selectedHistoryContactId}
          onClose={() => setSelectedHistoryContactId(null)}
        />
      )}
    </div>
  );
};
