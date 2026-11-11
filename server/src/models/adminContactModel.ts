import { pool } from '../config/db';
import { AdminContactRow, AdminContactFilters, AssignContactsDTO, AdminUpdateContactDTO } from '../types/admin';

export async function getAdminContacts(
  filters: AdminContactFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ contacts: AdminContactRow[]; total: number }> {
  const result = await pool.query<AdminContactRow & { filtered_total: string }>(
    'SELECT * FROM sp_admin_get_contacts($1, $2, $3, $4, $5, $6, $7, $8)',
    [
      filters.search ? filters.search.trim() : null,
      filters.category ? filters.category.trim() : null,
      filters.city ? filters.city.trim() : null,
      filters.assignedUserId || null,
      filters.unassignedOnly || false,
      filters.projectId || null,
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

export interface BulkContactInput {
  name: string;
  mobile_number: string;
  alternate_number?: string | null;
  email?: string | null;
  city?: string | null;
  state?: string | null;
  pin_code?: string | null;
  category?: string;
  notes?: string | null;
  assigned_user_id?: number | null;
  project_id?: number | null;
}

export async function bulkImportContacts(contacts: BulkContactInput[]): Promise<{
  imported_count: number;
  assigned_count: number;
  unassigned_count: number;
}> {
  const result = await pool.query<{
    imported_count: number;
    assigned_count: number;
    unassigned_count: number;
  }>(
    'SELECT * FROM sp_admin_bulk_import_contacts($1::JSONB)',
    [JSON.stringify(contacts)]
  );
  return result.rows[0] || { imported_count: 0, assigned_count: 0, unassigned_count: 0 };
}

export async function updateContact(
  contactId: number,
  data: AdminUpdateContactDTO
): Promise<any> {
  const projectIds = data.project_ids && Array.isArray(data.project_ids)
    ? data.project_ids
    : data.project_id
    ? [data.project_id]
    : null;

  const result = await pool.query(
    'SELECT * FROM sp_admin_update_contact($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)',
    [
      contactId,
      data.name,
      data.mobile_number,
      data.alternate_number || null,
      data.email || null,
      data.city || null,
      data.state || null,
      data.pin_code || null,
      data.category || 'Other',
      data.notes || null,
      data.project_id || (projectIds && projectIds.length > 0 ? projectIds[0] : null),
      data.assigned_user_id || null,
      projectIds,
    ]
  );
  return result.rows[0] || null;
}


