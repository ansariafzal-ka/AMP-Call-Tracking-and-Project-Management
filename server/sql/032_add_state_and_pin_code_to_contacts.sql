-- ============================================================
-- Migration 032: Add State and Pin Code to Contacts Table & Procedures
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Alter contacts table to add state and pin_code columns
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state VARCHAR(100) NULL;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pin_code VARCHAR(20) NULL;

-- 2. Update sp_admin_get_contacts
DROP FUNCTION IF EXISTS sp_admin_get_contacts(VARCHAR, VARCHAR, VARCHAR, INT, BOOLEAN, INT, INT, INT);
CREATE OR REPLACE FUNCTION sp_admin_get_contacts(
  p_search VARCHAR,
  p_category VARCHAR,
  p_city VARCHAR,
  p_assigned_user_id INT,
  p_unassigned_only BOOLEAN,
  p_project_id INT,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  alternate_number VARCHAR,
  email VARCHAR,
  city VARCHAR,
  state VARCHAR,
  pin_code VARCHAR,
  category VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ,
  assigned_user_id INT,
  assigned_user_name VARCHAR,
  assigned_user_email VARCHAR,
  project_id INT,
  project_name VARCHAR,
  total_calls BIGINT,
  last_called_at TIMESTAMPTZ,
  last_call_status VARCHAR,
  last_call_outcome VARCHAR,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  -- Count total matching contacts
  SELECT COUNT(*) INTO v_filtered_total
  FROM contacts ct
  WHERE (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
    AND (
      p_city IS NULL OR p_city = ''
      OR ct.city ILIKE p_city
    )
    AND (
      (p_unassigned_only IS TRUE AND ct.assigned_user_id IS NULL)
      OR (p_unassigned_only IS NOT TRUE AND (p_assigned_user_id IS NULL OR ct.assigned_user_id = p_assigned_user_id))
    )
    AND (
      p_project_id IS NULL OR ct.project_id = p_project_id
    );

  RETURN QUERY
  SELECT
    ct.id,
    ct.name,
    ct.mobile_number,
    ct.alternate_number,
    ct.email,
    ct.city,
    ct.state,
    ct.pin_code,
    ct.category,
    ct.notes,
    ct.created_at,
    ct.assigned_user_id,
    u.full_name AS assigned_user_name,
    u.email AS assigned_user_email,
    ct.project_id,
    p.name AS project_name,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    v_filtered_total AS filtered_total
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
    WHERE c.contact_id = ct.id OR c.contact_number = ct.mobile_number
  ) cs ON TRUE
  WHERE (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
    AND (
      p_city IS NULL OR p_city = ''
      OR ct.city ILIKE p_city
    )
    AND (
      (p_unassigned_only IS TRUE AND ct.assigned_user_id IS NULL)
      OR (p_unassigned_only IS NOT TRUE AND (p_assigned_user_id IS NULL OR ct.assigned_user_id = p_assigned_user_id))
    )
    AND (
      p_project_id IS NULL OR ct.project_id = p_project_id
    )
  ORDER BY ct.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 3. Update sp_admin_update_contact
DROP FUNCTION IF EXISTS sp_admin_update_contact(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INT, INT);
DROP FUNCTION IF EXISTS sp_admin_update_contact(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INT, INT);
CREATE OR REPLACE FUNCTION sp_admin_update_contact(
  p_contact_id INT,
  p_name VARCHAR,
  p_mobile_number VARCHAR,
  p_alternate_number VARCHAR,
  p_email VARCHAR,
  p_city VARCHAR,
  p_state VARCHAR,
  p_pin_code VARCHAR,
  p_category VARCHAR,
  p_notes TEXT,
  p_project_id INT,
  p_assigned_user_id INT
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  alternate_number VARCHAR,
  email VARCHAR,
  city VARCHAR,
  state VARCHAR,
  pin_code VARCHAR,
  category VARCHAR,
  notes TEXT,
  project_id INT,
  project_name VARCHAR,
  assigned_user_id INT,
  assigned_to_name VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
BEGIN
  UPDATE contacts
  SET
    name = COALESCE(NULLIF(TRIM(p_name), ''), contacts.name),
    mobile_number = COALESCE(NULLIF(TRIM(p_mobile_number), ''), contacts.mobile_number),
    alternate_number = NULLIF(TRIM(p_alternate_number), ''),
    email = NULLIF(TRIM(p_email), ''),
    city = NULLIF(TRIM(p_city), ''),
    state = NULLIF(TRIM(p_state), ''),
    pin_code = NULLIF(TRIM(p_pin_code), ''),
    category = COALESCE(NULLIF(TRIM(p_category), ''), contacts.category),
    notes = p_notes,
    project_id = p_project_id,
    assigned_user_id = p_assigned_user_id
  WHERE contacts.id = p_contact_id;

  -- Auto-enroll coordinator into project_users if both project and user are set
  IF p_project_id IS NOT NULL AND p_assigned_user_id IS NOT NULL THEN
    INSERT INTO project_users (project_id, user_id)
    VALUES (p_project_id, p_assigned_user_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Retroactively link any past calls made to this contact's phone numbers
  IF p_project_id IS NOT NULL THEN
    UPDATE calls
    SET
      project_id = p_project_id,
      contact_id = p_contact_id
    WHERE (
      contact_id = p_contact_id
      OR contact_number = p_mobile_number
      OR (p_alternate_number IS NOT NULL AND contact_number = p_alternate_number)
    )
    AND (calls.project_id IS NULL OR calls.contact_id IS NULL);
  END IF;

  RETURN QUERY
  SELECT
    ct.id,
    ct.name,
    ct.mobile_number,
    ct.alternate_number,
    ct.email,
    ct.city,
    ct.state,
    ct.pin_code,
    ct.category,
    ct.notes,
    ct.project_id,
    p.name AS project_name,
    ct.assigned_user_id,
    u.full_name AS assigned_to_name,
    ct.created_at
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  WHERE ct.id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

-- 4. Update sp_admin_bulk_import_contacts
DROP FUNCTION IF EXISTS sp_admin_bulk_import_contacts(JSONB);
CREATE OR REPLACE FUNCTION sp_admin_bulk_import_contacts(p_contacts JSONB)
RETURNS TABLE (
  imported_count INT,
  assigned_count INT,
  unassigned_count INT
) AS $$
DECLARE
  v_imported INT := 0;
  v_assigned INT := 0;
  v_unassigned INT := 0;
BEGIN
  WITH inserted_rows AS (
    INSERT INTO contacts (
      name,
      mobile_number,
      alternate_number,
      email,
      city,
      state,
      pin_code,
      category,
      notes,
      assigned_user_id,
      project_id
    )
    SELECT
      COALESCE(NULLIF(TRIM(c->>'name'), ''), 'Unknown Contact'),
      TRIM(c->>'mobile_number'),
      NULLIF(TRIM(c->>'alternate_number'), ''),
      NULLIF(TRIM(c->>'email'), ''),
      NULLIF(TRIM(c->>'city'), ''),
      NULLIF(TRIM(c->>'state'), ''),
      COALESCE(
        NULLIF(TRIM(c->>'pin_code'), ''),
        NULLIF(TRIM(c->>'pincode'), ''),
        NULLIF(TRIM(c->>'zip'), ''),
        NULLIF(TRIM(c->>'zipcode'), '')
      ),
      COALESCE(NULLIF(TRIM(c->>'category'), ''), 'Donor'),
      NULLIF(TRIM(c->>'notes'), ''),
      CASE 
        WHEN c->>'assigned_user_id' IS NOT NULL AND (c->>'assigned_user_id')::INT > 0 
        THEN (c->>'assigned_user_id')::INT 
        ELSE NULL 
      END,
      CASE 
        WHEN c->>'project_id' IS NOT NULL AND (c->>'project_id')::INT > 0 
        THEN (c->>'project_id')::INT 
        ELSE NULL 
      END
    FROM jsonb_array_elements(p_contacts) AS c
    WHERE TRIM(c->>'mobile_number') IS NOT NULL AND TRIM(c->>'mobile_number') <> ''
    RETURNING id, assigned_user_id, project_id
  )
  SELECT
    COALESCE(COUNT(*)::INT, 0),
    COALESCE(COUNT(assigned_user_id)::INT, 0),
    COALESCE(COUNT(*) FILTER (WHERE assigned_user_id IS NULL)::INT, 0)
  INTO v_imported, v_assigned, v_unassigned
  FROM inserted_rows;

  -- Auto-enroll any assigned user into the project's team roster
  INSERT INTO project_users (project_id, user_id)
  SELECT DISTINCT project_id, assigned_user_id
  FROM contacts
  WHERE project_id IS NOT NULL AND assigned_user_id IS NOT NULL
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN QUERY SELECT v_imported, v_assigned, v_unassigned;
END;
$$ LANGUAGE plpgsql;

-- 5. Update sp_contact_get_assigned (Caller calling queue)
DROP FUNCTION IF EXISTS sp_contact_get_assigned(INT, VARCHAR, VARCHAR, INT, INT);
CREATE OR REPLACE FUNCTION sp_contact_get_assigned(
  p_user_id INT,
  p_search VARCHAR,
  p_category VARCHAR,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  assigned_user_id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  alternate_number VARCHAR,
  email VARCHAR,
  city VARCHAR,
  state VARCHAR,
  pin_code VARCHAR,
  category VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ,
  total_calls BIGINT,
  last_called_at TIMESTAMPTZ,
  last_call_status VARCHAR,
  last_call_outcome VARCHAR,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  -- Count total matching contacts for caller
  SELECT COUNT(*) INTO v_filtered_total
  FROM contacts ct
  WHERE ct.assigned_user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    );

  RETURN QUERY
  SELECT
    ct.id,
    ct.assigned_user_id,
    ct.name,
    ct.mobile_number,
    ct.alternate_number,
    ct.email,
    ct.city,
    ct.state,
    ct.pin_code,
    ct.category,
    ct.notes,
    ct.created_at,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN LATERAL (
    SELECT
      COUNT(c.id) AS total_calls,
      MAX(c.called_at) AS last_called_at,
      (SELECT c2.status FROM calls c2 WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number) ORDER BY c2.called_at DESC LIMIT 1) AS last_call_status,
      (SELECT c3.outcome FROM calls c3 WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number) ORDER BY c3.called_at DESC LIMIT 1) AS last_call_outcome
    FROM calls c
    WHERE c.contact_id = ct.id OR c.contact_number = ct.mobile_number
  ) cs ON TRUE
  WHERE ct.assigned_user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
  ORDER BY
    (cs.last_called_at IS NULL) DESC,
    cs.last_called_at ASC,
    ct.id ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 6. Update sp_contact_lookup
DROP FUNCTION IF EXISTS sp_contact_lookup(INT, VARCHAR);
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
  state VARCHAR,
  pin_code VARCHAR,
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
    ct.state,
    ct.pin_code,
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
    WHERE c.contact_id = ct.id OR c.contact_number = ct.mobile_number
  ) cs ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.due_at
    FROM follow_ups f
    WHERE f.contact_id = ct.id AND f.status = 'pending'
    ORDER BY f.due_at ASC
    LIMIT 1
  ) fu ON TRUE
  WHERE ct.mobile_number = p_number
     OR ct.alternate_number = p_number
     OR (LENGTH(v_clean_num) >= 10 AND RIGHT(REGEXP_REPLACE(ct.mobile_number, '[^0-9]', '', 'g'), 10) = v_clean_num)
  ORDER BY (ct.assigned_user_id = p_user_id) DESC, (ct.mobile_number = p_number) DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 7. Update sp_call_get_paginated to return contact_state and contact_pin_code
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT);
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
  contact_category VARCHAR,
  contact_city VARCHAR,
  contact_state VARCHAR,
  contact_pin_code VARCHAR,
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
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code
    FROM contacts ct_sub
    WHERE ct_sub.id = c.contact_id
       OR (c.contact_id IS NULL AND (
            ct_sub.mobile_number = c.contact_number
            OR (LENGTH(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g')) >= 10
                AND RIGHT(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(ct_sub.mobile_number, '[^0-9]', '', 'g'), 10))
          ))
    ORDER BY (ct_sub.id = c.contact_id) DESC, ct_sub.id DESC
    LIMIT 1
  ) ct ON TRUE
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.category ILIKE '%' || p_search || '%'
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
    COALESCE(c.contact_id, ct.id) AS contact_id,
    ct.name::VARCHAR AS contact_name,
    ct.category::VARCHAR AS contact_category,
    ct.city::VARCHAR AS contact_city,
    ct.state::VARCHAR AS contact_state,
    ct.pin_code::VARCHAR AS contact_pin_code,
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
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code
    FROM contacts ct_sub
    WHERE ct_sub.id = c.contact_id
       OR (c.contact_id IS NULL AND (
            ct_sub.mobile_number = c.contact_number
            OR (LENGTH(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g')) >= 10
                AND RIGHT(REGEXP_REPLACE(c.contact_number, '[^0-9]', '', 'g'), 10) = RIGHT(REGEXP_REPLACE(ct_sub.mobile_number, '[^0-9]', '', 'g'), 10))
          ))
    ORDER BY (ct_sub.id = c.contact_id) DESC, ct_sub.id DESC
    LIMIT 1
  ) ct ON TRUE
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
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.category ILIKE '%' || p_search || '%'
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

