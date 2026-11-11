-- 022_fix_call_project_id_and_deduplicate.sql
-- 1. Ensure sp_call_create auto-populates project_id from the contact
-- 2. Backfill project_id for all existing calls
-- 3. Clean up duplicate test contacts

DROP FUNCTION IF EXISTS sp_call_create(INT, VARCHAR, INT, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ);

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
    project_id = COALESCE(calls.project_id, EXCLUDED.project_id)
  RETURNING calls.id INTO v_call_id;

  -- 3. Auto-schedule follow-up if outcome is follow_up_required
  IF p_outcome = 'follow_up_required' AND p_follow_up_date IS NOT NULL THEN
    INSERT INTO follow_ups (
      call_id,
      contact_id,
      user_id,
      scheduled_at,
      status
    )
    VALUES (
      v_call_id,
      v_contact_id,
      p_user_id,
      p_follow_up_date,
      'pending'
    );
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

-- Backfill project_id for existing calls
UPDATE calls c
SET project_id = ct.project_id
FROM contacts ct
WHERE (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
  AND c.project_id IS NULL
  AND ct.project_id IS NOT NULL;

-- Remove redundant duplicate test contacts keeping only the primary one (id: 1)
DELETE FROM contacts
WHERE id IN (2, 3, 4) AND mobile_number = '7738251877';

