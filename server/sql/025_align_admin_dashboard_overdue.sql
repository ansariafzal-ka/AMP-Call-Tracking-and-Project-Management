-- ============================================================
-- Migration 025: Align Admin Dashboard Overdue Follow-ups with Caller Portal
-- Database: PostgreSQL (call_tracker)
-- Description:
--   Ensures that overdue follow-ups in sp_admin_dashboard_summary are
--   calculated against the current time (NOW()) instead of 00:00:00 midnight
--   of today, matching sp_followup_get_categorized in the Caller Follow-ups page.
-- ============================================================

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
  v_now   TIMESTAMPTZ := NOW();
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

  -- Follow-ups metrics:
  -- overdue: any pending follow-up past its exact scheduled timestamp NOW()
  -- today: any pending follow-up scheduled for today
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

