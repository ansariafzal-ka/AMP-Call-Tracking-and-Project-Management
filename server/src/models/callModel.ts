import { ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { pool } from '../config/db';
import {
  CallRow,
  SummaryRow,
  CallSummary,
  CreateCallDTO,
  UpdateCallDTO,
  CallFilters,
  GetCallsResult,
} from '../types/call';

export async function createCall(userId: number, data: CreateCallDTO): Promise<CallRow | null> {
  // Insert with INSERT IGNORE to prevent duplicates
  await pool.query<ResultSetHeader>(
    `INSERT IGNORE INTO calls (user_id, contact_number, duration_seconds, status, purpose, outcome, called_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      userId,
      data.contact_number,
      data.duration_seconds,
      data.status,
      data.purpose,
      data.outcome,
      data.called_at,
    ]
  );

  // Return the row
  const [rows] = await pool.query<CallRow[]>(
    `SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
     FROM calls
     WHERE user_id = ? AND called_at = ? AND contact_number = ?
     LIMIT 1`,
    [userId, data.called_at, data.contact_number]
  );

  return rows[0] || null;
}

export async function getCallSummary(userId: number): Promise<CallSummary> {
  const [summaryRows] = await pool.query<SummaryRow[]>(
    `SELECT COUNT(*) as total_calls, COALESCE(SUM(duration_seconds), 0) as total_duration_seconds
     FROM calls
     WHERE user_id = ?`,
    [userId]
  );

  return {
    total_calls: Number(summaryRows[0]?.total_calls || 0),
    total_duration_seconds: Number(summaryRows[0]?.total_duration_seconds || 0),
  };
}

export async function getCalls(
  userId: number,
  filters: CallFilters,
  limit: number,
  offset: number
): Promise<GetCallsResult> {
  const whereClauses: string[] = ['user_id = ?'];
  const whereParams: any[] = [userId];

  if (filters.search && filters.search.trim()) {
    whereClauses.push('(contact_number LIKE ? OR purpose LIKE ?)');
    const searchTerm = `%${filters.search.trim()}%`;
    whereParams.push(searchTerm, searchTerm);
  }

  if (filters.outcome) {
    if (filters.outcome === 'not_set') {
      whereClauses.push('outcome IS NULL');
    } else if (
      ['interested', 'not_interested', 'unanswered', 'follow_up_required'].includes(filters.outcome)
    ) {
      whereClauses.push('outcome = ?');
      whereParams.push(filters.outcome);
    }
  }

  if (filters.status && ['answered', 'not_answered'].includes(filters.status)) {
    whereClauses.push('status = ?');
    whereParams.push(filters.status);
  }

  const whereSql = whereClauses.join(' AND ');

  interface CountRow extends RowDataPacket {
    filtered_total: number | string;
  }

  const [countRows] = await pool.query<CountRow[]>(
    `SELECT COUNT(*) as filtered_total FROM calls WHERE ${whereSql}`,
    whereParams
  );
  const filtered_total = Number(countRows[0]?.filtered_total || 0);

  const [calls] = await pool.query<CallRow[]>(
    `SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
     FROM calls
     WHERE ${whereSql}
     ORDER BY called_at DESC
     LIMIT ? OFFSET ?`,
    [...whereParams, limit, offset]
  );

  return {
    calls,
    filtered_total,
  };
}

export async function findUserCallById(callId: number, userId: number): Promise<CallRow | null> {
  const [rows] = await pool.query<CallRow[]>(
    `SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
     FROM calls
     WHERE id = ? AND user_id = ?
     LIMIT 1`,
    [callId, userId]
  );

  return rows[0] || null;
}

export async function updateCall(
  callId: number,
  userId: number,
  data: UpdateCallDTO
): Promise<CallRow | null> {
  const updateClauses: string[] = [];
  const updateParams: any[] = [];

  if (data.purpose !== undefined) {
    updateClauses.push('purpose = ?');
    updateParams.push(data.purpose);
  }

  if (data.outcome !== undefined) {
    updateClauses.push('outcome = ?');
    updateParams.push(data.outcome);
  }

  if (updateClauses.length > 0) {
    updateParams.push(callId, userId);
    await pool.query<ResultSetHeader>(
      `UPDATE calls SET ${updateClauses.join(', ')} WHERE id = ? AND user_id = ?`,
      updateParams
    );
  }

  return findUserCallById(callId, userId);
}
