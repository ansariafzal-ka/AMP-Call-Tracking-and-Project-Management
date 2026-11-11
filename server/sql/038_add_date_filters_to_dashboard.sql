-- ============================================================
-- Migration 038: Add date range filtering to Dashboard and Call queries
-- Supports date-filtered Calls list, Summary, and Stats across Mobile & Web
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Update sp_call_get_paginated with optional p_start_date and p_end_date
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT);
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION sp_call_get_paginated(
  p_user_id INT,
  p_search VARCHAR,
  p_outcome VARCHAR,
  p_status VARCHAR,
  p_limit INT,
  p_offset INT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  user_id INT,
  contact_id INT,
  contact_name VARCHAR,
  contact_category VARCHAR,
  contact_city VARCHAR,
  contact_state VARCHAR,
  contact_pin_code VARCHAR,
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
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_filtered_total
  FROM calls c
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code, ct_sub.project_id
    FROM contacts ct_sub
    WHERE ct_sub.id = c.contact_id
       OR (c.contact_id IS NULL AND (
            ct_sub.mobile_number = c.contact_number
            OR (LENGTH(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g')) >= 10
                AND RIGHT(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(ct_sub.mobile_number, '[^0-9]', '', 'g'), 10))
          ))
    ORDER BY (ct_sub.id = c.contact_id) DESC, ct_sub.id DESC
    LIMIT 1
  ) ct ON TRUE
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.category ILIKE '%' || p_search || '%'
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR (p_outcome = 'not_dispositioned' AND c.outcome IS NULL)
      OR c.outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR c.status = p_status
    )
    AND (p_start_date IS NULL OR c.called_at >= p_start_date)
    AND (p_end_date IS NULL OR c.called_at <= p_end_date);

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.contact_id,
    ct.name AS contact_name,
    ct.category AS contact_category,
    ct.city AS contact_city,
    ct.state AS contact_state,
    ct.pin_code AS contact_pin_code,
    c.contact_number,
    COALESCE(c.project_id, ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p_call.name, p_ct.name, pr_first.project_name)::VARCHAR AS project_name,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    fu.status AS follow_up_status,
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total
  FROM calls c
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code, ct_sub.project_id
    FROM contacts ct_sub
    WHERE ct_sub.id = c.contact_id
       OR (c.contact_id IS NULL AND (
            ct_sub.mobile_number = c.contact_number
            OR (LENGTH(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g')) >= 10
                AND RIGHT(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(ct_sub.mobile_number, '[^0-9]', '', 'g'), 10))
          ))
    ORDER BY (ct_sub.id = c.contact_id) DESC, ct_sub.id DESC
    LIMIT 1
  ) ct ON TRUE
  LEFT JOIN projects p_call ON p_call.id = c.project_id
  LEFT JOIN projects p_ct ON p_ct.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.status
    FROM follow_ups f
    WHERE f.call_id = c.id
    ORDER BY f.id DESC
    LIMIT 1
  ) fu ON TRUE
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.category ILIKE '%' || p_search || '%'
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR (p_outcome = 'not_dispositioned' AND c.outcome IS NULL)
      OR c.outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR c.status = p_status
    )
    AND (p_start_date IS NULL OR c.called_at >= p_start_date)
    AND (p_end_date IS NULL OR c.called_at <= p_end_date)
  ORDER BY c.called_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_call_get_summary with optional p_start_date and p_end_date
DROP FUNCTION IF EXISTS sp_call_get_summary(INT);
DROP FUNCTION IF EXISTS sp_call_get_summary(INT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION sp_call_get_summary(
  p_user_id INT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_calls BIGINT,
  total_duration_seconds BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_calls,
    COALESCE(SUM(c.duration_seconds), 0)::BIGINT AS total_duration_seconds
  FROM calls c
  WHERE c.user_id = p_user_id
    AND (p_start_date IS NULL OR c.called_at >= p_start_date)
    AND (p_end_date IS NULL OR c.called_at <= p_end_date);
END;
$$ LANGUAGE plpgsql;

-- 3. Update sp_user_get_stats with optional date window
DROP FUNCTION IF EXISTS sp_user_get_stats(INT);
DROP FUNCTION IF EXISTS sp_user_get_stats(INT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION sp_user_get_stats(
  p_user_id INT,
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
  total_assigned_contacts BIGINT,
  calls_made_today BIGINT,
  connected_calls_today BIGINT,
  total_talk_time_today_seconds BIGINT,
  pending_follow_ups BIGINT,
  total_calls_all_time BIGINT
) AS $$
DECLARE
  v_effective_start TIMESTAMPTZ := COALESCE(p_start_date, date_trunc('day', NOW()));
  v_effective_end   TIMESTAMPTZ := p_end_date;
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::BIGINT FROM contacts WHERE assigned_user_id = p_user_id) AS total_assigned_contacts,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_effective_start AND (v_effective_end IS NULL OR called_at <= v_effective_end)) AS calls_made_today,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_effective_start AND (v_effective_end IS NULL OR called_at <= v_effective_end) AND status = 'answered') AS connected_calls_today,
    (SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_effective_start AND (v_effective_end IS NULL OR called_at <= v_effective_end)) AS total_talk_time_today_seconds,
    (SELECT COUNT(*)::BIGINT FROM follow_ups WHERE user_id = p_user_id AND status = 'pending') AS pending_follow_ups,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id) AS total_calls_all_time;
END;
$$ LANGUAGE plpgsql;

