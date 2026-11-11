-- ============================================================
-- Migration 026: Add contacts_reached to sp_admin_get_projects & sp_admin_get_project_by_id
-- Database: PostgreSQL (call_tracker)
-- Description:
--   Accurately tracks distinct contacts reached within a campaign/project,
--   ensuring Campaign Outreach Progress reflects (contacts reached / total contacts)
--   instead of total calls made over total contacts.
-- ============================================================

DROP FUNCTION IF EXISTS sp_admin_get_projects(VARCHAR, VARCHAR, INT, INT);

CREATE OR REPLACE FUNCTION sp_admin_get_projects(
  p_search VARCHAR,
  p_status VARCHAR,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR,
  created_at TIMESTAMPTZ,
  total_contacts BIGINT,
  total_callers BIGINT,
  total_calls_made BIGINT,
  connected_calls BIGINT,
  contacts_reached BIGINT,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  -- Count total matching projects
  SELECT COUNT(*) INTO v_filtered_total
  FROM projects pr
  WHERE (
      p_search IS NULL OR p_search = ''
      OR pr.name ILIKE '%' || p_search || '%'
      OR pr.description ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR pr.status = p_status
    );

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.description,
    pr.start_date,
    pr.end_date,
    pr.status,
    pr.created_at,
    COALESCE(ct_counts.cnt, 0)::BIGINT AS total_contacts,
    COALESCE(usr_counts.cnt, 0)::BIGINT AS total_callers,
    COALESCE(call_counts.total_cnt, 0)::BIGINT AS total_calls_made,
    COALESCE(call_counts.conn_cnt, 0)::BIGINT AS connected_calls,
    COALESCE(ct_counts.reached_cnt, 0)::BIGINT AS contacts_reached,
    v_filtered_total AS filtered_total
  FROM projects pr
  LEFT JOIN (
    SELECT
      ct.project_id,
      COUNT(DISTINCT ct.id) AS cnt,
      COUNT(DISTINCT c.contact_id) AS reached_cnt
    FROM contacts ct
    LEFT JOIN calls c ON c.contact_id = ct.id AND c.project_id = ct.project_id
    WHERE ct.project_id IS NOT NULL
    GROUP BY ct.project_id
  ) ct_counts ON ct_counts.project_id = pr.id
  LEFT JOIN (
    SELECT pu.project_id, COUNT(pu.user_id) AS cnt
    FROM project_users pu
    GROUP BY pu.project_id
  ) usr_counts ON usr_counts.project_id = pr.id
  LEFT JOIN (
    SELECT
      c.project_id,
      COUNT(c.id) AS total_cnt,
      COUNT(c.id) FILTER (WHERE c.status = 'answered') AS conn_cnt
    FROM calls c
    WHERE c.project_id IS NOT NULL
    GROUP BY c.project_id
  ) call_counts ON call_counts.project_id = pr.id
  WHERE (
      p_search IS NULL OR p_search = ''
      OR pr.name ILIKE '%' || p_search || '%'
      OR pr.description ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR pr.status = p_status
    )
  ORDER BY pr.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

DROP FUNCTION IF EXISTS sp_admin_get_project_by_id(INT);

CREATE OR REPLACE FUNCTION sp_admin_get_project_by_id(p_project_id INT)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR,
  created_at TIMESTAMPTZ,
  total_contacts BIGINT,
  total_callers BIGINT,
  total_calls_made BIGINT,
  connected_calls BIGINT,
  contacts_reached BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.description,
    pr.start_date,
    pr.end_date,
    pr.status,
    pr.created_at,
    (SELECT COUNT(ct.id)::BIGINT FROM contacts ct WHERE ct.project_id = pr.id) AS total_contacts,
    (SELECT COUNT(pu.user_id)::BIGINT FROM project_users pu WHERE pu.project_id = pr.id) AS total_callers,
    (SELECT COUNT(c.id)::BIGINT FROM calls c WHERE c.project_id = pr.id) AS total_calls_made,
    (SELECT COUNT(c.id)::BIGINT FROM calls c WHERE c.project_id = pr.id AND c.status = 'answered') AS connected_calls,
    (
      SELECT COUNT(DISTINCT c.contact_id)::BIGINT
      FROM calls c
      JOIN contacts ct ON ct.id = c.contact_id AND ct.project_id = pr.id
      WHERE c.project_id = pr.id
    ) AS contacts_reached
  FROM projects pr
  WHERE pr.id = p_project_id;
END;
$$ LANGUAGE plpgsql;

