-- ============================================================
-- Migration 011: Admin Dashboard & Team Analytics
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. sp_admin_dashboard_summary: Team-wide KPIs
CREATE OR REPLACE FUNCTION sp_admin_dashboard_summary(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_user_id INT
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
  v_start TIMESTAMPTZ := COALESCE(p_start_date, date_trunc('day', NOW()));
  v_end   TIMESTAMPTZ := COALESCE(p_end_date, NOW());
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
  WHERE c.called_at >= v_start AND c.called_at <= v_end
    AND (p_user_id IS NULL OR c.user_id = p_user_id);

  IF v_tot_calls > 0 THEN
    v_conn_rate := ROUND((v_conn_calls::NUMERIC / v_tot_calls::NUMERIC) * 100.0, 1);
  END IF;

  IF v_conn_calls > 0 THEN
    v_int_rate := ROUND((v_int_calls::NUMERIC / v_conn_calls::NUMERIC) * 100.0, 1);
  END IF;

  -- Follow-ups metrics
  SELECT
    COUNT(f.id) FILTER (WHERE f.status = 'pending'),
    COUNT(f.id) FILTER (WHERE f.status = 'pending' AND f.due_at < v_today_start),
    COUNT(f.id) FILTER (WHERE f.status = 'pending' AND f.due_at >= v_today_start AND f.due_at < v_today_end)
  INTO
    v_pend_fu,
    v_overdue_fu,
    v_today_fu
  FROM follow_ups f
  WHERE (p_user_id IS NULL OR f.user_id = p_user_id);

  -- Caller counts
  SELECT
    COUNT(u.id) FILTER (WHERE u.is_active = TRUE),
    COUNT(u.id)
  INTO
    v_active_callers,
    v_total_callers
  FROM users u
  WHERE u.role = 'caller' OR u.role = 'admin';

  RETURN QUERY
  SELECT
    v_tot_calls AS total_calls,
    v_conn_calls AS connected_calls,
    v_conn_rate AS connected_rate,
    v_int_calls AS interested_calls,
    v_int_rate AS interested_rate,
    v_talk_sec AS total_talk_time_seconds,
    COALESCE(v_pend_fu, 0)::BIGINT AS pending_follow_ups,
    COALESCE(v_overdue_fu, 0)::BIGINT AS overdue_follow_ups,
    COALESCE(v_today_fu, 0)::BIGINT AS today_follow_ups,
    COALESCE(v_active_callers, 0)::BIGINT AS active_callers_count,
    COALESCE(v_total_callers, 0)::BIGINT AS total_callers_count;
END;
$$ LANGUAGE plpgsql;

-- 2. sp_admin_dashboard_leaderboard: Caller-by-caller performance
CREATE OR REPLACE FUNCTION sp_admin_dashboard_leaderboard(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  user_id INT,
  full_name VARCHAR,
  email VARCHAR,
  role VARCHAR,
  is_active BOOLEAN,
  daily_target INT,
  weekly_target INT,
  calls_count BIGINT,
  connected_count BIGINT,
  interested_count BIGINT,
  total_talk_time_seconds BIGINT,
  target_achievement_percentage NUMERIC,
  pending_follow_ups_count BIGINT,
  total_assigned_contacts BIGINT
) AS $$
DECLARE
  v_start TIMESTAMPTZ := COALESCE(p_start_date, date_trunc('day', NOW()));
  v_end   TIMESTAMPTZ := COALESCE(p_end_date, NOW());
BEGIN
  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.full_name,
    u.email,
    u.role,
    u.is_active,
    u.daily_target,
    u.weekly_target,
    COALESCE(c_stats.total_calls, 0)::BIGINT AS calls_count,
    COALESCE(c_stats.connected_calls, 0)::BIGINT AS connected_count,
    COALESCE(c_stats.interested_calls, 0)::BIGINT AS interested_count,
    COALESCE(c_stats.talk_seconds, 0)::BIGINT AS total_talk_time_seconds,
    CASE 
      WHEN u.daily_target > 0 THEN 
        ROUND((COALESCE(c_stats.total_calls, 0)::NUMERIC / u.daily_target::NUMERIC) * 100.0, 1)
      ELSE 0.0
    END AS target_achievement_percentage,
    COALESCE(fu_stats.pending_count, 0)::BIGINT AS pending_follow_ups_count,
    COALESCE(ct_stats.assigned_count, 0)::BIGINT AS total_assigned_contacts
  FROM users u
  LEFT JOIN (
    SELECT
      c.user_id,
      COUNT(c.id) AS total_calls,
      COUNT(c.id) FILTER (WHERE c.status = 'answered') AS connected_calls,
      COUNT(c.id) FILTER (WHERE c.outcome = 'interested') AS interested_calls,
      COALESCE(SUM(c.duration_seconds), 0) AS talk_seconds
    FROM calls c
    WHERE c.called_at >= v_start AND c.called_at <= v_end
    GROUP BY c.user_id
  ) c_stats ON c_stats.user_id = u.id
  LEFT JOIN (
    SELECT
      f.user_id,
      COUNT(f.id) AS pending_count
    FROM follow_ups f
    WHERE f.status = 'pending'
    GROUP BY f.user_id
  ) fu_stats ON fu_stats.user_id = u.id
  LEFT JOIN (
    SELECT
      ct.assigned_user_id,
      COUNT(ct.id) AS assigned_count
    FROM contacts ct
    GROUP BY ct.assigned_user_id
  ) ct_stats ON ct_stats.assigned_user_id = u.id
  ORDER BY calls_count DESC, u.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

