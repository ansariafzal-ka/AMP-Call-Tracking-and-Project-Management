import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  UserCheck,
  TrendingUp,
  Search,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
  PhoneCall,
  Clock,
  CalendarClock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { formatDuration } from '../utils/format';
import type { AdminDashboardData } from '../types';

type DateFilter = 'today' | '7days' | '30days' | 'all';
type AchievementFilter = 'all' | 'achieved' | 'in_progress' | 'zero';

export const AdminPerformancePage: React.FC = () => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [error, setError] = useState<string | null>(null);

  // Search & Filters
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [achievementFilter, setAchievementFilter] = useState<AchievementFilter>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');

  // Pagination
  const [page, setPage] = useState<number>(1);
  const limit = 10;

  const fetchPerformanceData = useCallback(async (filter: DateFilter, isManual = false) => {
    if (isManual) setRefreshing(true);
    else setLoading(true);
    setError(null);

    let startDate: string | undefined;
    const now = new Date();

    if (filter === 'today') {
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      startDate = today.toISOString();
    } else if (filter === '7days') {
      const past7 = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      startDate = past7.toISOString();
    } else if (filter === '30days') {
      const past30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      startDate = past30.toISOString();
    } else {
      startDate = '2020-01-01T00:00:00.000Z';
    }

    try {
      const res = await apiClient.get<{ success: boolean; data: AdminDashboardData }>(
        '/api/admin/dashboard',
        {
          params: { startDate, limit: 100 },
        }
      );

      if (res.data?.data) {
        setData(res.data.data);
      }
    } catch (err: any) {
      console.error('Failed to load coordinator performance:', err);
      setError(err?.response?.data?.message || 'Failed to load coordinator performance data.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchPerformanceData(dateFilter);
  }, [dateFilter, fetchPerformanceData]);

  const rawLeaderboard = data?.leaderboard || [];

  // Filtered leaderboard
  const filteredLeaderboard = useMemo(() => {
    return rawLeaderboard.filter((caller) => {
      // Search filter (name or email)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = caller.fullName?.toLowerCase().includes(q);
        const matchesEmail = caller.email?.toLowerCase().includes(q);
        if (!matchesName && !matchesEmail) return false;
      }

      // Role filter
      if (roleFilter !== 'all' && caller.role !== roleFilter) {
        return false;
      }

      // Achievement filter
      const targetPct = caller.targetAchievementPercentage;
      if (achievementFilter === 'achieved' && targetPct < 100) return false;
      if (achievementFilter === 'in_progress' && (targetPct <= 0 || targetPct >= 100)) return false;
      if (achievementFilter === 'zero' && caller.callsCount > 0) return false;

      return true;
    });
  }, [rawLeaderboard, searchQuery, achievementFilter, roleFilter]);

  // Pagination slice
  const totalPages = Math.max(1, Math.ceil(filteredLeaderboard.length / limit));
  const paginatedList = useMemo(() => {
    const start = (page - 1) * limit;
    return filteredLeaderboard.slice(start, start + limit);
  }, [filteredLeaderboard, page, limit]);

  // Overall Performance KPIs
  const kpis = useMemo(() => {
    if (rawLeaderboard.length === 0) {
      return {
        avgAchievement: 0,
        totalCalls: 0,
        totalConnected: 0,
        totalTalkTime: 0,
      };
    }

    const totalAch = rawLeaderboard.reduce(
      (sum, c) => sum + Math.min(100, c.targetAchievementPercentage || 0),
      0
    );
    const avgAchievement = Math.round(totalAch / rawLeaderboard.length);

    const totalCalls = rawLeaderboard.reduce((sum, c) => sum + (c.callsCount || 0), 0);
    const totalConnected = rawLeaderboard.reduce((sum, c) => sum + (c.connectedCount || 0), 0);
    const totalTalkTime = rawLeaderboard.reduce((sum, c) => sum + (c.totalTalkTimeSeconds || 0), 0);

    return {
      avgAchievement,
      totalCalls,
      totalConnected,
      totalTalkTime,
    };
  }, [rawLeaderboard]);

  const handleExportExcel = () => {
    try {
      const filterLabel =
        dateFilter === 'today'
          ? 'Today'
          : dateFilter === '7days'
          ? 'Last 7 Days'
          : dateFilter === '30days'
          ? 'Last 30 Days'
          : 'All Time';

      const workbook = XLSX.utils.book_new();

      const callerRows = filteredLeaderboard.map((caller) => ({
        Coordinator: caller.fullName,
        Email: caller.email,
        Role: caller.role,
        'Daily Target': caller.dailyTarget,
        'Calls Made': caller.callsCount,
        'Target Achievement %': `${Math.round(caller.targetAchievementPercentage)}%`,
        'Weekly Target': caller.weeklyTarget,
        Connected: caller.connectedCount,
        'Connection Rate':
          caller.callsCount > 0
            ? `${Math.round((caller.connectedCount / caller.callsCount) * 100)}%`
            : '0%',
        Interested: caller.interestedCount,
        'Talk Time': formatDuration(caller.totalTalkTimeSeconds || 0),
        'Pending Follow-ups': caller.pendingFollowUpsCount,
        'Assigned Contacts': caller.totalAssignedContacts,
      }));

      const sheet = XLSX.utils.json_to_sheet(callerRows);
      sheet['!cols'] = [
        { wch: 22 },
        { wch: 26 },
        { wch: 10 },
        { wch: 14 },
        { wch: 14 },
        { wch: 20 },
        { wch: 14 },
        { wch: 12 },
        { wch: 16 },
        { wch: 12 },
        { wch: 14 },
        { wch: 18 },
        { wch: 18 },
      ];

      XLSX.utils.book_append_sheet(workbook, sheet, 'Coordinator Performance');
      XLSX.writeFile(
        workbook,
        `Coordinator_Performance_${filterLabel.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`
      );
    } catch (err) {
      console.error('Export error:', err);
    }
  };

  const hasActiveFilters =
    searchQuery.trim().length > 0 || achievementFilter !== 'all' || roleFilter !== 'all';

  const resetFilters = () => {
    setSearchQuery('');
    setAchievementFilter('all');
    setRoleFilter('all');
    setPage(1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-card-bg p-4 sm:p-5 rounded-xl border border-gray-100 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <UserCheck size={22} className="text-maroon" />
            <h1 className="text-xl sm:text-2xl font-bold text-text-main">
              Coordinator Performance &amp; Targets
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-text-muted mt-1">
            Track individual and team call targets, connected rates, talk-time, and conversion achievements
          </p>
        </div>

        {/* Date presets & Action controls */}
        <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
          <div className="flex items-center bg-gray-50/80 p-1 rounded-xl border border-gray-200">
            <button
              type="button"
              onClick={() => setDateFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'all'
                  ? 'bg-maroon text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              All Time
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('today')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                dateFilter === 'today'
                  ? 'bg-maroon text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('7days')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                dateFilter === '7days'
                  ? 'bg-maroon text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setDateFilter('30days')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                dateFilter === '30days'
                  ? 'bg-maroon text-white shadow-xs'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              30 Days
            </button>
          </div>

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={loading || filteredLeaderboard.length === 0}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 rounded-xl border border-emerald-200 transition-colors shadow-xs cursor-pointer disabled:opacity-40"
          >
            <FileSpreadsheet size={14} className="text-emerald-600" />
            <span>Excel</span>
          </button>

          {/* Refresh */}
          <button
            type="button"
            onClick={() => fetchPerformanceData(dateFilter, true)}
            disabled={loading || refreshing}
            className="p-2 rounded-xl text-text-muted hover:text-maroon hover:bg-maroon/5 border border-gray-200 bg-white transition-colors cursor-pointer shadow-xs disabled:opacity-50"
            title="Refresh performance data"
          >
            <RefreshCw size={15} className={refreshing ? 'animate-spin text-maroon' : ''} />
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} className="text-red-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchPerformanceData(dateFilter, true)}
            className="font-semibold text-red-900 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Summary KPI Cards - 3 Columns */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Average Daily Achievement */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Target Achievement</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {kpis.avgAchievement}%
            </div>
            <div className="text-xs text-text-muted mt-0.5">Team average daily progress</div>
          </div>
        </div>

        {/* Total Calls */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <PhoneCall size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Total Calls Made</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {kpis.totalCalls}
            </div>
            <div className="text-xs text-emerald-700 font-medium mt-0.5">
              {kpis.totalConnected} connected (
              {kpis.totalCalls > 0
                ? `${Math.round((kpis.totalConnected / kpis.totalCalls) * 100)}%`
                : '0%'}
              )
            </div>
          </div>
        </div>

        {/* Total Talk Time */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-gold/15 text-amber-700 flex items-center justify-center shrink-0">
            <Clock size={20} />
          </div>
          <div>
            <div className="text-sm font-medium text-text-muted">Total Talk Time</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {formatDuration(kpis.totalTalkTime)}
            </div>
            <div className="text-xs text-text-muted mt-0.5">
              Across {rawLeaderboard.length} active coordinators
            </div>
          </div>
        </div>
      </div>

      {/* Main Performance Table Card */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {/* Table Toolbar */}
        <div className="p-4 sm:p-5 border-b border-gray-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-bold text-text-main">Coordinator Leaderboard</h2>
            <span className="text-xs text-text-muted font-medium bg-gray-100 px-2.5 py-0.5 rounded-full">
              {filteredLeaderboard.length} coordinators
            </span>
          </div>

          {/* Search & Filter Controls */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            {/* Search Box */}
            <div className="relative flex-1 sm:w-56">
              <Search
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="Search coordinator..."
                className="w-full h-[40px] pl-9 pr-3 rounded-lg border border-gray-300 bg-white text-xs text-text-main placeholder:text-text-muted/60 focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold"
              />
            </div>

            {/* Achievement Filter */}
            <select
              value={achievementFilter}
              onChange={(e) => {
                setAchievementFilter(e.target.value as AchievementFilter);
                setPage(1);
              }}
              aria-label="Filter by achievement"
              className="h-[40px] px-3 rounded-lg border border-gray-300 bg-white text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold cursor-pointer"
            >
              <option value="all">All Achievements</option>
              <option value="achieved">Target Achieved (100%+)</option>
              <option value="in_progress">In Progress (&lt;100%)</option>
              <option value="zero">No Calls Yet (0%)</option>
            </select>

            {/* Role Filter */}
            <select
              value={roleFilter}
              onChange={(e) => {
                setRoleFilter(e.target.value);
                setPage(1);
              }}
              aria-label="Filter by role"
              className="h-[40px] px-3 rounded-lg border border-gray-300 bg-white text-xs text-text-main focus:outline-none focus:ring-2 focus:ring-gold focus:border-gold cursor-pointer"
            >
              <option value="all">All Roles</option>
              <option value="caller">Callers</option>
              <option value="admin">Admins</option>
            </select>

            {hasActiveFilters && (
              <button
                type="button"
                onClick={resetFilters}
                className="h-[40px] px-3 text-xs font-semibold text-maroon hover:bg-maroon/5 border border-maroon/20 rounded-lg transition-colors shrink-0 cursor-pointer"
              >
                Clear
              </button>
            )}

            <Link
              to="/admin/users"
              className="h-[40px] px-3.5 inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-maroon hover:bg-maroon-hover rounded-lg transition-colors shrink-0 shadow-xs cursor-pointer"
            >
              <span>Manage Targets</span>
              <ExternalLink size={12} />
            </Link>
          </div>
        </div>

        {/* Table Body */}
        {loading ? (
          <div className="py-16 text-center text-text-muted text-sm">
            <div className="w-7 h-7 rounded-full border-2 border-maroon border-t-transparent animate-spin mx-auto mb-3" />
            Loading coordinator performance data...
          </div>
        ) : filteredLeaderboard.length === 0 ? (
          <div className="py-16 text-center text-text-muted text-sm px-4">
            {hasActiveFilters
              ? 'No coordinators match your search or filter.'
              : 'No active coordinators found in the system.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead className="bg-gray-50/70 border-b border-gray-100 text-[11px] font-bold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5 whitespace-nowrap">User / Coordinator</th>
                  <th className="py-3 px-4 whitespace-nowrap">Daily Target Progress</th>
                  <th className="py-3 px-4 whitespace-nowrap">Weekly Target</th>
                  <th className="py-3 px-4 whitespace-nowrap">Connected</th>
                  <th className="py-3 px-4 whitespace-nowrap">Interested</th>
                  <th className="py-3 px-4 whitespace-nowrap">Talk Time</th>
                  <th className="py-3 px-4 whitespace-nowrap">Follow-ups</th>
                  <th className="py-3 px-4 text-center whitespace-nowrap">Assigned Contacts</th>
                  <th className="py-3 px-5 text-right whitespace-nowrap">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {paginatedList.map((caller) => {
                  const targetPct = Math.min(100, Math.round(caller.targetAchievementPercentage));
                  const isComplete = targetPct >= 100;
                  const connRate =
                    caller.callsCount > 0
                      ? Math.round((caller.connectedCount / caller.callsCount) * 100)
                      : 0;

                  return (
                    <tr key={caller.userId} className="hover:bg-page-bg/50 transition-colors">
                      {/* Coordinator Name & Email */}
                      <td className="py-3.5 px-5 min-w-[220px]">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-maroon/10 text-maroon font-bold text-xs flex items-center justify-center shrink-0">
                            {caller.fullName.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <div className="font-semibold text-text-main flex items-center gap-1.5 whitespace-nowrap">
                              {caller.fullName}
                              {caller.role === 'admin' && (
                                <span className="px-1.5 py-0.2 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                                  Admin
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-text-muted truncate">{caller.email}</div>
                          </div>
                        </div>
                      </td>

                      {/* Daily Target Progress Bar */}
                      <td className="py-3.5 px-4 min-w-[180px] whitespace-nowrap">
                        <div className="flex items-center justify-between text-xs mb-1">
                          <span className="font-semibold text-text-main">
                            {caller.callsCount} / {caller.dailyTarget} calls
                          </span>
                          <span className={`font-bold ${isComplete ? 'text-emerald-700' : 'text-maroon'}`}>
                            {targetPct}%
                          </span>
                        </div>
                        <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isComplete ? 'bg-emerald-600' : 'bg-maroon'
                            }`}
                            style={{ width: `${targetPct}%` }}
                          />
                        </div>
                      </td>

                      {/* Weekly Target */}
                      <td className="py-3.5 px-4 text-text-main font-medium whitespace-nowrap">
                        {caller.weeklyTarget} / wk
                      </td>

                      {/* Connected */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span className="text-emerald-700 font-semibold">{caller.connectedCount}</span>
                        <span className="text-xs text-text-muted ml-1">({connRate}%)</span>
                      </td>

                      {/* Interested */}
                      <td className="py-3.5 px-4 text-amber-700 font-semibold whitespace-nowrap">
                        {caller.interestedCount}
                      </td>

                      {/* Talk Time */}
                      <td className="py-3.5 px-4 text-text-muted whitespace-nowrap">
                        {formatDuration(caller.totalTalkTimeSeconds)}
                      </td>

                      {/* Follow-ups */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {caller.pendingFollowUpsCount > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                            <CalendarClock size={11} />
                            {caller.pendingFollowUpsCount} pending
                          </span>
                        ) : (
                          <span className="text-text-muted text-xs">—</span>
                        )}
                      </td>

                      {/* Assigned Contacts */}
                      <td className="py-3.5 px-4 text-center text-text-main font-semibold whitespace-nowrap">
                        {caller.totalAssignedContacts}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <Link
                          to={`/admin/calls?search=${encodeURIComponent(caller.fullName)}`}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-maroon hover:text-maroon-hover hover:underline"
                        >
                          <span>Calls</span>
                          <ExternalLink size={11} />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Footer */}
        {filteredLeaderboard.length > limit && (
          <div className="p-4 border-t border-gray-100 flex items-center justify-between text-xs text-text-muted">
            <span>
              Showing {(page - 1) * limit + 1} to{' '}
              {Math.min(page * limit, filteredLeaderboard.length)} of {filteredLeaderboard.length} coordinators
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Previous Page"
              >
                <ChevronLeft size={14} />
              </button>
              <span className="px-2 font-semibold text-text-main">
                {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-1.5 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                aria-label="Next Page"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
