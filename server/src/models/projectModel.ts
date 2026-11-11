import { pool } from '../config/db';
import {
  ProjectRow,
  CreateProjectDTO,
  UpdateProjectDTO,
  ProjectFilters,
} from '../types/project';

export async function getProjects(
  filters: ProjectFilters,
  limit: number = 20,
  offset: number = 0
): Promise<{ projects: ProjectRow[]; total: number }> {
  const result = await pool.query<ProjectRow & { filtered_total: string }>(
    'SELECT * FROM sp_admin_get_projects($1, $2, $3, $4)',
    [
      filters.search ? filters.search.trim() : null,
      filters.status ? filters.status.trim() : null,
      limit,
      offset,
    ]
  );

  const projects = result.rows;
  const total = projects.length > 0 ? parseInt(projects[0].filtered_total as any, 10) || 0 : 0;

  return { projects, total };
}

export async function createProject(data: CreateProjectDTO): Promise<number> {
  const result = await pool.query<{ insert_id: number }>(
    'SELECT * FROM sp_admin_create_project($1, $2, $3, $4, $5)',
    [
      data.name.trim(),
      data.description ? data.description.trim() : null,
      data.startDate || null,
      data.endDate || null,
      data.status || 'active',
    ]
  );
  return result.rows[0]?.insert_id || 0;
}

export async function getProjectById(projectId: number): Promise<ProjectRow | null> {
  const result = await pool.query<ProjectRow>(
    'SELECT * FROM sp_admin_get_project_by_id($1)',
    [projectId]
  );
  return result.rows[0] || null;
}

export async function getProjectCallers(projectId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT u.id, u.full_name AS "fullName", u.email, u.role
     FROM users u
     JOIN project_users pu ON pu.user_id = u.id
     WHERE pu.project_id = $1
     ORDER BY u.full_name ASC`,
    [projectId]
  );
  return result.rows;
}

export async function getProjectContacts(projectId: number): Promise<any[]> {
  const result = await pool.query(
    `SELECT ct.id, ct.name, ct.mobile_number AS "mobileNumber", ct.category, ct.city
     FROM contacts ct
     WHERE ct.project_id = $1
     ORDER BY ct.id ASC`,
    [projectId]
  );
  return result.rows;
}

export async function updateProject(
  projectId: number,
  data: UpdateProjectDTO
): Promise<ProjectRow | null> {
  const result = await pool.query<ProjectRow>(
    'SELECT * FROM sp_admin_update_project($1, $2, $3, $4, $5, $6)',
    [
      projectId,
      data.name ? data.name.trim() : null,
      data.description !== undefined ? data.description : null,
      data.startDate || null,
      data.endDate || null,
      data.status || null,
    ]
  );
  return result.rows[0] || null;
}

export async function assignProjectMembers(
  projectId: number,
  userIds?: number[],
  contactIds?: number[],
  action: 'add' | 'remove' = 'add'
): Promise<{ callersAffected: number; contactsAffected: number }> {
  let callersAffected = 0;
  let contactsAffected = 0;

  if (userIds && userIds.length > 0) {
    if (action === 'add') {
      const values = userIds.map((uid) => `(${projectId}, ${uid})`).join(',');
      const res = await pool.query(
        `INSERT INTO project_users (project_id, user_id)
         VALUES ${values}
         ON CONFLICT (project_id, user_id) DO NOTHING`
      );
      callersAffected = res.rowCount || 0;
    } else {
      const res = await pool.query(
        `DELETE FROM project_users WHERE project_id = $1 AND user_id = ANY($2)`,
        [projectId, userIds]
      );
      callersAffected = res.rowCount || 0;
    }
  }

  if (contactIds && contactIds.length > 0) {
    if (action === 'add') {
      const res = await pool.query(
        `UPDATE contacts SET project_id = $1 WHERE id = ANY($2)`,
        [projectId, contactIds]
      );
      contactsAffected = res.rowCount || 0;

      // Retroactively link calls for these contacts that don't have a project
      await pool.query(
        `UPDATE calls SET project_id = $1 WHERE contact_id = ANY($2) AND project_id IS NULL`,
        [projectId, contactIds]
      );
    } else {
      const res = await pool.query(
        `UPDATE contacts SET project_id = NULL WHERE project_id = $1 AND id = ANY($2)`,
        [projectId, contactIds]
      );
      contactsAffected = res.rowCount || 0;
    }
  }

  return { callersAffected, contactsAffected };
}

