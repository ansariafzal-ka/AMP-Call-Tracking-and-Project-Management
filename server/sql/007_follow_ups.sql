-- ============================================================
-- Migration 007: Follow-ups Management
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Follow-ups Table
CREATE TABLE IF NOT EXISTS follow_ups (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  call_id INT NULL REFERENCES calls(id) ON DELETE SET NULL,
  due_at TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'completed', 'rescheduled', 'cancelled'
  notes TEXT NULL,
  completed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_followup_user_status_due ON follow_ups (user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_followup_contact ON follow_ups (contact_id);

-- 2. Stored Functions

-- sp_followup_get_categorized: Returns follow-ups with contact info and category badge counts
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
  SELECT COUNT(*) INTO v_today_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_start
    AND f.due_at < v_today_end;

  SELECT COUNT(*) INTO v_overdue_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at < v_today_start;

  SELECT COUNT(*) INTO v_upcoming_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_end;

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
      OR (v_filter = 'overdue' AND f.status = 'pending' AND f.due_at < v_today_start)
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
      OR (v_filter = 'overdue' AND f.status = 'pending' AND f.due_at < v_today_start)
      OR (v_filter = 'upcoming' AND f.status = 'pending' AND f.due_at >= v_today_end)
      OR (v_filter = 'completed' AND f.status = 'completed')
      OR (v_filter = 'all')
    )
  ORDER BY 
    CASE WHEN f.status = 'pending' THEN 0 ELSE 1 END,
    f.due_at ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- sp_followup_create: Schedule a new follow-up
CREATE OR REPLACE FUNCTION sp_followup_create(
  p_user_id INT,
  p_contact_id INT,
  p_call_id INT,
  p_due_at TIMESTAMPTZ,
  p_notes TEXT
)
RETURNS TABLE (insert_id INT) AS $$
DECLARE
  v_new_id INT;
BEGIN
  INSERT INTO follow_ups (user_id, contact_id, call_id, due_at, notes, status)
  VALUES (p_user_id, p_contact_id, p_call_id, p_due_at, p_notes, 'pending')
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id;
END;
$$ LANGUAGE plpgsql;

-- sp_followup_complete: Mark a follow-up as completed
CREATE OR REPLACE FUNCTION sp_followup_complete(
  p_followup_id INT,
  p_user_id INT,
  p_notes TEXT
)
RETURNS TABLE (affected_rows INT) AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE follow_ups
  SET
    status = 'completed',
    completed_at = CURRENT_TIMESTAMP,
    notes = CASE 
      WHEN p_notes IS NOT NULL AND p_notes <> '' THEN COALESCE(notes || E'\nCompleted: ' || p_notes, p_notes)
      ELSE notes
    END
  WHERE follow_ups.id = p_followup_id AND follow_ups.user_id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- sp_followup_reschedule: Reschedule a follow-up to a new date
CREATE OR REPLACE FUNCTION sp_followup_reschedule(
  p_followup_id INT,
  p_user_id INT,
  p_new_due_at TIMESTAMPTZ,
  p_notes TEXT
)
RETURNS TABLE (affected_rows INT) AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE follow_ups
  SET
    due_at = p_new_due_at,
    status = 'pending',
    completed_at = NULL,
    notes = CASE 
      WHEN p_notes IS NOT NULL AND p_notes <> '' THEN COALESCE(notes || E'\nRescheduled: ' || p_notes, p_notes)
      ELSE notes
    END
  WHERE follow_ups.id = p_followup_id AND follow_ups.user_id = p_user_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

