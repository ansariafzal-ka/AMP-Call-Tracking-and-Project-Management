import React, { useState, useEffect, useCallback } from 'react';
import {
  CalendarClock,
  Clock,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Check,
  CalendarDays,
  Copy,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import type {
  FollowUpItem,
  FollowUpSummaryCounts,
  GetFollowUpsResponse,
} from '../types';
import { formatDateTime, getErrorMessage } from '../utils/format';
import { RescheduleFollowUpModal } from '../components/RescheduleFollowUpModal';
import { CompleteFollowUpModal } from '../components/CompleteFollowUpModal';

type FilterTab = 'all' | 'overdue' | 'today' | 'upcoming' | 'completed';

export const FollowUpsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<FilterTab>('today');
  const [followUps, setFollowUps] = useState<FollowUpItem[]>([]);
  const [summary, setSummary] = useState<FollowUpSummaryCounts>({
    today: 0,
    overdue: 0,
    upcoming: 0,
    completed: 0,
  });

  const [page, setPage] = useState<number>(1);
  const [limit, setLimit] = useState<number>(10);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [totalCount, setTotalCount] = useState<number>(0);

  const [loading, setLoading] = useState<boolean>(true);
  const [exporting, setExporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  // Modals state
  const [rescheduleItem, setRescheduleItem] = useState<FollowUpItem | null>(null);
  const [completeItem, setCompleteItem] = useState<FollowUpItem | null>(null);

  const fetchFollowUps = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await apiClient.get<GetFollowUpsResponse>('/api/follow-ups', {
        params: {
          status: activeTab,
          page,
          limit,
        },
      });

      if (res.data?.success && res.data.data) {
        setFollowUps(res.data.data.followUps || []);
        setSummary(
          res.data.data.summary || { today: 0, overdue: 0, upcoming: 0, completed: 0 }
        );
        const p = res.data.data.pagination;
        setTotalPages(p?.totalPages || 1);
        setTotalCount(p?.total || 0);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to fetch follow-ups.'));
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, limit]);

  useEffect(() => {
    fetchFollowUps();
  }, [fetchFollowUps]);

  const handleTabChange = (tab: FilterTab) => {
    setActiveTab(tab);
    setPage(1);
  };

  const handleCopyPhone = (id: number, phone: string) => {
    navigator.clipboard.writeText(phone);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleExportExcel = async () => {
    try {
      setExporting(true);

      const res = await apiClient.get<GetFollowUpsResponse>('/api/follow-ups', {
        params: {
          status: activeTab,
          page: 1,
          limit: 5000,
        },
      });

      const dataToExport = res.data?.data?.followUps || [];

      if (dataToExport.length === 0) {
        alert('No follow-ups available to export for this tab.');
        return;
      }

      const rows = dataToExport.map((item) => {
        let dueDate = '';
        let dueTime = '';
        if (item.due_at) {
          const d = new Date(item.due_at);
          if (!isNaN(d.getTime())) {
            dueDate = d.toLocaleDateString('en-IN', {
              day: '2-digit',
              month: 'short',
              year: 'numeric',
            });
            dueTime = d.toLocaleTimeString('en-IN', {
              hour: '2-digit',
              minute: '2-digit',
              hour12: true,
            });
          }
        }

        return {
          'Contact Name': item.contact_name,
          'Mobile Number': String(item.contact_mobile || ''),
          'Category': item.contact_category || 'Other',
          'State': item.contact_state || '',
          'City': item.contact_city || '',
          'Pin Code': item.contact_pin_code || '',
          'Due Date': dueDate,
          'Due Time': dueTime,
          'Status': item.status ? item.status.toUpperCase() : '',
          'Notes / Instructions': item.notes || '',
          'Completed Date': item.completed_at ? formatDateTime(item.completed_at) : '-',
          'Created Date': item.created_at ? formatDateTime(item.created_at) : '',
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
      const tabTitle = activeTab.charAt(0).toUpperCase() + activeTab.slice(1);
      XLSX.utils.book_append_sheet(workbook, worksheet, `${tabTitle} Follow-ups`);

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `FollowUps_${tabTitle}_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Failed to export follow-ups:', err);
      setError('Failed to export follow-ups to Excel.');
    } finally {
      setExporting(false);
    }
  };

  const getCategoryBadgeClass = (category: string) => {
    switch (category?.toLowerCase()) {
      case 'donor':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'beneficiary':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'student':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'volunteer':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      default:
        return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const isOverdue = (dueAt: string, status: string) => {
    if (status === 'completed') return false;
    return new Date(dueAt).getTime() < Date.now();
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Follow-ups & Callbacks
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Never miss a promised callback. Stay on schedule with your assigned contacts.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          {/* Excel Export Button */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={exporting || totalCount === 0}
            title={`Download ${activeTab} follow-ups in Excel`}
            className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl hover:bg-emerald-100 transition-colors shadow-2xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>{exporting ? 'Exporting...' : 'Excel'}</span>
          </button>

          <button
            type="button"
            onClick={() => fetchFollowUps()}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 px-3.5 py-2 text-xs font-semibold text-gray-700 bg-white border border-gray-200 rounded-xl hover:bg-gray-50 hover:text-gray-900 transition-colors shadow-xs cursor-pointer"
          >
            <RotateCcw size={14} className={loading ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards (Clickable Quick Filters) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Due Today Card */}
        <button
          type="button"
          onClick={() => handleTabChange('today')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeTab === 'today'
              ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-400/20'
              : 'bg-card-bg border-gray-100 hover:border-amber-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">
              Due Today
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
              <Clock size={17} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
            {summary.today}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Scheduled for today</p>
        </button>

        {/* Upcoming Card */}
        <button
          type="button"
          onClick={() => handleTabChange('upcoming')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeTab === 'upcoming'
              ? 'bg-blue-50/80 border-blue-300 ring-2 ring-blue-400/20'
              : 'bg-card-bg border-gray-100 hover:border-blue-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Upcoming
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center">
              <CalendarDays size={17} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
            {summary.upcoming}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Scheduled for future dates</p>
        </button>

        {/* Overdue Card */}
        <button
          type="button"
          onClick={() => handleTabChange('overdue')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeTab === 'overdue'
              ? 'bg-red-50/80 border-red-300 ring-2 ring-red-400/20'
              : 'bg-card-bg border-gray-100 hover:border-red-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-red-600">
              Overdue
            </span>
            <div className="w-8 h-8 rounded-lg bg-red-100 text-red-600 flex items-center justify-center">
              <AlertTriangle size={17} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
            {summary.overdue}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Urgent callbacks past due date</p>
        </button>

        {/* Completed Card */}
        <button
          type="button"
          onClick={() => handleTabChange('completed')}
          className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
            activeTab === 'completed'
              ? 'bg-emerald-50/80 border-emerald-300 ring-2 ring-emerald-400/20'
              : 'bg-card-bg border-gray-100 hover:border-emerald-200 shadow-sm'
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-emerald-700">
              Completed
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <CheckCircle2 size={17} />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-gray-900 mt-2">
            {summary.completed}
          </div>
          <p className="text-[11px] text-gray-500 mt-0.5">Resolved follow-up calls</p>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Navigation Tabs Header */}
        <div className="border-b border-gray-100 px-4 sm:px-6 pt-3 pb-2 flex flex-wrap items-center justify-between gap-3 bg-[#FCFAFA]">
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1">
            <button
              type="button"
              onClick={() => handleTabChange('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 cursor-pointer ${
                activeTab === 'all'
                  ? 'bg-maroon text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              All
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('today')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'today'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Today
              {summary.today > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'today'
                      ? 'bg-white text-amber-700'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {summary.today}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('upcoming')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'upcoming'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Upcoming
              {summary.upcoming > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'upcoming' ? 'bg-white text-blue-700' : 'bg-blue-100 text-blue-800'
                  }`}
                >
                  {summary.upcoming}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('overdue')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'overdue'
                  ? 'bg-red-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Overdue
              {summary.overdue > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'overdue' ? 'bg-white text-red-600' : 'bg-red-100 text-red-700'
                  }`}
                >
                  {summary.overdue}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => handleTabChange('completed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors shrink-0 flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'completed'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              Completed
              {summary.completed > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold ${
                    activeTab === 'completed'
                      ? 'bg-white text-emerald-700'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {summary.completed}
                </span>
              )}
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Showing <strong className="text-gray-800">{followUps.length}</strong> of{' '}
            <strong className="text-gray-800">{totalCount}</strong> follow-ups
          </div>
        </div>

        {/* Error message */}
        {error && (
          <div className="m-4 p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
            <AlertTriangle size={16} className="text-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Loading Spinner */}
        {loading ? (
          <div className="py-20 flex flex-col items-center justify-center text-gray-400 gap-3">
            <div className="w-8 h-8 rounded-full border-2 border-maroon border-t-transparent animate-spin" />
            <span className="text-xs font-medium text-gray-500">Loading follow-ups...</span>
          </div>
        ) : followUps.length === 0 ? (
          /* Empty State */
          <div className="py-16 px-4 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-50 border border-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3">
              <CalendarClock size={28} />
            </div>
            <h3 className="text-sm font-bold text-gray-800">
              {activeTab === 'overdue'
                ? 'No overdue follow-ups!'
                : activeTab === 'today'
                ? 'No follow-ups due today.'
                : activeTab === 'upcoming'
                ? 'No upcoming follow-ups scheduled.'
                : activeTab === 'completed'
                ? 'No completed follow-ups yet.'
                : 'No follow-ups found.'}
            </h3>
            <p className="text-xs text-gray-500 max-w-sm mx-auto mt-1">
              {activeTab === 'overdue'
                ? 'Great job keeping up with your scheduled calls.'
                : 'When you schedule follow-ups after speaking with contacts, they will appear right here.'}
            </p>
          </div>
        ) : (
          /* Full-width Responsive Table */
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-gray-100 bg-[#FAF7F7] text-gray-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-3 px-4 sm:px-6">Contact</th>
                  <th className="py-3 px-4">Phone Number</th>
                  <th className="py-3 px-4">Due Date & Time</th>
                  <th className="py-3 px-4">Context / Notes</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 sm:px-6 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {followUps.map((item) => {
                  const overdue = isOverdue(item.due_at, item.status);
                  const isDone = item.status === 'completed';

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-[#FCFAFA] transition-colors ${
                        overdue ? 'bg-red-50/25' : ''
                      }`}
                    >
                      {/* Contact Info */}
                      <td className="py-3.5 px-4 sm:px-6">
                        <div className="flex flex-col gap-1">
                          <span className="font-bold text-gray-900 text-sm">
                            {item.contact_name}
                          </span>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[10px] font-bold border shrink-0 ${getCategoryBadgeClass(
                                item.contact_category
                              )}`}
                            >
                              {item.contact_category}
                            </span>
                            {(() => {
                              const locationText = [item.contact_state, item.contact_city].filter(Boolean).join(', ') + (item.contact_pin_code ? ` - ${item.contact_pin_code}` : '');
                              return locationText ? (
                                <span className="text-[11px] text-gray-400 whitespace-nowrap">
                                  • {locationText}
                                </span>
                              ) : null;
                            })()}
                          </div>
                        </div>
                      </td>

                      {/* Phone Number */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-gray-800 font-semibold">
                            {item.contact_mobile}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyPhone(item.id, item.contact_mobile)}
                            title="Copy number"
                            className="p-1 text-gray-400 hover:text-gray-600 rounded transition-colors cursor-pointer"
                          >
                            {copiedId === item.id ? (
                              <Check size={13} className="text-emerald-600" />
                            ) : (
                              <Copy size={13} />
                            )}
                          </button>
                        </div>
                      </td>

                      {/* Due Date & Time */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span
                            className={`font-semibold flex items-center gap-1.5 ${
                              overdue
                                ? 'text-red-700'
                                : isDone
                                ? 'text-gray-500 line-through'
                                : 'text-gray-900'
                            }`}
                          >
                            <Clock
                              size={13}
                              className={overdue ? 'text-red-600' : 'text-gray-400'}
                            />
                            {formatDateTime(item.due_at)}
                          </span>
                          {overdue && (
                            <span className="text-[10px] font-bold text-red-600 uppercase tracking-tight mt-0.5">
                              Action Overdue
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Context / Notes */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <p className="text-gray-600 line-clamp-2">
                          {item.notes || <span className="text-gray-400 italic">No notes</span>}
                        </p>
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isDone ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <CheckCircle2 size={12} />
                            Completed
                          </span>
                        ) : overdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 border border-red-200">
                            <AlertTriangle size={12} />
                            Overdue
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                            <Clock size={12} />
                            Pending
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 sm:px-6 whitespace-nowrap text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {!isDone ? (
                            <>
                              {/* Complete Button */}
                              <button
                                type="button"
                                onClick={() => setCompleteItem(item)}
                                title="Mark as Completed"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 transition-colors cursor-pointer"
                              >
                                <Check size={13} />
                                <span>Done</span>
                              </button>

                              {/* Reschedule Button */}
                              <button
                                type="button"
                                onClick={() => setRescheduleItem(item)}
                                title="Reschedule Follow-up"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                              >
                                <Calendar size={13} />
                                <span>Reschedule</span>
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded text-[11px] font-medium">
                                Resolved
                              </span>
                              <button
                                type="button"
                                onClick={() => setRescheduleItem(item)}
                                title="Reschedule or reopen this follow-up"
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
                              >
                                <Calendar size={13} />
                                <span>Reschedule</span>
                              </button>
                            </div>
                          )}
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
                <label htmlFor="followups-page-size" className="text-xs">
                  Rows:
                </label>
                <select
                  id="followups-page-size"
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
                disabled={page <= 1 || loading}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 h-9 px-3 rounded-lg border border-gray-300 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-xs font-medium text-text-main transition cursor-pointer"
              >
                <ChevronLeft size={15} />
                Previous
              </button>
              <button
                type="button"
                disabled={page >= totalPages || loading}
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

      {/* Reschedule Modal */}
      {rescheduleItem && (
        <RescheduleFollowUpModal
          followUp={rescheduleItem}
          onClose={() => setRescheduleItem(null)}
          onSuccess={() => {
            fetchFollowUps();
          }}
        />
      )}

      {/* Complete Modal */}
      {completeItem && (
        <CompleteFollowUpModal
          followUp={completeItem}
          onClose={() => setCompleteItem(null)}
          onSuccess={() => {
            fetchFollowUps();
          }}
        />
      )}
    </div>
  );
};
