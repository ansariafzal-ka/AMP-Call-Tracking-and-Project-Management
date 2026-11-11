-- ============================================================
-- Migration 037: Add project_id and project_name to all Caller views and queries
-- Enables project badges across Dashboard, Contacts, Follow-ups, and Modals
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Update sp_contact_get_assigned (Contacts Screen queue)
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
  project_id INT,
  project_name VARCHAR,
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
    COALESCE(ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p.name, pr_first.project_name)::VARCHAR AS project_name,
    ct.created_at,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
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

-- 2. Update sp_contact_get_by_id (Contact Details Modal)
DROP FUNCTION IF EXISTS sp_contact_get_by_id(INT, INT);

CREATE OR REPLACE FUNCTION sp_contact_get_by_id(
  p_contact_id INT,
  p_user_id INT
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
  project_id INT,
  project_name VARCHAR,
  created_at TIMESTAMPTZ,
  total_calls BIGINT
) AS $$
BEGIN
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
    COALESCE(ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p.name, pr_first.project_name)::VARCHAR AS project_name,
    ct.created_at,
    COUNT(c.id)::BIGINT AS total_calls
  FROM contacts ct
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
  LEFT JOIN calls c ON (c.contact_id = ct.id OR c.contact_number = ct.mobile_number) AND c.user_id = p_user_id
  WHERE ct.id = p_contact_id AND ct.assigned_user_id = p_user_id
  GROUP BY ct.id, p.name, pr_first.project_id, pr_first.project_name;
END;
$$ LANGUAGE plpgsql;

-- 3. Update sp_contact_lookup (Auto-recognition & Keypad lookup)
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
    COALESCE(ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p.name, pr_first.project_name)::VARCHAR AS project_name,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    fu.due_at AS pending_follow_up_due_at
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
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

-- 4. Update sp_call_get_paginated (Dashboard Recent Activity & Call History)
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
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_filtered_total
  FROM calls c
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code, ct_sub.project_id
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
      OR (p_outcome = 'not_dispositioned' AND c.outcome IS NULL)
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
    ct.category AS contact_category,
    ct.city AS contact_city,
    ct.state AS contact_state,
    ct.pin_code AS contact_pin_code,
    c.contact_number,
    COALESCE(c.project_id, ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p_call.name, p_ct.name, pr_first.project_name)::VARCHAR AS project_name,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    fu.status AS follow_up_status,
    c.called_at,
    c.created_at,
    v_filtered_total AS filtered_total
  FROM calls c
  LEFT JOIN LATERAL (
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city, ct_sub.state, ct_sub.pin_code, ct_sub.project_id
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
  LEFT JOIN projects p_call ON p_call.id = c.project_id
  LEFT JOIN projects p_ct ON p_ct.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
  LEFT JOIN LATERAL (
    SELECT f.status
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
      OR (p_outcome = 'not_dispositioned' AND c.outcome IS NULL)
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

-- 5. Update sp_followup_get_categorized (Follow-ups Screen cards)
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
  project_id INT,
  project_name VARCHAR,
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
  SELECT COUNT(*) INTO v_overdue_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at < v_now;

  SELECT COUNT(*) INTO v_today_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_start
    AND f.due_at < v_today_end;

  SELECT COUNT(*) INTO v_upcoming_cnt
  FROM follow_ups f
  WHERE f.user_id = p_user_id
    AND f.status = 'pending'
    AND f.due_at >= v_today_end;

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
      OR (v_filter = 'all' AND f.status IN ('pending', 'completed'))
    );

  -- 3. Return results joined with contact and project details
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
    COALESCE(ct.project_id, pr_first.project_id) AS project_id,
    COALESCE(p.name, pr_first.project_name)::VARCHAR AS project_name,
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
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT cp.project_id, p2.name AS project_name
    FROM contact_projects cp
    JOIN projects p2 ON p2.id = cp.project_id
    WHERE cp.contact_id = ct.id
    ORDER BY cp.created_at ASC
    LIMIT 1
  ) pr_first ON TRUE
  WHERE f.user_id = p_user_id
    AND (
      (v_filter = 'today' AND f.status = 'pending' AND f.due_at >= v_today_start AND f.due_at < v_today_end)
      OR (v_filter = 'overdue' AND f.status = 'pending' AND f.due_at < v_now)
      OR (v_filter = 'upcoming' AND f.status = 'pending' AND f.due_at >= v_today_end)
      OR (v_filter = 'completed' AND f.status = 'completed')
      OR (v_filter = 'all' AND f.status IN ('pending', 'completed'))
    )
  ORDER BY
    CASE WHEN v_filter = 'completed' THEN f.completed_at ELSE f.due_at END DESC NULLS LAST
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 6. Update sp_call_create to automatically attach project_id to calls and return project_name
DROP FUNCTION IF EXISTS sp_call_create(INT, VARCHAR, INT, VARCHAR, VARCHAR, VARCHAR, TIMESTAMPTZ, TIMESTAMPTZ);

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
  project_id INT,
  project_name VARCHAR,
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
  v_project_id INT := NULL;
  v_clean_num VARCHAR;
BEGIN
  -- 1. Auto-lookup contact if exists for this caller or number
  v_clean_num := REGEXP_REPLACE(p_contact_number, '[^0-9]', '', 'g');
  IF LENGTH(v_clean_num) > 10 THEN
    v_clean_num := RIGHT(v_clean_num, 10);
  END IF;

  SELECT
    ct.id,
    ct.name,
    COALESCE(ct.project_id, (SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = ct.id ORDER BY cp.created_at ASC LIMIT 1))
  INTO v_contact_id, v_contact_name, v_project_id
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
    project_id,
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
    v_project_id,
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
        project_id = COALESCE(calls.project_id, EXCLUDED.project_id),
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
    UPDATE follow_ups
    SET status = 'cancelled'
    WHERE follow_ups.contact_id = v_contact_id 
      AND follow_ups.status = 'pending';

    IF EXISTS (SELECT 1 FROM follow_ups WHERE follow_ups.call_id = v_call_id) THEN
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
    UPDATE follow_ups
    SET
      status = 'completed',
      completed_at = CURRENT_TIMESTAMP,
      notes = COALESCE(follow_ups.notes || E'\nCompleted by call #' || v_call_id, 'Completed by call')
    WHERE follow_ups.contact_id = v_contact_id AND follow_ups.status = 'pending';
  END IF;

  -- 4. Return the inserted or updated call with project details
  RETURN QUERY
  SELECT
    c.id,
    c.user_id,
    c.contact_id,
    COALESCE(ct.name, v_contact_name, 'Unknown') AS contact_name,
    c.contact_number,
    COALESCE(c.project_id, ct.project_id, v_project_id) AS project_id,
    p.name::VARCHAR AS project_name,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    c.called_at,
    c.created_at
  FROM calls c
  LEFT JOIN contacts ct ON ct.id = c.contact_id
  LEFT JOIN projects p ON p.id = COALESCE(c.project_id, ct.project_id, v_project_id)
  WHERE c.id = v_call_id;
END;
$$ LANGUAGE plpgsql;

