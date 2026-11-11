-- ============================================================
-- Migration 035: Upsert support in sp_call_create to gracefully handle duplicates
-- Database: PostgreSQL (call_tracker)
-- ============================================================

CREATE OR REPLACE FUNCTION sp_call_create(
  p_user_id INT,
  p_contact_number VARCHAR,
  p_duration_seconds INT,
  p_status VARCHAR,
  p_purpose VARCHAR,
  p_outcome VARCHAR,
  p_called_at TIMESTAMPTZ,
  p_follow_up_date TIMESTAMPTZ DEFAULT NULL
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
  called_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  v_call_id INT;
  v_contact_id INT := NULL;
  v_contact_name VARCHAR := NULL;
  v_clean_num VARCHAR;
BEGIN
  -- 1. Auto-lookup contact if exists for this caller or number
  v_clean_num := REGEXP_REPLACE(p_contact_number, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_num) > 10 THEN
    v_clean_num := RIGHT(v_clean_num, 10);
  END IF;

  SELECT ct.id, ct.name
  INTO v_contact_id, v_contact_name
  FROM contacts ct
  WHERE ct.assigned_user_id = p_user_id
    AND (
      ct.mobile_number = p_contact_number
      OR ct.alternate_number = p_contact_number
      OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = v_clean_num)
    )
  ORDER BY (ct.mobile_number = p_contact_number) DESC
  LIMIT 1;

  -- 2. Insert the call record with conflict handling (upsert)
  INSERT INTO calls (
    user_id,
    contact_id,
    contact_number,
    duration_seconds,
    status,
    purpose,
    outcome,
    called_at,
    follow_up_date,
    created_at
  )
  VALUES (
    p_user_id,
    v_contact_id,
    p_contact_number,
    p_duration_seconds,
    p_status,
    p_purpose,
    p_outcome,
    p_called_at,
    p_follow_up_date,
    CURRENT_TIMESTAMP
  )
  ON CONFLICT ON CONSTRAINT uq_user_called_contact DO UPDATE
    SET duration_seconds = EXCLUDED.duration_seconds,
        status = EXCLUDED.status,
        contact_id = COALESCE(calls.contact_id, EXCLUDED.contact_id),
        purpose = COALESCE(EXCLUDED.purpose, calls.purpose),
        outcome = COALESCE(EXCLUDED.outcome, calls.outcome),
        follow_up_date = COALESCE(EXCLUDED.follow_up_date, calls.follow_up_date)
  RETURNING calls.id INTO v_call_id;

  IF v_call_id IS NULL THEN
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.user_id = p_user_id AND c.called_at = p_called_at AND c.contact_number = p_contact_number
    LIMIT 1;
  END IF;

  -- 3. Follow-up synchronization across contact
  IF (p_outcome = 'follow_up_required' OR p_follow_up_date IS NOT NULL) AND p_follow_up_date IS NOT NULL AND v_contact_id IS NOT NULL AND v_call_id IS NOT NULL THEN
    -- Cancel any PREVIOUS pending follow-ups for this contact so only the latest is active
    UPDATE follow_ups
    SET status = 'cancelled'
    WHERE follow_ups.contact_id = v_contact_id 
      AND follow_ups.status = 'pending' 
      AND follow_ups.call_id <> v_call_id;

    -- Schedule or update current call's follow-up
    IF EXISTS (SELECT 1 FROM follow_ups f WHERE f.call_id = v_call_id) THEN
      UPDATE follow_ups
      SET
        due_at = p_follow_up_date,
        status = 'pending',
        notes = COALESCE(p_purpose, follow_ups.notes)
      WHERE follow_ups.call_id = v_call_id;
    ELSE
      INSERT INTO follow_ups (
        call_id,
        contact_id,
        user_id,
        due_at,
        notes,
        status
      )
      VALUES (
        v_call_id,
        v_contact_id,
        p_user_id,
        p_follow_up_date,
        p_purpose,
        'pending'
      );
    END IF;
  ELSIF p_outcome IN ('interested', 'not_interested') AND v_contact_id IS NOT NULL THEN
    -- Conclusive outcome reached: Mark any pending follow-ups for this contact as completed
    UPDATE follow_ups
    SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      notes = COALESCE(follow_ups.notes || E'\nCompleted by call #' || v_call_id, 'Completed by call')
    WHERE follow_ups.contact_id = v_contact_id AND follow_ups.status = 'pending';
  END IF;

  -- 4. Return the inserted or updated call
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.contact_id,
    COALESCE(ct.name, v_contact_name, 'Unknown') AS contact_name,
    c.contact_number,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    c.called_at,
    c.created_at
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.id = v_call_id;
END;
$$ LANGUAGE plpgsql;

