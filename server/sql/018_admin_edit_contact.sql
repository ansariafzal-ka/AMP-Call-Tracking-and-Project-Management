-- ============================================================
-- Migration 018: Admin Edit Contact & Return Project Info
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Create or replace stored procedure to update contact
CREATE OR REPLACE FUNCTION sp_admin_update_contact(
  p_contact_id INT,
  p_name VARCHAR,
  p_mobile_number VARCHAR,
  p_alternate_number VARCHAR,
  p_email VARCHAR,
  p_city VARCHAR,
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
  category VARCHAR,
  notes TEXT,
  project_id INT,
  assigned_user_id INT,
  updated_at TIMESTAMPTZ
) AS $$
DECLARE
  v_old_assigned_user_id INT;
BEGIN
  -- Verify contact exists
  IF NOT EXISTS (SELECT 1 FROM contacts c WHERE c.id = p_contact_id) THEN
    RAISE EXCEPTION 'Contact with ID % not found', p_contact_id;
  END IF;

  SELECT c.assigned_user_id INTO v_old_assigned_user_id
  FROM contacts c
  WHERE c.id = p_contact_id;

  -- Update contact
  UPDATE contacts
  SET
    name = COALESCE(NULLIF(TRIM(p_name), ''), contacts.name),
    mobile_number = COALESCE(NULLIF(TRIM(p_mobile_number), ''), contacts.mobile_number),
    alternate_number = NULLIF(TRIM(p_alternate_number), ''),
    email = NULLIF(TRIM(p_email), ''),
    city = NULLIF(TRIM(p_city), ''),
    category = COALESCE(NULLIF(TRIM(p_category), ''), contacts.category),
    notes = NULLIF(TRIM(p_notes), ''),
    project_id = p_project_id,
    assigned_user_id = p_assigned_user_id
  WHERE contacts.id = p_contact_id;

  -- If coordinator changed and is set, reassign pending follow-ups
  IF p_assigned_user_id IS NOT NULL AND (v_old_assigned_user_id IS NULL OR v_old_assigned_user_id != p_assigned_user_id) THEN
    UPDATE follow_ups
    SET user_id = p_assigned_user_id
    WHERE contact_id = p_contact_id AND status = 'pending';
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.mobile_number,
    c.alternate_number,
    c.email,
    c.city,
    c.category,
    c.notes,
    c.project_id,
    c.assigned_user_id,
    NOW() AS updated_at
  FROM contacts c
  WHERE c.id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_admin_get_contacts to also return project_id and project_name
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
    ct.category,
    ct.notes,
    ct.created_at,
    ct.assigned_user_id,
    u.full_name AS assigned_user_name,
    u.email AS assigned_user_email,
    ct.project_id,
    p.name AS project_name,
    COALESCE(call_stats.call_count, 0)::BIGINT AS total_calls,
    call_stats.max_called_at AS last_called_at,
    call_stats.last_status AS last_call_status,
    call_stats.last_outcome AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(c.id) AS call_count,
      MAX(c.called_at) AS max_called_at,
      (
        SELECT c2.status
        FROM calls c2
        WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number)
        ORDER BY c2.called_at DESC
        LIMIT 1
      ) AS last_status,
      (
        SELECT c3.outcome
        FROM calls c3
        WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number)
        ORDER BY c3.called_at DESC
        LIMIT 1
      ) AS last_outcome
    FROM calls c
    WHERE (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
  ) call_stats ON true
  WHERE (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
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

