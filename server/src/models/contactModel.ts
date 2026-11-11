import { pool } from '../config/db';
import { ContactRow } from '../types/contact';

export async function getAssignedContacts(
  userId: number,
  search?: string,
  category?: string,
  limit: number = 20,
  offset: number = 0
): Promise<{ contacts: ContactRow[]; total: number }> {
  const result = await pool.query<ContactRow & { filtered_total: string }>(
    'SELECT * FROM sp_contact_get_assigned($1, $2, $3, $4, $5)',
    [
      userId,
      search ? search.trim() : null,
      category ? category.trim() : null,
      limit,
      offset,
    ]
  );

  const contacts = result.rows;
  const total = contacts.length > 0 ? parseInt(contacts[0].filtered_total as any, 10) || 0 : 0;

  return { contacts, total };
}

export async function getContactById(
  contactId: number,
  userId: number,
  isAdmin: boolean = false
): Promise<ContactRow | null> {
  if (isAdmin) {
    const result = await pool.query<ContactRow>(
      `SELECT
        ct.id,
        ct.assigned_user_id,
        ct.name,
        ct.mobile_number,
        ct.alternate_number,
        ct.email,
        ct.city,
        ct.state,
        ct.pin_code,
        ct.category,
        ct.notes,
        COALESCE(ct.project_id, pr_first.project_id) AS project_id,
        COALESCE(p.name, pr_first.project_name)::VARCHAR AS project_name,
        ct.created_at,
        COUNT(c.id)::BIGINT AS total_calls
      FROM contacts ct
      LEFT JOIN projects p ON p.id = ct.project_id
      LEFT JOIN LATERAL (
        SELECT cp.project_id, p2.name AS project_name
        FROM contact_projects cp
        JOIN projects p2 ON p2.id = cp.project_id
        WHERE cp.contact_id = ct.id
        ORDER BY cp.created_at ASC
        LIMIT 1
      ) pr_first ON TRUE
      LEFT JOIN calls c ON (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
      WHERE ct.id = $1
      GROUP BY ct.id, p.name, pr_first.project_id, pr_first.project_name`,
      [contactId]
    );
    return result.rows[0] || null;
  }

  const result = await pool.query<ContactRow>(
    'SELECT * FROM sp_contact_get_by_id($1, $2)',
    [contactId, userId]
  );
  return result.rows[0] || null;
}

export async function getContactCallHistory(
  contactId: number,
  userId: number,
  isAdmin: boolean = false
): Promise<any[]> {
  if (isAdmin) {
    const result = await pool.query(
      `SELECT
        c.id,
        c.user_id,
        u.full_name AS caller_name,
        u.email AS caller_email,
        c.contact_id,
        c.contact_number,
        c.duration_seconds,
        c.status,
        c.purpose,
        c.outcome,
        c.follow_up_date,
        c.called_at,
        c.created_at
      FROM calls c
      JOIN contacts ct ON (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
      LEFT JOIN users u ON u.id = c.user_id
      WHERE ct.id = $1
      ORDER BY c.called_at DESC`,
      [contactId]
    );
    return result.rows;
  }

  const result = await pool.query(
    'SELECT * FROM sp_contact_get_call_history($1, $2)',
    [contactId, userId]
  );
  return result.rows;
}

export async function lookupContact(userId: number, number: string): Promise<any | null> {
  const result = await pool.query(
    'SELECT * FROM sp_contact_lookup($1, $2)',
    [userId, number.trim()]
  );
  return result.rows[0] || null;
}

export async function createCallerContact(
  userId: number,
  data: {
    name: string;
    mobile_number: string;
    category?: string;
    city?: string;
    state?: string;
    pin_code?: string;
    call_id?: number;
  }
): Promise<number> {
  // Check if caller has an assigned project
  const puRes = await pool.query<{ project_id: number }>(
    'SELECT project_id FROM project_users WHERE user_id = $1 ORDER BY project_id ASC LIMIT 1',
    [userId]
  );
  const projectId = puRes.rows[0]?.project_id || null;

  const cleanNum = data.mobile_number.replace(/\D/g, '').slice(-10);

  // Check if contact already exists by mobile number (exact or trailing 10 digits)
  const existingRes = await pool.query<{ id: number }>(
    `SELECT id FROM contacts 
     WHERE mobile_number = $1 
        OR (LENGTH(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g')) >= 10 
            AND RIGHT(REGEXP_REPLACE(mobile_number, '[^0-9]', '', 'g'), 10) = $2)
     ORDER BY id ASC
     LIMIT 1`,
    [data.mobile_number.trim(), cleanNum]
  );

  let contactId: number;

  if (existingRes.rows.length > 0) {
    contactId = existingRes.rows[0].id;
    await pool.query(
      `UPDATE contacts
       SET name = COALESCE(NULLIF($1, ''), name),
           category = COALESCE(NULLIF($2, ''), category),
           city = COALESCE(NULLIF($3, ''), city),
           state = COALESCE(NULLIF($4, ''), state),
           pin_code = COALESCE(NULLIF($5, ''), pin_code),
           assigned_user_id = COALESCE(assigned_user_id, $6),
           project_id = COALESCE(project_id, $7)
       WHERE id = $8`,
      [
        data.name.trim(),
        data.category && data.category.trim() ? data.category.trim() : null,
        data.city && data.city.trim() ? data.city.trim() : null,
        data.state && data.state.trim() ? data.state.trim() : null,
        data.pin_code && data.pin_code.trim() ? data.pin_code.trim() : null,
        userId,
        projectId,
        contactId,
      ]
    );
  } else {
    const insertRes = await pool.query<{ id: number }>(
      `INSERT INTO contacts (name, mobile_number, category, city, state, pin_code, assigned_user_id, project_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [
        data.name.trim(),
        data.mobile_number.trim(),
        data.category && data.category.trim() ? data.category.trim() : 'other',
        data.city && data.city.trim() ? data.city.trim() : null,
        data.state && data.state.trim() ? data.state.trim() : null,
        data.pin_code && data.pin_code.trim() ? data.pin_code.trim() : null,
        userId,
        projectId,
      ]
    );
    contactId = insertRes.rows[0].id;
  }

  // If a call_id was provided, link the call and any follow-up immediately
  if (data.call_id) {
    await pool.query(
      `UPDATE calls
       SET contact_id = $1, project_id = COALESCE(calls.project_id, $2)
       WHERE id = $3 AND user_id = $4`,
      [contactId, projectId, data.call_id, userId]
    );

    await pool.query(
      `UPDATE follow_ups
       SET contact_id = $1
       WHERE call_id = $2 AND user_id = $3`,
      [contactId, data.call_id, userId]
    );
  }

  return contactId;
}

