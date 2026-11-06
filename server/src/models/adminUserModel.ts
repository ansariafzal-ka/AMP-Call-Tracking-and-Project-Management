import { pool } from '../config/db';
import { AdminUserRow, AdminCreateUserDTO, AdminUpdateUserDTO, AdminUserFilters } from '../types/admin';
import { hashPassword } from '../utils/passwords';

export async function getAdminUsers(
  filters: AdminUserFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ users: AdminUserRow[]; total: number }> {
  const result = await pool.query<AdminUserRow & { filtered_total: string }>(
    'SELECT * FROM sp_admin_get_users($1, $2, $3, $4, $5)',
    [
      filters.search ? filters.search.trim() : null,
      filters.role ? filters.role.trim() : null,
      filters.isActive !== undefined ? filters.isActive : null,
      limit,
      offset,
    ]
  );

  const users = result.rows;
  const total = users.length > 0 ? parseInt(users[0].filtered_total as any, 10) || 0 : 0;

  return { users, total };
}

export async function createAdminUser(data: AdminCreateUserDTO): Promise<number> {
  const passwordHash = await hashPassword(data.password);
  const result = await pool.query<{ insert_id: number }>(
    'SELECT * FROM sp_admin_create_user($1, $2, $3, $4, $5, $6, $7)',
    [
      data.fullName.trim(),
      data.email.trim().toLowerCase(),
      data.mobileNumber.trim(),
      passwordHash,
      data.role || 'caller',
      data.dailyTarget || 50,
      data.weeklyTarget || 250,
    ]
  );
  return result.rows[0]?.insert_id || 0;
}

export async function updateAdminUser(
  userId: number,
  data: AdminUpdateUserDTO
): Promise<AdminUserRow | null> {
  const result = await pool.query<AdminUserRow>(
    'SELECT * FROM sp_admin_update_user($1, $2, $3, $4, $5, $6, $7)',
    [
      userId,
      data.role || null,
      data.isActive !== undefined ? data.isActive : null,
      data.dailyTarget !== undefined ? data.dailyTarget : null,
      data.weeklyTarget !== undefined ? data.weeklyTarget : null,
      data.fullName ? data.fullName.trim() : null,
      data.mobileNumber ? data.mobileNumber.trim() : null,
    ]
  );
  return result.rows[0] || null;
}

