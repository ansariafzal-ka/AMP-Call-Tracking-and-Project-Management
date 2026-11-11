import React, { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  PhoneCall,
  CheckCircle2,
  HeartHandshake,
  CalendarClock,
  FolderKanban,
  RefreshCw,
  AlertCircle,
  FileSpreadsheet,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import apiClient from '../api/client';
import { formatDuration } from '../utils/format';
import type { AdminDashboardData, Project } from '../types';

type DateFilter = 'today' | '7days' | '30days' | 'all';

export const AdminDashboardPage: React.FC = () => {
  const [data, setData] = useState<AdminDashboardData | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = useCallback(async (filter: DateFilter, isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
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
      const [dashRes, projRes] = await Promise.all([
        apiClient.get<{ success: boolean; data: AdminDashboardData }>('/api/admin/dashboard', {
          params: { startDate },
        }),
        apiClient.get<{ success: boolean; data: { projects: any[] } }>('/api/admin/projects'),
      ]);

      if (dashRes.data?.data) {
        setData(dashRes.data.data);
      }
      if (projRes.data?.data?.projects) {
        setProjects(projRes.data.data.projects);
      }
    } catch (err: any) {
      console.error('Failed to load admin dashboard:', err);
      setError(err?.response?.data?.message || 'Failed to load team analytics. Please try again.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData(dateFilter);
  }, [dateFilter, fetchDashboardData]);

  const summary = data?.summary;
  const leaderboard = data?.leaderboard || [];

  const handleExportDashboardExcel = () => {
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

      // 1. KPI Overview Summary Sheet
      const summaryRows = [
        { Metric: 'Reporting Timeframe', Value: filterLabel },
        { Metric: 'Report Generated At', Value: new Date().toLocaleString('en-IN') },
        { Metric: 'Total Calls by Team', Value: Number(summary?.totalCalls || 0) },
        { Metric: 'Connected Calls', Value: Number(summary?.connectedCalls || 0) },
        { Metric: 'Connected Rate (%)', Value: `${summary?.connectedRate || 0}%` },
        { Metric: 'Interested Leads', Value: Number(summary?.interestedCalls || 0) },
        { Metric: 'Conversion Rate (%)', Value: `${summary?.interestedRate || 0}%` },
        { Metric: 'Total Talk Time', Value: formatDuration(summary?.totalTalkTimeSeconds || 0) },
        { Metric: 'Pending Follow-ups', Value: Number(summary?.pendingFollowUps || 0) },
        { Metric: 'Overdue Follow-ups', Value: Number(summary?.overdueFollowUps || 0) },
        { Metric: 'Due Today Follow-ups', Value: Number(summary?.todayFollowUps || 0) },
        { Metric: 'Active Callers', Value: Number(summary?.activeCallersCount || 0) },
        { Metric: 'Total Callers in System', Value: Number(summary?.totalCallersCount || 0) },
      ];
      const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
      summarySheet['!cols'] = [{ wch: 28 }, { wch: 32 }];
      XLSX.utils.book_append_sheet(workbook, summarySheet, 'Executive Summary');

      // 2. Coordinator Performance Leaderboard Sheet
      if (leaderboard.length > 0) {
        const callerRows = leaderboard.map((caller) => ({
          'Coordinator': caller.fullName,
          'Email': caller.email,
          'Role': caller.role,
          'Daily Target': caller.dailyTarget,
          'Calls Made Today': caller.callsCount,
          'Target Achievement %': `${Math.round(caller.targetAchievementPercentage)}%`,
          'Weekly Target': caller.weeklyTarget,
          'Connected Calls': caller.connectedCount,
          'Interested Leads': caller.interestedCount,
          'Talk Time': formatDuration(caller.totalTalkTimeSeconds || 0),
          'Pending Follow-ups': caller.pendingFollowUpsCount,
          'Assigned Contacts': caller.totalAssignedContacts,
        }));
        const callerSheet = XLSX.utils.json_to_sheet(callerRows);
        callerSheet['!cols'] = [
          { wch: 22 },
          { wch: 26 },
          { wch: 10 },
          { wch: 14 },
          { wch: 18 },
          { wch: 22 },
          { wch: 14 },
          { wch: 16 },
          { wch: 16 },
          { wch: 14 },
          { wch: 18 },
          { wch: 18 },
        ];
        XLSX.utils.book_append_sheet(workbook, callerSheet, 'Coordinators');
      }

      // 3. Campaign / Project Performance Sheet
      if (projects.length > 0) {
        const projectRows = projects.map((p: any) => {
          const calls = parseInt(p.total_calls_made || '0', 10);
          const contacts = parseInt(p.total_contacts || '0', 10);
          const percent = contacts > 0 ? Math.min(100, Math.round((calls / contacts) * 100)) : 0;
          return {
            'Project Name': p.name,
            'Description': p.description || '',
            'Status': p.status,
            'Assigned Callers': parseInt(p.total_callers || '0', 10),
            'Total Contacts': contacts,
            'Calls Made': calls,
            'Connected Calls': parseInt(p.connected_calls || '0', 10),
            'Coverage Progress %': `${percent}%`,
          };
        });
        const projectSheet = XLSX.utils.json_to_sheet(projectRows);
        projectSheet['!cols'] = [
          { wch: 24 },
          { wch: 32 },
          { wch: 10 },
          { wch: 16 },
          { wch: 14 },
          { wch: 12 },
          { wch: 14 },
          { wch: 20 },
        ];
        XLSX.utils.book_append_sheet(workbook, projectSheet, 'Projects & Campaigns');
      }

      const dateStr = new Date().toISOString().split('T')[0];
      const filename = `AMP_Team_Performance_${filterLabel.replace(/\s+/g, '_')}_${dateStr}.xlsx`;
      XLSX.writeFile(workbook, filename);
    } catch (err) {
      console.error('Failed to export dashboard report to Excel:', err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Date Filter Bar */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold text-text-main tracking-tight">
              Admin Overview &amp; Team Performance
            </h1>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gold/15 text-amber-800">
              Admin View
            </span>
          </div>
          <p className="text-sm text-text-muted mt-1">
            Real-time calling metrics across all AMP projects, campaigns, and coordinators
          </p>
        </div>

        {/* Date Filter & Refresh Controls */}
        <div className="flex items-center gap-1.5 bg-card-bg p-1.5 rounded-xl shadow-sm border border-gray-100 self-start md:self-auto">
          <button
            type="button"
            onClick={() => setDateFilter('all')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              dateFilter === 'all'
                ? 'bg-maroon text-white shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-black/5'
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
                : 'text-text-muted hover:text-text-main hover:bg-black/5'
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
                : 'text-text-muted hover:text-text-main hover:bg-black/5'
            }`}
          >
            Last 7 Days
          </button>
          <button
            type="button"
            onClick={() => setDateFilter('30days')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
              dateFilter === '30days'
                ? 'bg-maroon text-white shadow-xs'
                : 'text-text-muted hover:text-text-main hover:bg-black/5'
            }`}
          >
            Last 30 Days
          </button>

          <div className="w-px h-5 bg-gray-200 mx-1" />

          {/* Export to Excel */}
          <button
            type="button"
            onClick={handleExportDashboardExcel}
            disabled={loading || !data}
            title="Download Performance Report in Excel"
            aria-label="Download Performance Report in Excel"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100/80 rounded-lg border border-emerald-200 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FileSpreadsheet size={13} className="text-emerald-600" />
            <span>Excel</span>
          </button>

          <button
            type="button"
            onClick={() => fetchDashboardData(dateFilter, true)}
            disabled={loading || refreshing}
            title="Refresh data"
            aria-label="Refresh data"
            className="p-1.5 rounded-lg text-text-muted hover:text-maroon hover:bg-maroon/5 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin text-maroon' : ''} />
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
            onClick={() => fetchDashboardData(dateFilter, true)}
            className="font-semibold text-red-900 underline hover:no-underline cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 4 Team KPI Cards (matching user dashboard styling: bg-card-bg rounded-xl shadow-sm border border-gray-100) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Calls */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-maroon/10 text-maroon flex items-center justify-center shrink-0">
            <PhoneCall size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-muted">Total Calls by Team</div>
            <div className="text-2xl font-bold text-text-main mt-0.5">
              {loading ? '—' : (summary?.totalCalls ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-text-muted mt-0.5 truncate">
              {summary?.activeCallersCount ?? 0} active callers
            </div>
          </div>
        </div>

        {/* Connected Calls */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
            <CheckCircle2 size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-muted">Connected</div>
            <div className="text-2xl font-bold text-emerald-700 mt-0.5">
              {loading ? '—' : (summary?.connectedCalls ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-emerald-600 mt-0.5 font-medium truncate">
              {summary?.connectedRate ?? 0}% rate
            </div>
          </div>
        </div>

        {/* Interested Contacts */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-gold/15 text-amber-700 flex items-center justify-center shrink-0">
            <HeartHandshake size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-muted">Interested</div>
            <div className="text-2xl font-bold text-amber-700 mt-0.5">
              {loading ? '—' : (summary?.interestedCalls ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-amber-700 mt-0.5 font-medium truncate">
              {summary?.interestedRate ?? 0}% conversion
            </div>
          </div>
        </div>

        {/* Pending Follow-ups */}
        <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            <CalendarClock size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-text-muted">Follow-ups</div>
            <div className="text-2xl font-bold text-blue-700 mt-0.5">
              {loading ? '—' : (summary?.pendingFollowUps ?? 0).toLocaleString()}
            </div>
            <div className="text-xs text-blue-600 mt-0.5 font-medium truncate">
              {summary?.overdueFollowUps ?? 0} overdue &bull; {summary?.todayFollowUps ?? 0} today
            </div>
          </div>
        </div>
      </div>

      {/* Section 1: Project-wise Calling Performance */}
      <div className="bg-card-bg rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <FolderKanban size={18} className="text-maroon" />
            <h2 className="text-base font-bold text-text-main">
              Project-wise Calling Performance
            </h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-text-muted hidden sm:inline">
              {projects.length} {projects.length === 1 ? 'campaign' : 'campaigns'}
            </span>
            <Link
              to="/admin/projects"
              className="text-xs font-semibold text-maroon hover:underline flex items-center gap-1 cursor-pointer"
            >
              Manage Projects &rarr;
            </Link>
          </div>
        </div>

        {loading ? (
          <div className="p-8 text-center text-text-muted text-sm">Loading projects performance...</div>
        ) : projects.length === 0 ? (
          <div className="p-8 text-center text-text-muted text-sm">
            No projects found.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50/50 border-b border-gray-100 text-[11px] font-semibold text-text-muted uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-5 whitespace-nowrap">Project Name</th>
                  <th className="py-3 px-4 whitespace-nowrap">Status</th>
                  <th className="py-3 px-4 whitespace-nowrap">Assigned Callers</th>
                  <th className="py-3 px-4 whitespace-nowrap">Total Contacts</th>
                  <th className="py-3 px-4 whitespace-nowrap">Calls Made</th>
                  <th className="py-3 px-4 whitespace-nowrap">Connected</th>
                  <th className="py-3 px-5 text-right whitespace-nowrap">Progress</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {projects.map((proj: any) => {
                  const calls = parseInt(proj.total_calls_made || '0', 10);
                  const connected = parseInt(proj.connected_calls || '0', 10);
                  const contacts = parseInt(proj.total_contacts || '0', 10);
                  const callers = parseInt(proj.total_callers || '0', 10);
                  const reached = parseInt(proj.contacts_reached || '0', 10);
                  const percent = contacts > 0 ? Math.min(100, Math.round((reached / contacts) * 100)) : 0;

                  return (
                    <tr key={proj.id} className="hover:bg-page-bg/40 transition-colors">
                      <td className="py-3.5 px-5 min-w-[220px]">
                        <div className="font-semibold text-text-main">{proj.name}</div>
                        {proj.description && (
                          <div className="text-xs text-text-muted truncate max-w-xs mt-0.5">
                            {proj.description}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium capitalize whitespace-nowrap ${
                            proj.status === 'active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : proj.status === 'completed'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {proj.status}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-text-main font-medium whitespace-nowrap">
                        {callers} {callers === 1 ? 'Caller' : 'Callers'}
                      </td>
                      <td className="py-3.5 px-4 text-text-main font-medium whitespace-nowrap">
                        {contacts}
                      </td>
                      <td className="py-3.5 px-4 font-semibold text-text-main whitespace-nowrap">
                        {calls}
                      </td>
                      <td className="py-3.5 px-4 text-emerald-700 font-semibold whitespace-nowrap">
                        {connected} {calls > 0 ? `(${Math.round((connected / calls) * 100)}%)` : ''}
                      </td>
                      <td className="py-3.5 px-5 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-2">
                          <div className="w-20 bg-gray-100 h-2 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-maroon rounded-full transition-all duration-300"
                              style={{ width: `${percent}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-text-main w-8 text-right">
                            {percent}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
