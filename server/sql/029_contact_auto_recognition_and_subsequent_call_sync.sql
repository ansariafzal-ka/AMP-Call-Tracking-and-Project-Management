-- ============================================================
-- Migration 029: Contact Auto-Recognition & Subsequent Call Sync
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. sp_contact_lookup: Lookup contact by phone number with calling history & follow-up info
CREATE OR REPLACE FUNCTION sp_contact_lookup(
  p_user_id INT,
  p_number VARCHAR
)
RETURNS TABLE (
  contact_id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  category VARCHAR,
  city VARCHAR,
  is_assigned_to_caller BOOLEAN,
  assigned_user_id INT,
  assigned_user_name VARCHAR,
  project_id INT,
  project_name VARCHAR,
  total_calls BIGINT,
  last_called_at TIMESTAMPTZ,
  last_call_status VARCHAR,
  last_call_outcome VARCHAR,
  pending_follow_up_due_at TIMESTAMPTZ
) AS $$
DECLARE
  v_clean_num VARCHAR;
BEGIN
  v_clean_num := REGEXP_REPLACE(p_number, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_num) > 10 THEN
    v_clean_num := RIGHT(v_clean_num, 10);
  END IF;

  RETURN QUERY
  SELECT
    ct.id AS contact_id,
    ct.name,
    ct.mobile_number,
    ct.category,
    ct.city,
    (ct.assigned_user_id = p_user_id) AS is_assigned_to_caller,
    ct.assigned_user_id,
    u.full_name AS assigned_user_name,
    ct.project_id,
    p.name AS project_name,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    fu.due_at AS pending_follow_up_due_at
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(c.id) AS total_calls,
      MAX(c.called_at) AS last_called_at,
      (SELECT c2.status FROM calls c2 WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number) ORDER BY c2.called_at DESC LIMIT 1) AS last_call_status,
      (SELECT c3.outcome FROM calls c3 WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number) ORDER BY c3.called_at DESC LIMIT 1) AS last_call_outcome
    FROM calls c
    WHERE (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
  ) cs ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.due_at
    FROM follow_ups f
    WHERE f.contact_id = ct.id AND f.status = 'pending'
    ORDER BY f.id DESC
    LIMIT 1
  ) fu ON TRUE
  WHERE (
    ct.mobile_number = p_number
    OR ct.alternate_number = p_number
    OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = v_clean_num)
    OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(COALESCE(ct.alternate_number, ''), '[^0-9]', '', 'g'), 10) = v_clean_num)
  )
  ORDER BY (CASE WHEN ct.assigned_user_id = p_user_id THEN 0 ELSE 1 END), ct.id ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_call_create to handle multi-call follow-up synchronization
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

  -- Fallback project_id from caller's project assignment if contact has no project yet
  IF v_project_id IS NULL THEN
    SELECT pu.project_id INTO v_project_id
    FROM project_users pu
    WHERE pu.user_id = p_user_id
    ORDER BY pu.project_id ASC
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

  -- 3. Follow-up synchronization across contact:
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

-- 3. Update sp_call_update to also sync subsequent contact follow-ups
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
      -- Cancel any other pending follow-ups for this contact
      UPDATE follow_ups
      SET status = 'cancelled'
      WHERE follow_ups.contact_id = v_contact_id 
        AND follow_ups.status = 'pending' 
        AND follow_ups.call_id <> p_call_id;

      IF EXISTS (SELECT 1 FROM follow_ups f WHERE f.call_id = p_call_id AND f.user_id = p_user_id) THEN
        UPDATE follow_ups
        SET
          due_at = p_follow_up_date,
          status = 'pending',
          notes = CASE WHEN p_has_purpose AND p_purpose IS NOT NULL AND p_purpose <> '' THEN p_purpose ELSE follow_ups.notes END
        WHERE follow_ups.call_id = p_call_id AND follow_ups.user_id = p_user_id;
      ELSE
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
      UPDATE follow_ups
      SET status = 'cancelled'
      WHERE follow_ups.call_id = p_call_id AND follow_ups.user_id = p_user_id AND follow_ups.status = 'pending';
    END IF;
  ELSIF p_has_outcome AND p_outcome IN ('interested', 'not_interested') AND v_contact_id IS NOT NULL THEN
    -- Conclusive outcome: resolve pending follow-ups for this contact
    UPDATE follow_ups
    SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      notes = COALESCE(follow_ups.notes || E'\nCompleted by call #' || p_call_id, 'Completed by call')
    WHERE follow_ups.contact_id = v_contact_id AND follow_ups.status = 'pending';
  ELSIF p_has_outcome AND p_outcome <> 'follow_up_required' THEN
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

