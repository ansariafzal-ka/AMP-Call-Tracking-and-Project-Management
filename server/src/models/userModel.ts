import { pool } from '../config/db';
import { UserRow, RegisterDTO, UserStats } from '../types/user';

export async function findByEmail(email: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM sp_user_find_by_email($1)',
    [email]
  );
  return result.rows[0] || null;
}

export async function findByEmailOrMobile(email: string, mobile: string): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM sp_user_find_by_email_or_mobile($1, $2)',
    [email, mobile]
  );
  return result.rows[0] || null;
}

export async function findById(id: number): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM sp_user_find_by_id($1)',
    [id]
  );
  return result.rows[0] || null;
}

export async function findWithPasswordById(id: number): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM sp_user_find_with_password_by_id($1)',
    [id]
  );
  return result.rows[0] || null;
}

export async function createUser(data: RegisterDTO): Promise<number> {
  const result = await pool.query<{ insertid?: number; insertId?: number }>(
    'SELECT * FROM sp_user_create($1, $2, $3, $4)',
    [data.fullName, data.email, data.mobileNumber, data.passwordHash]
  );
  return result.rows[0]?.insertid || result.rows[0]?.insertId || 0;
}

export async function updatePassword(id: number, passwordHash: string): Promise<boolean> {
  const result = await pool.query<{ affectedrows?: number; affectedRows?: number }>(
    'SELECT * FROM sp_user_update_password($1, $2)',
    [id, passwordHash]
  );
  const count = result.rows[0]?.affectedrows ?? result.rows[0]?.affectedRows ?? 0;
  return count > 0;
}

export async function getUserStats(
  userId: number,
  startDate?: string,
  endDate?: string
): Promise<UserStats> {
  const result = await pool.query<{
    total_assigned_contacts: string;
    calls_made_today: string;
    connected_calls_today: string;
    total_talk_time_today_seconds: string;
    pending_follow_ups: string;
    total_calls_all_time: string;
  }>('SELECT * FROM sp_user_get_stats($1, $2, $3)', [
    userId,
    startDate || null,
    endDate || null,
  ]);

  const row = result.rows[0];
  return {
    totalAssignedContacts: parseInt(row?.total_assigned_contacts || '0', 10),
    callsMadeToday: parseInt(row?.calls_made_today || '0', 10),
    connectedCallsToday: parseInt(row?.connected_calls_today || '0', 10),
    totalTalkTimeTodaySeconds: parseInt(row?.total_talk_time_today_seconds || '0', 10),
    pendingFollowUps: parseInt(row?.pending_follow_ups || '0', 10),
    totalCallsAllTime: parseInt(row?.total_calls_all_time || '0', 10),
  };
}

export async function updateProfile(
  userId: number,
  fullName?: string,
  mobileNumber?: string
): Promise<UserRow | null> {
  const result = await pool.query<UserRow>(
    'SELECT * FROM sp_user_update_profile($1, $2, $3)',
    [userId, fullName || null, mobileNumber || null]
  );
  return result.rows[0] || null;
}
