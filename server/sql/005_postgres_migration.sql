-- PostgreSQL Schema for AMP Call Tracker
-- Database: call_tracker

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  mobile_number VARCHAR(20) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 2. Calls Table
CREATE TABLE IF NOT EXISTS calls (
  id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  contact_number VARCHAR(20) NOT NULL,
  duration_seconds INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL,
  purpose VARCHAR(255) NULL,
  outcome VARCHAR(50) NULL,
  follow_up_date TIMESTAMPTZ NULL,
  called_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_user_called_contact UNIQUE (user_id, called_at, contact_number)
);

CREATE INDEX IF NOT EXISTS idx_user_called ON calls (user_id, called_at);

-- 3. Stored Functions (PostgreSQL PL/pgSQL)

-- sp_user_find_by_email
CREATE OR REPLACE FUNCTION sp_user_find_by_email(p_email VARCHAR)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  password_hash VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active, u.created_at
  FROM users u
  WHERE u.email = p_email
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_user_find_by_email_or_mobile
CREATE OR REPLACE FUNCTION sp_user_find_by_email_or_mobile(p_email VARCHAR, p_mobile VARCHAR)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  password_hash VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active, u.created_at
  FROM users u
  WHERE u.email = p_email OR u.mobile_number = p_mobile
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_user_find_by_id
CREATE OR REPLACE FUNCTION sp_user_find_by_id(p_id INT)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.created_at
  FROM users u
  WHERE u.id = p_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_user_find_with_password_by_id
CREATE OR REPLACE FUNCTION sp_user_find_with_password_by_id(p_id INT)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  password_hash VARCHAR,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active, u.created_at
  FROM users u
  WHERE u.id = p_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_user_create
CREATE OR REPLACE FUNCTION sp_user_create(
  p_full_name VARCHAR,
  p_email VARCHAR,
  p_mobile_number VARCHAR,
  p_password_hash VARCHAR
)
RETURNS TABLE (insertId INT) AS $$
DECLARE
  v_new_id INT;
BEGIN
  INSERT INTO users (full_name, email, mobile_number, password_hash)
  VALUES (p_full_name, p_email, p_mobile_number, p_password_hash)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id;
END;
$$ LANGUAGE plpgsql;

-- sp_user_update_password
CREATE OR REPLACE FUNCTION sp_user_update_password(
  p_id INT,
  p_password_hash VARCHAR
)
RETURNS TABLE (affectedRows INT) AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE users
  SET password_hash = p_password_hash
  WHERE id = p_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;

-- sp_call_create
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
  INSERT INTO calls (
    user_id,
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
    p_contact_number,
    p_duration_seconds,
    p_status,
    p_purpose,
    p_outcome,
    p_called_at,
    p_follow_up_date
  )
  ON CONFLICT ON CONSTRAINT uq_user_called_contact DO NOTHING;

  RETURN QUERY
  SELECT c.id, c.user_id, c.contact_number, c.duration_seconds, c.status, c.purpose, c.outcome, c.follow_up_date, c.called_at, c.created_at
  FROM calls c
  WHERE c.user_id = p_user_id AND c.called_at = p_called_at AND c.contact_number = p_contact_number
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_call_find_by_id
CREATE OR REPLACE FUNCTION sp_call_find_by_id(
  p_call_id INT,
  p_user_id INT
)
RETURNS TABLE (
  id INT,
  user_id INT,
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
  SELECT c.id, c.user_id, c.contact_number, c.duration_seconds, c.status, c.purpose, c.outcome, c.follow_up_date, c.called_at, c.created_at
  FROM calls c
  WHERE c.id = p_call_id AND c.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- sp_call_get_summary
CREATE OR REPLACE FUNCTION sp_call_get_summary(p_user_id INT)
RETURNS TABLE (
  total_calls BIGINT,
  total_duration_seconds BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_calls,
    COALESCE(SUM(c.duration_seconds), 0)::BIGINT AS total_duration_seconds
  FROM calls c
  WHERE c.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql;

-- sp_call_get_paginated
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
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
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
  WHERE c.user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR c.contact_number ILIKE '%' || p_search || '%'
      OR c.purpose ILIKE '%' || p_search || '%'
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

-- sp_call_update
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
  UPDATE calls
  SET
    purpose = CASE WHEN p_has_purpose THEN p_purpose ELSE calls.purpose END,
    outcome = CASE WHEN p_has_outcome THEN p_outcome ELSE calls.outcome END,
    follow_up_date = CASE WHEN p_has_follow_up_date THEN p_follow_up_date ELSE calls.follow_up_date END
  WHERE calls.id = p_call_id AND calls.user_id = p_user_id;

  RETURN QUERY
  SELECT c.id, c.user_id, c.contact_number, c.duration_seconds, c.status, c.purpose, c.outcome, c.follow_up_date, c.called_at, c.created_at
  FROM calls c
  WHERE c.id = p_call_id AND c.user_id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

