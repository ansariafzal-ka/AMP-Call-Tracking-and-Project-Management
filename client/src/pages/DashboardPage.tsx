import React, { useState, useEffect, useCallback } from 'react';
import {
  PhoneCall,
  Clock,
  Search,
  Pencil,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  CalendarClock,
  Users,
} from 'lucide-react';
import apiClient from '../api/client';
import type {
  Call,
  CallSummary,
  CallOutcome,
  CallStatus,
  GetCallsResponse,
  UserStats,
} from '../types';
import { formatDuration, formatDateTime, getErrorMessage } from '../utils/format';
import { UpdateCallModal } from '../components/UpdateCallModal';

export const DashboardPage: React.FC = () => {
  const [summary, setSummary] = useState<CallSummary>({
    total_calls: 0,
    total_duration_seconds: 0,
  });
  const [stats, setStats] = useState<UserStats | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [filteredTotal, setFilteredTotal] = useState<number>(0);

  // Filters & Search
  const [searchInput, setSearchInput] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');

  // Pagination
  const [limit, setLimit] = useState<number>(10);
  const [page, setPage] = useState<number>(1);

  // Loading & Error
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [editingCall, setEditingCall] = useState<Call | null>(null);

  // Debounce search input by 400ms and reset to page 1
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchInput);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const fetchCallsData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const offset = (page - 1) * limit;
      const params: Record<string, string | number> = {
        limit,
        offset,
      };

      if (debouncedSearch.trim()) {
        params.search = debouncedSearch.trim();
      }
      if (outcomeFilter !== 'all') {
        params.outcome = outcomeFilter;
      }
      if (statusFilter !== 'all') {
        params.status = statusFilter;
      }

      const res = await apiClient.get<GetCallsResponse>('/api/calls', { params });
      setSummary(
        res.data.summary || { total_calls: 0, total_duration_seconds: 0 }
      );
      setCalls(res.data.calls || []);
      setFilteredTotal(Number(res.data.filtered_total || 0));

      // Fetch user caller stats
      try {
        const statsRes = await apiClient.get<{ success: boolean; data: UserStats }>('/api/users/stats');
        if (statsRes.data?.data) {
          setStats(statsRes.data.data);
        }
      } catch {
        // Fallback: continue showing summary if stats endpoint fails
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load calls.'));
    } finally {
      setLoading(false);
    }
  }, [page, limit, debouncedSearch, outcomeFilter, statusFilter]);

  useEffect(() => {
    fetchCallsData();
  }, [fetchCallsData]);

  const refreshSummaryOnly = useCallback(async () => {
    try {
      const [res, statsRes] = await Promise.all([
        apiClient.get<GetCallsResponse>('/api/calls', { params: { limit: 1, offset: 0 } }),
        apiClient.get<{ success: boolean; data: UserStats }>('/api/users/stats').catch(() => null),
      ]);
      if (res.data?.summary) {
        setSummary(res.data.summary);
      }
      if (statsRes?.data?.data) {
        setStats(statsRes.data.data);
      }
    } catch {
      // Ignore background summary refresh errors
    }
  }, []);

  const handleCallUpdated = (updatedCall: Call) => {
    setCalls((prev) =>
      prev.map((item) => (item.id === updatedCall.id ? updatedCall : item))
    );
    refreshSummaryOnly();
  };

  const renderStatusPill = (status: CallStatus) => {
    if (status === 'answered') {
      return (
        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 whitespace-nowrap">
          Answered
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 whitespace-nowrap">
        Not answered
      </span>
    );
  };

  const renderOutcomePill = (outcome: CallOutcome) => {
    switch (outcome) {
      case 'interested':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 whitespace-nowrap">
            Interested
          </span>
        );
      case 'not_interested':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 whitespace-nowrap">
            Not interested
          </span>
        );
      case 'unanswered':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-200 text-gray-700 whitespace-nowrap">
            Unanswered
          </span>
        );
      case 'follow_up_required':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 whitespace-nowrap">
            Follow-up required
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500 whitespace-nowrap">
            Not set
          </span>
        );
    }
  };

  const hasActiveFilters =
    debouncedSearch.trim().length > 0 ||
    outcomeFilter !== 'all' ||
    statusFilter !== 'all';

  const totalPages = Math.max(1, Math.ceil(filteredTotal / limit));
  const startRecord = filteredTotal === 0 ? 0 : (page - 1) * limit + 1;
  const endRecord = Math.min(page * limit, filteredTotal);

  return (
    <div className="space-y-6">
      {/* Summary Cards - 4 Grid Layout from Figma */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Calls Today */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
            <PhoneCall size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Calls Today</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {stats ? stats.callsMadeToday : summary.total_calls}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              {stats ? `${stats.totalCallsAllTime} all-time` : 'Today'}
            </div>
          </div>
        </div>

        {/* Connected Calls */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Connected</div>
            <div className="text-2xl font-bold text-emerald-700 mt-0.5">
              {stats ? stats.connectedCallsToday : 0}
            </div>
            <div className="text-xs text-emerald-600 mt-0.5 font-medium">
              {stats && stats.callsMadeToday > 0
                ? `${Math.round((stats.connectedCallsToday / stats.callsMadeToday) * 100)}% rate`
                : '100% rate'}
            </div>
          </div>
        </div>

        {/* Total Talk Time */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-gold/15 text-amber-700 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Talk Time</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {formatDuration(stats ? stats.totalTalkTimeTodaySeconds : summary.total_duration_seconds)}
            </div>
            <div className="text-xs text-text-muted mt-0.5">Today's duration</div>
          </div>
        </div>

        {/* Pending Follow-ups */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CalendarClock size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Follow-ups</div>
            <div className="text-2xl font-bold text-blue-700 mt-0.5">
              {stats ? stats.pendingFollowUps : 0}
            </div>
            <div className="text-xs text-blue-600 mt-0.5 font-medium">
              {stats ? `${stats.totalAssignedContacts} assigned contacts` : 'Pending'}
            </div>
          </div>
        </div>
      </div>

      {/* Call History Card */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-lg font-bold text-text-main">Call history</h2>
            <span className="text-sm text-text-muted">
              {filteredTotal} recorded
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search input */}
            <div className="relative flex-1 sm:w-60">
              <Search
                size={16}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none"
              />
              <input
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search number or note"
                className="w-full h-[44px] pl-9 pr-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition"
              />
            </div>

            {/* Outcome select */}
            <select
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by outcome"
              className="h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition cursor-pointer"
            >
              <option value="all">All outcomes</option>
              <option value="interested">Interested</option>
              <option value="not_interested">Not interested</option>
              <option value="unanswered">Unanswered</option>
              <option value="follow_up_required">Follow-up required</option>
              <option value="not_set">Not set</option>
            </select>

            {/* Status select */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by status"
              className="h-[44px] px-3.5 rounded-lg border border-gray-300 bg-white text-sm text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold transition cursor-pointer"
            >
              <option value="all">All status</option>
              <option value="answered">Answered</option>
              <option value="not_answered">Not answered</option>
            </select>
          </div>
        </div>

        {/* Table / States */}
        {loading ? (
          <div className="py-16 flex flex-col items-center justify-center text-text-muted">
            <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin mb-3" />
            <span className="text-sm">Loading calls...</span>
          </div>
        ) : error ? (
          <div className="py-14 px-4 flex flex-col items-center justify-center text-center">
            <AlertCircle size={28} className="text-red-600 mb-2" />
            <p className="text-sm text-red-600 font-medium mb-4">{error}</p>
            <button
              type="button"
              onClick={fetchCallsData}
              className="h-[44px] px-5 rounded-lg bg-maroon hover:bg-maroon-hover text-white text-sm font-semibold transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : calls.length === 0 ? (
          <div className="py-16 px-4 text-center text-sm text-text-muted">
            {hasActiveFilters || summary.total_calls > 0
              ? 'No calls match your filters'
              : 'No calls yet'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/70 text-xs font-semibold uppercase tracking-wider text-text-muted">
                    <th className="py-3.5 pl-5 pr-3 whitespace-nowrap">#</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">
                      Contact number
                    </th>
                    <th className="py-3.5 px-3 whitespace-nowrap">Status</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">Outcome</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">Follow-up</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">Note</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">Duration</th>
                    <th className="py-3.5 px-3 whitespace-nowrap">
                      Date &amp; time
                    </th>
                    <th className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 text-sm">
                  {calls.map((call, idx) => {
                    const rowPosition = idx + 1;
                    const noteValue =
                      call.purpose && call.purpose.trim() ? call.purpose.trim() : null;
                    const followUpValue =
                      call.follow_up_date
                        ? formatDateTime(call.follow_up_date)
                        : '—';

                    return (
                      <tr
                        key={call.id}
                        className="hover:bg-gray-50/60 transition-colors"
                      >
                        <td className="py-3.5 pl-5 pr-3 text-text-muted whitespace-nowrap">
                          {rowPosition}
                        </td>
                        <td className="py-3.5 px-3 font-medium text-text-main whitespace-nowrap">
                          {call.contact_name ? (
                            <div>
                              <div className="font-semibold text-text-main">{call.contact_name}</div>
                              <div className="text-xs text-text-muted font-normal">{call.contact_number}</div>
                            </div>
                          ) : (
                            call.contact_number
                          )}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {renderStatusPill(call.status)}
                        </td>
                        <td className="py-3.5 px-3 whitespace-nowrap">
                          {renderOutcomePill(call.outcome)}
                        </td>
                        <td className="py-3.5 px-3 text-text-main whitespace-nowrap">
                          {followUpValue}
                        </td>
                        <td className="py-3.5 px-3 max-w-[220px]">
                          {noteValue ? (
                            <div
                              title={noteValue}
                              className="truncate text-text-main"
                            >
                              {noteValue}
                            </div>
                          ) : (
                            <span className="text-text-muted">—</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3 text-text-main whitespace-nowrap">
                          {formatDuration(call.duration_seconds)}
                        </td>
                        <td className="py-3.5 px-3 text-text-muted whitespace-nowrap">
                          {formatDateTime(call.called_at)}
                        </td>
                        <td className="py-3.5 pl-3 pr-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            title="Update call"
                            aria-label="Update call"
                            onClick={() => setEditingCall(call)}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-maroon text-maroon hover:bg-maroon hover:text-white transition-colors cursor-pointer"
                          >
                            <Pencil size={16} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="px-4 sm:px-5 py-3.5 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 text-sm text-text-muted">
              <div className="flex items-center gap-3">
                <span>
                  Showing {startRecord} to {endRecord} of {filteredTotal}
                </span>
                <div className="flex items-center gap-1.5">
                  <label htmlFor="page-size-select" className="text-xs">
                    Rows:
                  </label>
                  <select
                    id="page-size-select"
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
          </>
        )}
      </div>

      {/* Update Call Modal */}
      <UpdateCallModal
        call={editingCall}
        onClose={() => setEditingCall(null)}
        onSuccess={handleCallUpdated}
      />
    </div>
  );
};
