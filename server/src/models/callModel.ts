import { pool } from '../config/db';
import {
  CallRow,
  CallSummary,
  CreateCallDTO,
  UpdateCallDTO,
  CallFilters,
  GetCallsResult,
} from '../types/call';

export async function createCall(userId: number, data: CreateCallDTO): Promise<CallRow | null> {
  const result = await pool.query<CallRow>(
    'SELECT * FROM sp_call_create($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      userId,
      data.contact_number,
      data.duration_seconds,
      data.status,
      data.purpose,
      data.outcome,
      data.called_at,
      data.follow_up_date || null,
    ]
  );
  return result.rows[0] || null;
}

export async function getCallSummary(userId: number): Promise<CallSummary> {
  const result = await pool.query<{ total_calls: string | number; total_duration_seconds: string | number }>(
    'SELECT * FROM sp_call_get_summary($1)',
    [userId]
  );
  const row = result.rows[0];
  return {
    total_calls: Number(row?.total_calls || 0),
    total_duration_seconds: Number(row?.total_duration_seconds || 0),
  };
}

export async function getCalls(
  userId: number,
  filters: CallFilters,
  limit: number,
  offset: number
): Promise<GetCallsResult> {
  const searchParam = filters.search && filters.search.trim() ? filters.search.trim() : null;
  const outcomeParam = filters.outcome ? filters.outcome : null;
  const statusParam = filters.status ? filters.status : null;

  // In PostgreSQL function sp_call_get_paginated returns all columns plus filtered_total column
  const result = await pool.query<CallRow & { filtered_total: number | string }>(
    'SELECT * FROM sp_call_get_paginated($1, $2, $3, $4, $5, $6)',
    [userId, searchParam, outcomeParam, statusParam, limit, offset]
  );

  const rows = result.rows;
  const total = rows.length > 0 ? Number(rows[0].filtered_total) : 0;

  return {
    calls: rows,
    filtered_total: total,
  };
}

export async function findUserCallById(callId: number, userId: number): Promise<CallRow | null> {
  const result = await pool.query<CallRow>(
    'SELECT * FROM sp_call_find_by_id($1, $2)',
    [callId, userId]
  );
  return result.rows[0] || null;
}

export async function updateCall(
  callId: number,
  userId: number,
  data: UpdateCallDTO
): Promise<CallRow | null> {
  const hasPurpose = data.purpose !== undefined;
  const hasOutcome = data.outcome !== undefined;
  const hasFollowUpDate = data.follow_up_date !== undefined;

  const purposeVal = hasPurpose ? data.purpose : null;
  const outcomeVal = hasOutcome ? data.outcome : null;
  const followUpDateVal = hasFollowUpDate ? data.follow_up_date : null;

  const result = await pool.query<CallRow>(
    'SELECT * FROM sp_call_update($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      callId,
      userId,
      purposeVal,
      outcomeVal,
      followUpDateVal,
      hasPurpose,
      hasOutcome,
      hasFollowUpDate,
    ]
  );
  return result.rows[0] || null;
}
