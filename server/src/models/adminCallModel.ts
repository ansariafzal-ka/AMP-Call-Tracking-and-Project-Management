import { pool } from '../config/db';
import { AdminCallRow, AdminCallFilters } from '../types/admin';

export async function getAdminCalls(
  filters: AdminCallFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{
  calls: AdminCallRow[];
  total: number;
  totalDurationSeconds: number;
  connectedCallsCount: number;
}> {
  const result = await pool.query<AdminCallRow & {
    filtered_total: string;
    total_duration_filtered: string;
    connected_calls_filtered: string;
  }>(
    'SELECT * FROM sp_admin_get_calls($1, $2, $3, $4, $5, $6, $7, $8, $9)',
    [
      filters.search ? filters.search.trim() : null,
      filters.userId || null,
      filters.projectId || null,
      filters.status ? filters.status.trim() : null,
      filters.outcome ? filters.outcome.trim() : null,
      filters.startDate ? new Date(filters.startDate).toISOString() : null,
      filters.endDate ? new Date(filters.endDate).toISOString() : null,
      limit,
      offset,
    ]
  );

  const calls = result.rows;
  const total = calls.length > 0 ? parseInt(calls[0].filtered_total as any, 10) || 0 : 0;
  const totalDurationSeconds = calls.length > 0 ? parseInt(calls[0].total_duration_filtered as any, 10) || 0 : 0;
  const connectedCallsCount = calls.length > 0 ? parseInt(calls[0].connected_calls_filtered as any, 10) || 0 : 0;

  return {
    calls,
    total,
    totalDurationSeconds,
    connectedCallsCount,
  };
}

