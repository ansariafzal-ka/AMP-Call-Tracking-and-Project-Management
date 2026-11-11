-- 020_calling_queue_smart_sorting.sql
-- Prioritize calling queue:
-- 1. Uncalled contacts (0 calls) appear first at the top
-- 2. Contacts with calls are ordered by oldest call date (newly called contacts move to bottom)

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
  -- Total count for pagination
  SELECT COUNT(*) INTO v_filtered_total
  FROM contacts ct
  WHERE ct.assigned_user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
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
    ct.category,
    ct.notes,
    ct.created_at,
    COALESCE(call_stats.call_count, 0)::BIGINT AS total_calls,
    call_stats.max_called_at AS last_called_at,
    call_stats.last_status AS last_call_status,
    call_stats.last_outcome AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN LATERAL (
    SELECT
      COUNT(c.id) AS call_count,
      MAX(c.called_at) AS max_called_at,
      (
        SELECT c2.status
        FROM calls c2
        WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number)
          AND c2.user_id = p_user_id
        ORDER BY c2.called_at DESC
        LIMIT 1
      ) AS last_status,
      (
        SELECT c3.outcome
        FROM calls c3
        WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number)
          AND c3.user_id = p_user_id
        ORDER BY c3.called_at DESC
        LIMIT 1
      ) AS last_outcome
    FROM calls c
    WHERE (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
      AND c.user_id = p_user_id
  ) call_stats ON TRUE
  WHERE ct.assigned_user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
  ORDER BY
    (COALESCE(call_stats.call_count, 0) = 0) DESC, -- Uncalled (0 calls) first
    call_stats.max_called_at ASC NULLS FIRST,      -- Older calls before newly completed calls
    ct.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

