import { pool } from '../config/db';
import { AdminContactRow, AdminContactFilters, AssignContactsDTO, AdminUpdateContactDTO } from '../types/admin';

export async function getAdminContacts(
  filters: AdminContactFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ contacts: AdminContactRow[]; total: number }> {
  // If state filter is specified, execute parameterized query with state matching
  if (filters.state && filters.state.trim() && filters.state.toLowerCase() !== 'all') {
    const whereClauses: string[] = ['1=1'];
    const params: any[] = [];
    let pIdx = 1;

    // State filter
    whereClauses.push(`ct.state ILIKE $${pIdx}`);
    params.push(filters.state.trim());
    pIdx++;

    // Search filter
    if (filters.search && filters.search.trim()) {
      whereClauses.push(`(
        ct.name ILIKE $${pIdx}
        OR ct.mobile_number ILIKE $${pIdx}
        OR ct.city ILIKE $${pIdx}
        OR ct.state ILIKE $${pIdx}
        OR ct.pin_code ILIKE $${pIdx}
        OR ct.notes ILIKE $${pIdx}
      )`);
      params.push(`%${filters.search.trim()}%`);
      pIdx++;
    }

    // Category filter
    if (filters.category && filters.category.trim() && filters.category.toLowerCase() !== 'all') {
      whereClauses.push(`ct.category ILIKE $${pIdx}`);
      params.push(filters.category.trim());
      pIdx++;
    }

    // City filter
    if (filters.city && filters.city.trim()) {
      whereClauses.push(`ct.city ILIKE $${pIdx}`);
      params.push(filters.city.trim());
      pIdx++;
    }

    // Assignment filter
    if (filters.unassignedOnly) {
      whereClauses.push(`ct.assigned_user_id IS NULL`);
    } else if (filters.assignedUserId) {
      whereClauses.push(`ct.assigned_user_id = $${pIdx}`);
      params.push(filters.assignedUserId);
      pIdx++;
    }

    // Project filter
    if (filters.projectId) {
      whereClauses.push(`(
        ct.project_id = $${pIdx}
        OR EXISTS (SELECT 1 FROM contact_projects cp WHERE cp.contact_id = ct.id AND cp.project_id = $${pIdx})
      )`);
      params.push(filters.projectId);
      pIdx++;
    }

    const whereSql = whereClauses.join(' AND ');

    const countQuery = `
      SELECT COUNT(*)::INT as total
      FROM contacts ct
      WHERE ${whereSql}
    `;
    const countRes = await pool.query<{ total: number }>(countQuery, params);
    const total = countRes.rows[0]?.total || 0;

    if (total === 0) {
      return { contacts: [], total: 0 };
    }

    const dataParams = [...params, limit, offset];
    const limitIdx = pIdx++;
    const offsetIdx = pIdx++;

    const dataQuery = `
      SELECT
        ct.id,
        ct.name,
        ct.mobile_number,
        ct.alternate_number,
        ct.email,
        ct.city,
        ct.state,
        ct.pin_code,
        ct.category,
        ct.notes,
        ct.created_at,
        ct.assigned_user_id,
        u.full_name AS assigned_user_name,
        u.email AS assigned_user_email,
        ct.project_id,
        p.name AS project_name,
        COALESCE(pr_agg.project_ids, ARRAY[]::INT[]) AS project_ids,
        COALESCE(pr_agg.project_names, '')::TEXT AS project_names,
        COALESCE(pr_agg.projects_json, '[]'::JSON) AS projects,
        COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
        cs.last_called_at,
        cs.last_call_status::VARCHAR AS last_call_status,
        cs.last_call_outcome::VARCHAR AS last_call_outcome,
        ${total}::BIGINT AS filtered_total
      FROM contacts ct
      LEFT JOIN users u ON u.id = ct.assigned_user_id
      LEFT JOIN projects p ON p.id = ct.project_id
      LEFT JOIN LATERAL (
        SELECT
          ARRAY_AGG(p2.id ORDER BY p2.name) AS project_ids,
          STRING_AGG(p2.name, ', ' ORDER BY p2.name) AS project_names,
          JSON_AGG(JSON_BUILD_OBJECT('id', p2.id, 'name', p2.name) ORDER BY p2.name) AS projects_json
        FROM (
          SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = ct.id
          UNION
          SELECT ct.project_id WHERE ct.project_id IS NOT NULL
        ) cp_all
        JOIN projects p2 ON p2.id = cp_all.project_id
      ) pr_agg ON TRUE
      LEFT JOIN LATERAL (
        SELECT
          COUNT(c.id) AS total_calls,
          MAX(c.called_at) AS last_called_at,
          (SELECT c2.status FROM calls c2 WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number) ORDER BY c2.called_at DESC LIMIT 1) AS last_call_status,
          (SELECT c3.outcome FROM calls c3 WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number) ORDER BY c3.called_at DESC LIMIT 1) AS last_call_outcome
        FROM calls c
        WHERE c.contact_id = ct.id OR c.contact_number = ct.mobile_number
      ) cs ON TRUE
      WHERE ${whereSql}
      ORDER BY ct.created_at DESC
      LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;

    const dataRes = await pool.query<AdminContactRow & { filtered_total: string }>(dataQuery, dataParams);
    return { contacts: dataRes.rows, total };
  }

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

export interface StateSummaryRow {
  state: string;
  total_count: number;
  unassigned_count: number;
}

export async function getStatesSummary(projectId?: number): Promise<StateSummaryRow[]> {
  let query = `
    SELECT 
      ct.state, 
      COUNT(*)::INT as total_count,
      COUNT(*) FILTER (WHERE ct.assigned_user_id IS NULL)::INT as unassigned_count
    FROM contacts ct
  `;
  const params: any[] = [];
  if (projectId) {
    query += `
      LEFT JOIN contact_projects cp ON cp.contact_id = ct.id
      WHERE (ct.project_id = $1 OR cp.project_id = $1)
        AND ct.state IS NOT NULL AND TRIM(ct.state) != ''
    `;
    params.push(projectId);
  } else {
    query += `
      WHERE ct.state IS NOT NULL AND TRIM(ct.state) != ''
    `;
  }
  query += `
    GROUP BY ct.state
    ORDER BY ct.state ASC;
  `;

  const result = await pool.query<StateSummaryRow>(query, params);
  return result.rows;
}

export interface AssignByStateDTO {
  state: string;
  targetUserId: number;
  unassignedOnly?: boolean;
  projectId?: number;
  reassignFollowUps?: boolean;
}

export async function assignContactsByState(data: AssignByStateDTO): Promise<number> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    let selectQuery = `
      SELECT DISTINCT ct.id 
      FROM contacts ct
    `;
    const params: any[] = [data.state.trim()];
    let paramIndex = 2;

    if (data.projectId) {
      selectQuery += `
        LEFT JOIN contact_projects cp ON cp.contact_id = ct.id
        WHERE ct.state ILIKE $1
          AND (ct.project_id = $${paramIndex} OR cp.project_id = $${paramIndex})
      `;
      params.push(data.projectId);
      paramIndex++;
    } else {
      selectQuery += `
        WHERE ct.state ILIKE $1
      `;
    }

    if (data.unassignedOnly !== false) {
      selectQuery += ` AND ct.assigned_user_id IS NULL`;
    }

    const idResult = await client.query<{ id: number }>(selectQuery, params);
    const contactIds = idResult.rows.map((r) => r.id);

    if (contactIds.length === 0) {
      await client.query('COMMIT');
      return 0;
    }

    await client.query(
      `UPDATE contacts 
       SET assigned_user_id = $1 
       WHERE id = ANY($2::int[])`,
      [data.targetUserId, contactIds]
    );

    await client.query(
      `INSERT INTO project_users (project_id, user_id, assigned_at)
       SELECT DISTINCT p_id, $1::int, NOW()
       FROM (
         SELECT project_id AS p_id FROM contacts WHERE id = ANY($2::int[]) AND project_id IS NOT NULL
         UNION
         SELECT project_id AS p_id FROM contact_projects WHERE contact_id = ANY($2::int[])
       ) sub
       ON CONFLICT (project_id, user_id) DO NOTHING`,
      [data.targetUserId, contactIds]
    );

    if (data.reassignFollowUps !== false) {
      await client.query(
        `UPDATE follow_ups 
         SET user_id = $1 
         WHERE contact_id = ANY($2::int[]) 
           AND status = 'pending'`,
        [data.targetUserId, contactIds]
      );
    }

    await client.query('COMMIT');
    return contactIds.length;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}



