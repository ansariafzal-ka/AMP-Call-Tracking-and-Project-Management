-- 016_accurate_overdue_followups.sql
-- Updates overdue definition to accurately check f.due_at < NOW() instead of only previous days.

-- 1. Update sp_followup_get_categorized
CREATE OR REPLACE FUNCTION sp_followup_get_categorized(
  p_user_id INT,
  p_filter VARCHAR, -- 'today', 'overdue', 'upcoming', 'completed', 'all'
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  user_id INT,
  contact_id INT,
  contact_name VARCHAR,
  contact_mobile VARCHAR,
  contact_category VARCHAR,
  contact_city VARCHAR,
  call_id INT,
  due_at TIMESTAMPTZ,
  status VARCHAR,
  notes TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  today_count BIGINT,
  overdue_count BIGINT,
  upcoming_count BIGINT,
  completed_count BIGINT,
  filtered_total BIGINT
) AS $$
DECLARE
  v_now         TIMESTAMPTZ := NOW();
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
  v_today_end   TIMESTAMPTZ := date_trunc('day', NOW()) + INTERVAL '1 day';
  v_today_cnt     BIGINT;
  v_overdue_cnt   BIGINT;
  v_upcoming_cnt  BIGINT;
  v_completed_cnt BIGINT;
  v_filtered_tot  BIGINT;
  v_filter        VARCHAR := LOWER(COALESCE(NULLIF(p_filter, ''), 'all'));
BEGIN
  -- 1. Badge counts for active tabs
  -- Overdue: Any pending follow-up past its exact scheduled date and time
  SELECT COUNT(*) INTO v_overdue_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at < v_now;

  -- Due Today: Any pending follow-up scheduled for today
  SELECT COUNT(*) INTO v_today_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_start
    AND f.due_at < v_today_end;

  -- Upcoming: Any pending follow-up scheduled after today
  SELECT COUNT(*) INTO v_upcoming_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_end;

  -- Completed: All completed follow-ups
  SELECT COUNT(*) INTO v_completed_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'completed';

  -- 2. Filtered total count for pagination
  SELECT COUNT(*) INTO v_filtered_tot
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND (
      (v_filter = 'today' AND f.status = 'pending' AND f.due_at >= v_today_start AND f.due_at < v_today_end)
      OR (v_filter = 'overdue' AND f.status = 'pending' AND f.due_at < v_now)
      OR (v_filter = 'upcoming' AND f.status = 'pending' AND f.due_at >= v_today_end)
      OR (v_filter = 'completed' AND f.status = 'completed')
      OR (v_filter = 'all')
    );

  -- 3. Return results joined with contact details
  RETURN QUERY
  SELECT
    f.id,
    f.user_id,
    f.contact_id,
    ct.name AS contact_name,
    ct.mobile_number AS contact_mobile,
    ct.category AS contact_category,
    ct.city AS contact_city,
    f.call_id,
    f.due_at,
    f.status,
    f.notes,
    f.completed_at,
    f.created_at,
    v_today_cnt AS today_count,
    v_overdue_cnt AS overdue_count,
    v_upcoming_cnt AS upcoming_count,
    v_completed_cnt AS completed_count,
    v_filtered_tot AS filtered_total
  FROM follow_ups f
  JOIN contacts ct ON ct.id = f.contact_id
  WHERE f.user_id = p_user_id
    AND (
      (v_filter = 'today' AND f.status = 'pending' AND f.due_at >= v_today_start AND f.due_at < v_today_end)
      OR (v_filter = 'overdue' AND f.status = 'pending' AND f.due_at < v_now)
      OR (v_filter = 'upcoming' AND f.status = 'pending' AND f.due_at >= v_today_end)
      OR (v_filter = 'completed' AND f.status = 'completed')
      OR (v_filter = 'all')
    )
  ORDER BY 
    CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END,
    f.due_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_admin_get_dashboard_analytics to also use f.due_at < NOW() for overdue count
CREATE OR REPLACE FUNCTION sp_admin_get_dashboard_analytics(
  p_start_date TIMESTAMPTZ DEFAULT NULL,
  p_end_date TIMESTAMPTZ DEFAULT NULL,
  p_user_id INT DEFAULT NULL
)
RETURNS TABLE (
  total_calls BIGINT,
  connected_calls BIGINT,
  connected_rate NUMERIC,
  interested_calls BIGINT,
  interested_rate NUMERIC,
  total_talk_time_seconds BIGINT,
  pending_follow_ups BIGINT,
  overdue_follow_ups BIGINT,
  today_follow_ups BIGINT,
  active_callers_count BIGINT,
  total_callers_count BIGINT
) AS $$
DECLARE
  v_now         TIMESTAMPTZ := NOW();
  v_start       TIMESTAMPTZ := COALESCE(p_start_date, date_trunc('day', NOW()));
  v_end         TIMESTAMPTZ := COALESCE(p_end_date, NOW());
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
  v_today_end   TIMESTAMPTZ := date_trunc('day', NOW()) + INTERVAL '1 day';

  v_tot_calls BIGINT;
  v_conn_calls BIGINT;
  v_conn_rate NUMERIC := 0.0;
  v_int_calls BIGINT;
  v_int_rate NUMERIC := 0.0;
  v_talk_sec BIGINT;

  v_pend_fu BIGINT;
  v_overdue_fu BIGINT;
  v_today_fu BIGINT;

  v_active_callers BIGINT;
  v_total_callers BIGINT;
BEGIN
  -- Call metrics within date range
  SELECT
    COUNT(c.id),
    COUNT(c.id) FILTER (WHERE c.status = 'answered'),
    COUNT(c.id) FILTER (WHERE c.outcome = 'interested'),
    COALESCE(SUM(c.duration_seconds), 0)
  INTO
    v_tot_calls,
    v_conn_calls,
    v_int_calls,
    v_talk_sec
  FROM calls c
  WHERE (p_user_id IS NULL OR c.user_id = p_user_id)
    AND c.called_at >= v_start
    AND c.called_at <= v_end;

  IF v_tot_calls > 0 THEN
    v_conn_rate := ROUND((v_conn_calls::NUMERIC / v_tot_calls::NUMERIC) * 100.0, 1);
  END IF;

  IF v_conn_calls > 0 THEN
    v_int_rate := ROUND((v_int_calls::NUMERIC / v_conn_calls::NUMERIC) * 100.0, 1);
  END IF;

  -- Follow-ups metrics: overdue checks f.due_at < NOW()
  SELECT
    COUNT(f.id) FILTER (WHERE f.status = 'pending'),
    COUNT(f.id) FILTER (WHERE f.status = 'pending' AND f.due_at < v_now),
    COUNT(f.id) FILTER (WHERE f.status = 'pending' AND f.due_at >= v_today_start AND f.due_at < v_today_end)
  INTO
    v_pend_fu,
    v_overdue_fu,
    v_today_fu
  FROM follow_ups f
  WHERE (p_user_id IS NULL OR f.user_id = p_user_id);

  -- Caller counts
  SELECT
    COUNT(DISTINCT c.user_id)
  INTO
    v_active_callers
  FROM calls c
  WHERE c.called_at >= v_start
    AND c.called_at <= v_end;

  SELECT
    COUNT(u.id)
  INTO
    v_total_callers
  FROM users u
  WHERE u.is_active = TRUE;

  RETURN QUERY
  SELECT
    COALESCE(v_tot_calls, 0)::BIGINT AS total_calls,
    COALESCE(v_conn_calls, 0)::BIGINT AS connected_calls,
    v_conn_rate AS connected_rate,
    COALESCE(v_int_calls, 0)::BIGINT AS interested_calls,
    v_int_rate AS interested_rate,
    COALESCE(v_talk_sec, 0)::BIGINT AS total_talk_time_seconds,
    COALESCE(v_pend_fu, 0)::BIGINT AS pending_follow_ups,
    COALESCE(v_overdue_fu, 0)::BIGINT AS overdue_follow_ups,
    COALESCE(v_today_fu, 0)::BIGINT AS today_follow_ups,
    COALESCE(v_active_callers, 0)::BIGINT AS active_callers_count,
    COALESCE(v_total_callers, 0)::BIGINT AS total_callers_count;
END;
$$ LANGUAGE plpgsql;

