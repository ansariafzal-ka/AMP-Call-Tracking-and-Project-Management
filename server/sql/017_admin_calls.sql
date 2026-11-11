-- ============================================================
-- Migration 017: Admin Calls Master Log Endpoint
-- Database: PostgreSQL (call_tracker)
-- ============================================================

DROP FUNCTION IF EXISTS sp_admin_get_calls(VARCHAR, INT, INT, VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ, INT, INT);

CREATE OR REPLACE FUNCTION sp_admin_get_calls(
  p_search VARCHAR DEFAULT NULL,
  p_user_id INT DEFAULT NULL,
  p_project_id INT DEFAULT NULL,
  p_status VARCHAR DEFAULT NULL,
  p_outcome VARCHAR DEFAULT NULL,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_limit INT DEFAULT 20,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id INT,
  user_id INT,
  caller_name VARCHAR,
  caller_email VARCHAR,
  contact_id INT,
  contact_name VARCHAR,
  contact_number VARCHAR,
  project_id INT,
  project_name VARCHAR,
  duration_seconds INT,
  status VARCHAR,
  purpose VARCHAR,
  outcome VARCHAR,
  follow_up_date TIMESTAMPTZ,
  follow_up_status VARCHAR,
  called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  filtered_total BIGINT,
  total_duration_filtered BIGINT,
  connected_calls_filtered BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT := 0;
  v_tot_dur BIGINT := 0;
  v_conn_cnt BIGINT := 0;
BEGIN
  -- 1. Aggregates for matching calls
  SELECT
    COUNT(c.id),
    COALESCE(SUM(c.duration_seconds), 0),
    COUNT(c.id) FILTER (WHERE c.status = 'answered')
  INTO
    v_filtered_total,
    v_tot_dur,
    v_conn_cnt
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN users u ON u.id = c.user_id
  WHERE (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
      OR u.full_name ILIKE '%' || p_search || '%'
    )
    AND (
      p_user_id IS NULL OR p_user_id = 0 OR c.user_id = p_user_id
    )
    AND (
      p_project_id IS NULL OR p_project_id = 0 OR c.project_id = p_project_id OR ct.project_id = p_project_id
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR c.status = p_status
    )
    AND (
      p_outcome IS NULL OR p_outcome = '' OR p_outcome = 'all'
      OR c.outcome = p_outcome
    )
    AND (
      p_start_date IS NULL OR c.called_at >= p_start_date
    )
    AND (
      p_end_date IS NULL OR c.called_at <= p_end_date
    );

  -- 2. Return paginated records
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    u.full_name AS caller_name,
    u.email AS caller_email,
    c.contact_id,
    COALESCE(ct.name, 'Unknown') AS contact_name,
    c.contact_number,
    COALESCE(c.project_id, ct.project_id) AS project_id,
    p.name AS project_name,
    c.duration_seconds,
    c.status::VARCHAR,
    c.purpose::VARCHAR,
    c.outcome::VARCHAR,
    c.follow_up_date,
    fu.status::VARCHAR AS follow_up_status,
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total,
    v_tot_dur AS total_duration_filtered,
    v_conn_cnt AS connected_calls_filtered
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN users u ON u.id = c.user_id
  LEFT JOIN projects p ON p.id = COALESCE(c.project_id, ct.project_id)
  LEFT JOIN LATERAL (
    SELECT f.status
    FROM follow_ups f
    WHERE f.call_id = c.id
    ORDER BY f.id DESC
    LIMIT 1
  ) fu ON TRUE
  WHERE (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
      OR u.full_name ILIKE '%' || p_search || '%'
    )
    AND (
      p_user_id IS NULL OR p_user_id = 0 OR c.user_id = p_user_id
    )
    AND (
      p_project_id IS NULL OR p_project_id = 0 OR c.project_id = p_project_id OR ct.project_id = p_project_id
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR c.status = p_status
    )
    AND (
      p_outcome IS NULL OR p_outcome = '' OR p_outcome = 'all'
      OR c.outcome = p_outcome
    )
    AND (
      p_start_date IS NULL OR c.called_at >= p_start_date
    )
    AND (
      p_end_date IS NULL OR c.called_at <= p_end_date
    )
  ORDER BY c.called_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

