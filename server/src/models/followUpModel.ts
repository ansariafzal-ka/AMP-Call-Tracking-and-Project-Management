import { pool } from '../config/db';
import { FollowUpRow, FollowUpSummaryCounts, CreateFollowUpDTO } from '../types/followUp';

export async function getCategorizedFollowUps(
  userId: number,
  filter: string = 'all',
  limit: number = 20,
  offset: number = 0
): Promise<{ followUps: FollowUpRow[]; counts: FollowUpSummaryCounts; total: number }> {
  const result = await pool.query<FollowUpRow & {
    today_count: string;
    overdue_count: string;
    upcoming_count: string;
    completed_count: string;
    filtered_total: string;
  }>(
    'SELECT * FROM sp_followup_get_categorized($1, $2, $3, $4)',
    [userId, filter, limit, offset]
  );

  const rows = result.rows;
  const first = rows[0];

  const counts: FollowUpSummaryCounts = {
    today: parseInt(first?.today_count as any || '0', 10),
    overdue: parseInt(first?.overdue_count as any || '0', 10),
    upcoming: parseInt(first?.upcoming_count as any || '0', 10),
    completed: parseInt(first?.completed_count as any || '0', 10),
  };

  const total = rows.length > 0 ? parseInt(first?.filtered_total as any || '0', 10) : 0;

  return { followUps: rows, counts, total };
}

export async function createFollowUp(
  userId: number,
  data: CreateFollowUpDTO
): Promise<number> {
  const result = await pool.query<{ insert_id: number }>(
    'SELECT * FROM sp_followup_create($1, $2, $3, $4, $5)',
    [
      userId,
      data.contactId,
      data.callId || null,
      data.dueAt,
      data.notes ? data.notes.trim() : null,
    ]
  );
  return result.rows[0]?.insert_id || 0;
}

export async function completeFollowUp(
  followUpId: number,
  userId: number,
  notes?: string
): Promise<boolean> {
  const result = await pool.query<{ affected_rows: number }>(
    'SELECT * FROM sp_followup_complete($1, $2, $3)',
    [followUpId, userId, notes ? notes.trim() : null]
  );
  return (result.rows[0]?.affected_rows || 0) > 0;
}

export async function rescheduleFollowUp(
  followUpId: number,
  userId: number,
  newDueAt: string,
  notes?: string
): Promise<boolean> {
  const result = await pool.query<{ affected_rows: number }>(
    'SELECT * FROM sp_followup_reschedule($1, $2, $3, $4)',
    [followUpId, userId, newDueAt, notes ? notes.trim() : null]
  );
  return (result.rows[0]?.affected_rows || 0) > 0;
}

