import { pool } from '../config/db';
import { AdminContactRow, AdminContactFilters, AssignContactsDTO } from '../types/admin';

export async function getAdminContacts(
  filters: AdminContactFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ contacts: AdminContactRow[]; total: number }> {
  const result = await pool.query<AdminContactRow & { filtered_total: string }>(
    'SELECT * FROM sp_admin_get_contacts($1, $2, $3, $4, $5, $6, $7)',
    [
      filters.search ? filters.search.trim() : null,
      filters.category ? filters.category.trim() : null,
      filters.city ? filters.city.trim() : null,
      filters.assignedUserId || null,
      filters.unassignedOnly || false,
      limit,
      offset,
    ]
  );

  const contacts = result.rows;
  const total = contacts.length > 0 ? parseInt(contacts[0].filtered_total as any, 10) || 0 : 0;

  return { contacts, total };
}

export async function assignContacts(data: AssignContactsDTO): Promise<number> {
  const result = await pool.query<{ assigned_count: number }>(
    'SELECT * FROM sp_admin_assign_contacts($1, $2, $3)',
    [
      data.contactIds,
      data.targetUserId,
      data.reassignFollowUps !== undefined ? data.reassignFollowUps : true,
    ]
  );
  return result.rows[0]?.assigned_count || 0;
}

