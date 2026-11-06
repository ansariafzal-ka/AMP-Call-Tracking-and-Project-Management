import { pool } from '../config/db';
import { AdminDashboardSummary, AdminCallerLeaderboardItem } from '../types/admin';

export async function getAdminDashboardSummary(
  startDate?: string,
  endDate?: string,
  userId?: number
): Promise<AdminDashboardSummary> {
  const result = await pool.query<{
    total_calls: string;
    connected_calls: string;
    connected_rate: string;
    interested_calls: string;
    interested_rate: string;
    total_talk_time_seconds: string;
    pending_follow_ups: string;
    overdue_follow_ups: string;
    today_follow_ups: string;
    active_callers_count: string;
    total_callers_count: string;
  }>('SELECT * FROM sp_admin_dashboard_summary($1, $2, $3)', [
    startDate || null,
    endDate || null,
    userId || null,
  ]);

  const row = result.rows[0];
  return {
    totalCalls: parseInt(row?.total_calls || '0', 10),
    connectedCalls: parseInt(row?.connected_calls || '0', 10),
    connectedRate: parseFloat(row?.connected_rate || '0.0'),
    interestedCalls: parseInt(row?.interested_calls || '0', 10),
    interestedRate: parseFloat(row?.interested_rate || '0.0'),
    totalTalkTimeSeconds: parseInt(row?.total_talk_time_seconds || '0', 10),
    pendingFollowUps: parseInt(row?.pending_follow_ups || '0', 10),
    overdueFollowUps: parseInt(row?.overdue_follow_ups || '0', 10),
    todayFollowUps: parseInt(row?.today_follow_ups || '0', 10),
    activeCallersCount: parseInt(row?.active_callers_count || '0', 10),
    totalCallersCount: parseInt(row?.total_callers_count || '0', 10),
  };
}

export async function getAdminCallerLeaderboard(
  startDate?: string,
  endDate?: string,
  limit: number = 20,
  offset: number = 0
): Promise<AdminCallerLeaderboardItem[]> {
  const result = await pool.query<{
    user_id: number;
    full_name: string;
    email: string;
    role: string;
    is_active: boolean;
    daily_target: number;
    weekly_target: number;
    calls_count: string;
    connected_count: string;
    interested_count: string;
    total_talk_time_seconds: string;
    target_achievement_percentage: string;
    pending_follow_ups_count: string;
    total_assigned_contacts: string;
  }>('SELECT * FROM sp_admin_dashboard_leaderboard($1, $2, $3, $4)', [
    startDate || null,
    endDate || null,
    limit,
    offset,
  ]);

  return result.rows.map((row) => ({
    userId: row.user_id,
    fullName: row.full_name,
    email: row.email,
    role: row.role,
    isActive: row.is_active,
    dailyTarget: row.daily_target,
    weeklyTarget: row.weekly_target,
    callsCount: parseInt(row.calls_count || '0', 10),
    connectedCount: parseInt(row.connected_count || '0', 10),
    interestedCount: parseInt(row.interested_count || '0', 10),
    totalTalkTimeSeconds: parseInt(row.total_talk_time_seconds || '0', 10),
    targetAchievementPercentage: parseFloat(row.target_achievement_percentage || '0.0'),
    pendingFollowUpsCount: parseInt(row.pending_follow_ups_count || '0', 10),
    totalAssignedContacts: parseInt(row.total_assigned_contacts || '0', 10),
  }));
}

