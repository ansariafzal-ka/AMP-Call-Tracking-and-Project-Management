-- ============================================================
-- Migration 008: Auto-link Calls to Contacts and Follow-ups
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- Drop functions before recreating with new return table columns (contact_id, contact_name)
DROP FUNCTION IF EXISTS sp_call_create(INT, VARCHAR, INT, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ);
DROP FUNCTION IF EXISTS sp_call_update(INT, INT, VARCHAR, VARCHAR, TIMESTAMPTZ, BOOLEAN, BOOLEAN, BOOLEAN);
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT);
DROP FUNCTION IF EXISTS sp_call_find_by_id(INT, INT);

-- 1. sp_call_create: Auto-find contact_id and auto-schedule follow-up
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
  v_call_id INT;
  v_clean_num VARCHAR;
BEGIN
  -- Normalize number (last 10 digits if available)
  v_clean_num := REGEXP_REPLACE(p_contact_number, '[^0-9]', '', 'g');

  -- 1. Auto-lookup assigned contact
  SELECT ct.id, ct.name
  INTO v_contact_id, v_contact_name
  FROM contacts ct
  WHERE ct.assigned_user_id = p_user_id
    AND (
      ct.mobile_number = p_contact_number
      OR ct.alternate_number = p_contact_number
      OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = RIGHT(v_clean_num, 10))
    )
  LIMIT 1;

  -- 2. Insert call record with auto-linked contact_id
  INSERT INTO calls (
    user_id,
    contact_id,
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
    contact_id = COALESCE(calls.contact_id, EXCLUDED.contact_id)
  RETURNING calls.id INTO v_call_id;

  -- Fallback if ON CONFLICT DO UPDATE didn't fire RETURNING
  IF v_call_id IS NULL THEN
    SELECT c.id INTO v_call_id
    FROM calls c
    WHERE c.user_id = p_user_id AND c.called_at = p_called_at AND c.contact_number = p_contact_number
    LIMIT 1;
  END IF;

  -- 3. Auto-insert follow-up if date is set and contact is known
  IF p_follow_up_date IS NOT NULL AND v_contact_id IS NOT NULL AND v_call_id IS NOT NULL THEN
    INSERT INTO follow_ups (user_id, contact_id, call_id, due_at, notes, status)
    VALUES (p_user_id, v_contact_id, v_call_id, p_follow_up_date, p_purpose, 'pending');
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
  WHERE c.id = v_call_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 2. sp_call_update: Auto-link contact and auto-sync follow_ups table
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
    follow_up_date = CASE WHEN p_has_follow_up_date THEN p_follow_up_date ELSE calls.follow_up_date END
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
          notes = CASE WHEN p_has_purpose THEN p_purpose ELSE follow_ups.notes END
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

-- 3. sp_call_get_paginated: Include contact_id & contact_name
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
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total
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
    )
  ORDER BY c.called_at DESC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 4. sp_call_find_by_id: Include contact_id & contact_name
CREATE OR REPLACE FUNCTION sp_call_find_by_id(
  p_call_id INT,
  p_user_id INT
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
BEGIN
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
    c.called_at,
    c.created_at
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  WHERE c.id = p_call_id AND c.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;
