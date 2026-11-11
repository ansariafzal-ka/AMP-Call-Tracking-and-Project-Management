-- ============================================================
-- Migration 028: Two-Way Synchronization for Calls & Follow-Ups
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Update sp_followup_reschedule:
-- Automatically syncs linked call's follow_up_date when a follow-up is rescheduled
CREATE OR REPLACE FUNCTION sp_followup_reschedule(
  p_followup_id INT,
  p_user_id INT,
  p_new_due_at TIMESTAMPTZ,
  p_notes TEXT
)
RETURNS TABLE (affected_rows INT) AS $$
DECLARE
  v_count INT;
  v_call_id INT;
  v_contact_id INT;
BEGIN
  -- Update the follow-up record
  UPDATE follow_ups
  SET
    due_at = p_new_due_at,
    status = 'pending',
    completed_at = NULL,
    notes = CASE 
      WHEN p_notes IS NOT NULL AND p_notes <> '' THEN COALESCE(notes || E'\nRescheduled: ' || p_notes, p_notes)
      ELSE notes
    END
  WHERE follow_ups.id = p_followup_id AND follow_ups.user_id = p_user_id
  RETURNING call_id, contact_id INTO v_call_id, v_contact_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Synchronize calls.follow_up_date
  IF v_call_id IS NOT NULL THEN
    UPDATE calls
    SET follow_up_date = p_new_due_at
    WHERE id = v_call_id;
  ELSIF v_contact_id IS NOT NULL THEN
    -- Fallback if call_id wasn't directly linked: link and sync to the most recent call for this contact
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.contact_id = v_contact_id AND c.user_id = p_user_id
    ORDER BY c.called_at DESC
    LIMIT 1;

    IF v_call_id IS NOT NULL THEN
      UPDATE follow_ups SET call_id = v_call_id WHERE id = p_followup_id;
      UPDATE calls SET follow_up_date = p_new_due_at WHERE id = v_call_id;
    END IF;
  END IF;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_call_create:
-- Fix due_at column name and pass notes = p_purpose for auto-scheduled follow-up
CREATE OR REPLACE FUNCTION sp_call_create(
  p_user_id INT,
  p_contact_number VARCHAR,
  p_duration_seconds INT,
  p_status VARCHAR,
  p_purpose VARCHAR,
  p_outcome VARCHAR,
  p_called_at TIMESTAMPTZ,
  p_follow_up_date TIMESTAMPTZ
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
  v_contact_id INT;
  v_contact_name VARCHAR;
  v_project_id INT;
  v_call_id INT;
  v_clean_num VARCHAR;
BEGIN
  -- Normalize number (digits only)
  v_clean_num := REGEXP_REPLACE(p_contact_number, '[^0-9]', '', 'g');

  -- 1. Auto-lookup assigned contact and their project_id
  SELECT ct.id, ct.name, ct.project_id
  INTO v_contact_id, v_contact_name, v_project_id
  FROM contacts ct
  WHERE ct.assigned_user_id = p_user_id
    AND (
      ct.mobile_number = p_contact_number
      OR ct.alternate_number = p_contact_number
      OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_num, 10))
    )
  LIMIT 1;

  -- If not assigned to this user, check if contact exists anywhere
  IF v_contact_id IS NULL THEN
    SELECT ct.id, ct.name, ct.project_id
    INTO v_contact_id, v_contact_name, v_project_id
    FROM contacts ct
    WHERE (
      ct.mobile_number = p_contact_number
      OR ct.alternate_number = p_contact_number
      OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_num, 10))
    )
    LIMIT 1;
  END IF;

  -- 2. Insert call record with auto-linked contact_id and project_id
  INSERT INTO calls (
    user_id,
    contact_id,
    project_id,
    contact_number,
    duration_seconds,
    status,
    purpose,
    outcome,
    called_at,
    follow_up_date
  )
  VALUES (
    p_user_id,
    v_contact_id,
    v_project_id,
    p_contact_number,
    p_duration_seconds,
    p_status,
    p_purpose,
    p_outcome,
    p_called_at,
    p_follow_up_date
  )
  ON CONFLICT ON CONSTRAINT uq_user_called_contact DO UPDATE
  SET
    duration_seconds = EXCLUDED.duration_seconds,
    status = EXCLUDED.status,
    contact_id = COALESCE(calls.contact_id, EXCLUDED.contact_id),
    project_id = COALESCE(calls.project_id, EXCLUDED.project_id),
    outcome = EXCLUDED.outcome,
    purpose = EXCLUDED.purpose,
    follow_up_date = EXCLUDED.follow_up_date
  RETURNING calls.id INTO v_call_id;

  IF v_call_id IS NULL THEN
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.user_id = p_user_id AND c.called_at = p_called_at AND c.contact_number = p_contact_number
    LIMIT 1;
  END IF;

  -- 3. Auto-schedule follow-up if outcome is follow_up_required or follow_up_date is set
  IF (p_outcome = 'follow_up_required' OR p_follow_up_date IS NOT NULL) AND p_follow_up_date IS NOT NULL AND v_contact_id IS NOT NULL AND v_call_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM follow_ups f WHERE f.call_id = v_call_id) THEN
      UPDATE follow_ups
      SET
        due_at = p_follow_up_date,
        status = 'pending',
        notes = COALESCE(p_purpose, notes)
      WHERE call_id = v_call_id;
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
  END IF;

  -- 4. Return the inserted/updated call
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

-- 3. Update sp_call_update:
-- Synchronizes follow_ups when call is edited from call logs
CREATE OR REPLACE FUNCTION sp_call_update(
  p_call_id INT,
  p_user_id INT,
  p_purpose VARCHAR,
  p_outcome VARCHAR,
  p_follow_up_date TIMESTAMPTZ,
  p_has_purpose BOOLEAN,
  p_has_outcome BOOLEAN,
  p_has_follow_up_date BOOLEAN
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
  v_contact_id INT;
  v_contact_name VARCHAR;
  v_contact_number VARCHAR;
  v_clean_num VARCHAR;
BEGIN
  -- 1. Fetch current call details
  SELECT c.contact_id, c.contact_number
  INTO v_contact_id, v_contact_number
  FROM calls c
  WHERE c.id = p_call_id AND c.user_id = p_user_id;

  -- If contact_id not set on call, search contacts
  IF v_contact_id IS NULL AND v_contact_number IS NOT NULL THEN
    v_clean_num := REGEXP_REPLACE(v_contact_number, '[^0-9]', '', 'g');
    SELECT ct.id, ct.name
    INTO v_contact_id, v_contact_name
    FROM contacts ct
    WHERE ct.assigned_user_id = p_user_id
      AND (
        ct.mobile_number = v_contact_number
        OR ct.alternate_number = v_contact_number
        OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_num, 10))
      )
    LIMIT 1;
  ELSE
    SELECT ct.name INTO v_contact_name FROM contacts ct WHERE ct.id = v_contact_id;
  END IF;

  -- 2. Update the call
  UPDATE calls
  SET
    contact_id = COALESCE(calls.contact_id, v_contact_id),
    purpose = CASE WHEN p_has_purpose THEN p_purpose ELSE calls.purpose END,
    outcome = CASE WHEN p_has_outcome THEN p_outcome ELSE calls.outcome END,
    follow_up_date = CASE 
      WHEN p_has_follow_up_date THEN p_follow_up_date 
      WHEN p_has_outcome AND p_outcome <> 'follow_up_required' THEN NULL
      ELSE calls.follow_up_date 
    END
  WHERE calls.id = p_call_id AND calls.user_id = p_user_id;

  -- 3. Auto-sync follow_ups table
  IF p_has_follow_up_date THEN
    IF p_follow_up_date IS NOT NULL AND v_contact_id IS NOT NULL THEN
      -- If follow_up already exists for this call, update it
      IF EXISTS (SELECT 1 FROM follow_ups f WHERE f.call_id = p_call_id AND f.user_id = p_user_id) THEN
        UPDATE follow_ups
        SET
          due_at = p_follow_up_date,
          status = 'pending',
          notes = CASE WHEN p_has_purpose AND p_purpose IS NOT NULL AND p_purpose <> '' THEN p_purpose ELSE follow_ups.notes END
        WHERE follow_ups.call_id = p_call_id AND follow_ups.user_id = p_user_id;
      ELSE
        -- Insert new follow-up
        INSERT INTO follow_ups (user_id, contact_id, call_id, due_at, notes, status)
        VALUES (
          p_user_id,
          v_contact_id,
          p_call_id,
          p_follow_up_date,
          CASE WHEN p_has_purpose THEN p_purpose ELSE NULL END,
          'pending'
        );
      END IF;
    ELSIF p_follow_up_date IS NULL THEN
      -- Follow-up date was cleared, cancel active follow-up for this call
      UPDATE follow_ups
      SET status = 'cancelled'
      WHERE follow_ups.call_id = p_call_id AND follow_ups.user_id = p_user_id AND follow_ups.status = 'pending';
    END IF;
  ELSIF p_has_outcome AND p_outcome <> 'follow_up_required' THEN
    -- Outcome changed away from follow-up required, cancel pending follow-up
    UPDATE follow_ups
    SET status = 'cancelled'
    WHERE follow_ups.call_id = p_call_id AND follow_ups.user_id = p_user_id AND follow_ups.status = 'pending';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.contact_id,
    v_contact_name AS contact_name,
    c.contact_number,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    c.called_at,
    c.created_at
  FROM calls c
  WHERE c.id = p_call_id AND c.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 4. Update sp_call_get_paginated:
-- Guarantees the query returns the latest follow-up due_at
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
    COALESCE(fu.due_at, c.follow_up_date) AS follow_up_date,
    fu.status::VARCHAR AS follow_up_status,
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN LATERAL (
    SELECT f.status, f.due_at
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
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 5. Update sp_admin_get_calls:
-- Guarantees admin master log returns the latest follow-up due_at
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
    COALESCE(fu.due_at, c.follow_up_date) AS follow_up_date,
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
    SELECT f.status, f.due_at
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

-- 6. Retroactively synchronize existing follow-up dates into calls
UPDATE calls c
SET follow_up_date = f.due_at
FROM follow_ups f
WHERE f.call_id = c.id
  AND f.status = 'pending'
  AND (c.follow_up_date IS DISTINCT FROM f.due_at);

