-- 012_fix_user_stats_and_call_followups.sql
-- 1. Fix sp_user_get_stats to count pending follow-ups from follow_ups table where status = 'pending'
CREATE OR REPLACE FUNCTION sp_user_get_stats(p_user_id INT)
RETURNS TABLE (
  total_assigned_contacts BIGINT,
  calls_made_today BIGINT,
  connected_calls_today BIGINT,
  total_talk_time_today_seconds BIGINT,
  pending_follow_ups BIGINT,
  total_calls_all_time BIGINT
) AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::BIGINT FROM contacts WHERE assigned_user_id = p_user_id) AS total_assigned_contacts,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start) AS calls_made_today,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start AND status = 'answered') AS connected_calls_today,
    (SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start) AS total_talk_time_today_seconds,
    (SELECT COUNT(*)::BIGINT FROM follow_ups WHERE user_id = p_user_id AND status = 'pending') AS pending_follow_ups,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id) AS total_calls_all_time;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_call_get_paginated to include follow_up_status
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT);

CREATE OR REPLACE FUNCTION sp_call_get_paginated(
  p_user_id INT,
  p_search VARCHAR,
  p_outcome VARCHAR,
  p_status VARCHAR,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  user_id INT,
  contact_id INT,
  contact_name VARCHAR,
  contact_number VARCHAR,
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
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR c.outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR c.status = p_status
    );

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.contact_id,
    ct.name AS contact_name,
    c.contact_number,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    fu.status::VARCHAR AS follow_up_status,
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
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
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR c.outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR c.status = p_status
    )
  ORDER BY c.called_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

