-- ============================================================
-- Migration 030: Add Contact Name, Category, and City to Call Logs
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Drop existing sp_call_get_paginated so the return type signature can be updated cleanly
DROP FUNCTION IF EXISTS sp_call_get_paginated(INT, VARCHAR, VARCHAR, VARCHAR, INT, INT);

-- 2. Recreate sp_call_get_paginated with contact_category and contact_city
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
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city
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
    SELECT ct_sub.id, ct_sub.name, ct_sub.category, ct_sub.city
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

