-- ============================================================
-- Migration 006: Contacts, Contact Calls, and User Stats
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Contacts Table
CREATE TABLE IF NOT EXISTS contacts (
  id SERIAL PRIMARY KEY,
  assigned_user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(20) NOT NULL,
  alternate_number VARCHAR(20) NULL,
  email VARCHAR(255) NULL,
  city VARCHAR(100) NULL,
  category VARCHAR(50) NOT NULL DEFAULT 'Other',
  notes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_contacts_user ON contacts(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_contacts_mobile ON contacts(mobile_number);

-- 2. Link Calls Table to Contacts
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'contact_id'
  ) THEN 
    ALTER TABLE calls ADD COLUMN contact_id INT REFERENCES contacts(id) ON DELETE SET NULL;
    CREATE INDEX idx_calls_contact ON calls(contact_id);
  END IF; 
END $$;

-- 3. Stored Functions

-- sp_contact_get_assigned: Get paginated assigned contacts with filters & call summary
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
      ) AS last_status
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
  ORDER BY ct.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- sp_contact_get_by_id: Fetch single contact by ID for the assigned user
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
  category VARCHAR,
  notes TEXT,
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
    ct.category,
    ct.notes,
    ct.created_at,
    COUNT(c.id)::BIGINT AS total_calls
  FROM contacts ct
  LEFT JOIN calls c ON (c.contact_id = ct.id OR c.contact_number = ct.mobile_number) AND c.user_id = p_user_id
  WHERE ct.id = p_contact_id AND ct.assigned_user_id = p_user_id
  GROUP BY ct.id;
END;
$$ LANGUAGE plpgsql;

-- sp_contact_get_call_history: Fetch all calls made to a specific contact
CREATE OR REPLACE FUNCTION sp_contact_get_call_history(
  p_contact_id INT,
  p_user_id INT
)
RETURNS TABLE (
  id INT,
  user_id INT,
  contact_id INT,
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
    c.contact_number,
    c.duration_seconds,
    c.status,
    c.purpose,
    c.outcome,
    c.follow_up_date,
    c.called_at,
    c.created_at
  FROM calls c
  JOIN contacts ct ON (c.contact_id = ct.id OR c.contact_number = ct.mobile_number)
  WHERE ct.id = p_contact_id AND c.user_id = p_user_id
  ORDER BY c.called_at DESC;
END;
$$ LANGUAGE plpgsql;

-- sp_user_get_stats: Get personal caller stats
CREATE OR REPLACE FUNCTION sp_user_get_stats(p_user_id INT)
RETURNS TABLE (
  total_assigned_contacts BIGINT,
  calls_made_today BIGINT,
  connected_calls_today BIGINT,
  total_talk_time_today_seconds BIGINT,
  pending_follow_ups BIGINT,
  total_calls_all_time BIGINT
) AS $$
DECLARE
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*)::BIGINT FROM contacts WHERE assigned_user_id = p_user_id) AS total_assigned_contacts,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start) AS calls_made_today,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start AND status = 'answered') AS connected_calls_today,
    (SELECT COALESCE(SUM(duration_seconds), 0)::BIGINT FROM calls WHERE user_id = p_user_id AND called_at >= v_today_start) AS total_talk_time_today_seconds,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id AND follow_up_date IS NOT NULL AND follow_up_date >= NOW()) AS pending_follow_ups,
    (SELECT COUNT(*)::BIGINT FROM calls WHERE user_id = p_user_id) AS total_calls_all_time;
END;
$$ LANGUAGE plpgsql;

-- sp_user_update_profile: Update caller name and/or mobile number
CREATE OR REPLACE FUNCTION sp_user_update_profile(
  p_user_id INT,
  p_full_name VARCHAR,
  p_mobile_number VARCHAR
)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  UPDATE users u
  SET
    full_name = COALESCE(NULLIF(p_full_name, ''), u.full_name),
    mobile_number = COALESCE(NULLIF(p_mobile_number, ''), u.mobile_number)
  WHERE u.id = p_user_id;

  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.created_at
  FROM users u
  WHERE u.id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

