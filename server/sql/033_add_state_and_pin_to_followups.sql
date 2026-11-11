-- 033_add_state_and_pin_to_followups.sql
-- Add contact_state and contact_pin_code to sp_followup_get_categorized

DROP FUNCTION IF EXISTS sp_followup_get_categorized(INT, VARCHAR, INT, INT);

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
  contact_state VARCHAR,
  contact_pin_code VARCHAR,
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
  -- 1. Universal tab badge counts
  -- Overdue: Pending follow-ups past exact due timestamp
  SELECT COUNT(*) INTO v_overdue_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at < v_now;

  -- Today: Pending follow-ups scheduled for today
  SELECT COUNT(*) INTO v_today_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_start
    AND f.due_at < v_today_end;

  -- Upcoming: Pending follow-ups scheduled after today
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

  -- 2. Filtered total count for current tab pagination
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

  -- 3. Return results joined with contact details including state and pin_code
  RETURN QUERY
  SELECT
    f.id,
    f.user_id,
    f.contact_id,
    ct.name AS contact_name,
    ct.mobile_number AS contact_mobile,
    ct.category AS contact_category,
    ct.city AS contact_city,
    ct.state AS contact_state,
    ct.pin_code AS contact_pin_code,
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

