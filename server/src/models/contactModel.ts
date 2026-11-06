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
  userId: number
): Promise<ContactRow | null> {
  const result = await pool.query<ContactRow>(
    'SELECT * FROM sp_contact_get_by_id($1, $2)',
    [contactId, userId]
  );
  return result.rows[0] || null;
}

export async function getContactCallHistory(
  contactId: number,
  userId: number
): Promise<any[]> {
  const result = await pool.query(
    'SELECT * FROM sp_contact_get_call_history($1, $2)',
    [contactId, userId]
  );
  return result.rows;
}

