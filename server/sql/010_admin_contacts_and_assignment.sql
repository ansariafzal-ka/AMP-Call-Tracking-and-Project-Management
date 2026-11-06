-- ============================================================
-- Migration 010: Admin Master Contacts Directory & Assignment
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Allow assigned_user_id to be NULL for unassigned contacts
ALTER TABLE contacts ALTER COLUMN assigned_user_id DROP NOT NULL;

-- 2. sp_admin_get_contacts: Master contacts directory with caller info and team call stats
CREATE OR REPLACE FUNCTION sp_admin_get_contacts(
  p_search VARCHAR,
  p_category VARCHAR,
  p_city VARCHAR,
  p_assigned_user_id INT,
  p_unassigned_only BOOLEAN,
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
    COALESCE(call_stats.call_count, 0)::BIGINT AS total_calls,
    call_stats.max_called_at AS last_called_at,
    call_stats.last_status AS last_call_status,
    call_stats.last_outcome AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
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
  ) call_stats ON TRUE
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
  ORDER BY ct.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 3. sp_admin_assign_contacts: Assign/reassign specific contact IDs to a target user
CREATE OR REPLACE FUNCTION sp_admin_assign_contacts(
  p_contact_ids INT[],
  p_target_user_id INT,
  p_reassign_follow_ups BOOLEAN
)
RETURNS TABLE (assigned_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Update assigned_user_id on contacts
  UPDATE contacts
  SET assigned_user_id = p_target_user_id
  WHERE id = ANY(p_contact_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- If reassigning follow-ups, also update pending follow-ups to the new caller
  IF p_reassign_follow_ups IS TRUE THEN
    UPDATE follow_ups
    SET user_id = p_target_user_id
    WHERE contact_id = ANY(p_contact_ids)
      AND status = 'pending';
  END IF;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

