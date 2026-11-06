-- ============================================================
-- Migration 009: Admin User Management, Roles & Call Targets
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Alter Users table to add Role and Targets
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'role'
  ) THEN 
    ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'caller';
    ALTER TABLE users ADD COLUMN daily_target INT NOT NULL DEFAULT 50;
    ALTER TABLE users ADD COLUMN weekly_target INT NOT NULL DEFAULT 250;
  END IF; 
END $$;

-- 2. Make user ID 1 an Admin
UPDATE users SET role = 'admin' WHERE id = 1;

-- 3. Seed dedicated Admin account: admin@gmail.com / adminpassword
INSERT INTO users (full_name, email, mobile_number, password_hash, role, daily_target, weekly_target, is_active)
VALUES (
  'System Administrator',
  'admin@gmail.com',
  '9999999999',
  '$2b$10$aMocpREzRmhEc/aITedxgeUCPKJkiBI9mKEeWw2SGDG0HgK40AUh6', -- 'adminpassword'
  'admin',
  50,
  250,
  TRUE
)
ON CONFLICT (email) DO UPDATE
SET
  role = 'admin',
  password_hash = EXCLUDED.password_hash,
  is_active = TRUE;

-- 4. Update core user lookup functions to include role & targets
DROP FUNCTION IF EXISTS sp_user_find_by_email(VARCHAR);
DROP FUNCTION IF EXISTS sp_user_find_by_id(INT);
DROP FUNCTION IF EXISTS sp_user_find_with_password_by_id(INT);

CREATE OR REPLACE FUNCTION sp_user_find_by_email(p_email VARCHAR)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  password_hash VARCHAR,
  is_active BOOLEAN,
  role VARCHAR,
  daily_target INT,
  weekly_target INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active, u.role, u.daily_target, u.weekly_target, u.created_at
  FROM users u
  WHERE u.email = p_email
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sp_user_find_by_id(p_id INT)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  is_active BOOLEAN,
  role VARCHAR,
  daily_target INT,
  weekly_target INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.is_active, u.role, u.daily_target, u.weekly_target, u.created_at
  FROM users u
  WHERE u.id = p_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION sp_user_find_with_password_by_id(p_id INT)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  password_hash VARCHAR,
  is_active BOOLEAN,
  role VARCHAR,
  daily_target INT,
  weekly_target INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.password_hash, u.is_active, u.role, u.daily_target, u.weekly_target, u.created_at
  FROM users u
  WHERE u.id = p_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 5. Stored Procedure: sp_admin_get_users
CREATE OR REPLACE FUNCTION sp_admin_get_users(
  p_search VARCHAR,
  p_role VARCHAR,
  p_is_active BOOLEAN,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  role VARCHAR,
  is_active BOOLEAN,
  daily_target INT,
  weekly_target INT,
  total_assigned_contacts BIGINT,
  calls_made_today BIGINT,
  created_at TIMESTAMPTZ,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
  v_today_start TIMESTAMPTZ := date_trunc('day', NOW());
BEGIN
  -- Count total matching callers
  SELECT COUNT(*) INTO v_filtered_total
  FROM users u
  WHERE (
      p_search IS NULL OR p_search = ''
      OR u.full_name ILIKE '%' || p_search || '%'
      OR u.email ILIKE '%' || p_search || '%'
      OR u.mobile_number ILIKE '%' || p_search || '%'
    )
    AND (
      p_role IS NULL OR p_role = '' OR p_role = 'all'
      OR u.role = p_role
    )
    AND (
      p_is_active IS NULL
      OR u.is_active = p_is_active
    );

  RETURN QUERY
  SELECT
    u.id,
    u.full_name,
    u.email,
    u.mobile_number,
    u.role,
    u.is_active,
    u.daily_target,
    u.weekly_target,
    COALESCE(contact_counts.cnt, 0)::BIGINT AS total_assigned_contacts,
    COALESCE(call_counts.cnt, 0)::BIGINT AS calls_made_today,
    u.created_at,
    v_filtered_total AS filtered_total
  FROM users u
  LEFT JOIN (
    SELECT ct.assigned_user_id, COUNT(ct.id) AS cnt
    FROM contacts ct
    GROUP BY ct.assigned_user_id
  ) contact_counts ON contact_counts.assigned_user_id = u.id
  LEFT JOIN (
    SELECT c.user_id, COUNT(c.id) AS cnt
    FROM calls c
    WHERE c.called_at >= v_today_start
    GROUP BY c.user_id
  ) call_counts ON call_counts.user_id = u.id
  WHERE (
      p_search IS NULL OR p_search = ''
      OR u.full_name ILIKE '%' || p_search || '%'
      OR u.email ILIKE '%' || p_search || '%'
      OR u.mobile_number ILIKE '%' || p_search || '%'
    )
    AND (
      p_role IS NULL OR p_role = '' OR p_role = 'all'
      OR u.role = p_role
    )
    AND (
      p_is_active IS NULL
      OR u.is_active = p_is_active
    )
  ORDER BY u.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 6. Stored Procedure: sp_admin_create_user
CREATE OR REPLACE FUNCTION sp_admin_create_user(
  p_full_name VARCHAR,
  p_email VARCHAR,
  p_mobile_number VARCHAR,
  p_password_hash VARCHAR,
  p_role VARCHAR,
  p_daily_target INT,
  p_weekly_target INT
)
RETURNS TABLE (insert_id INT) AS $$
DECLARE
  v_new_id INT;
  v_role VARCHAR := COALESCE(NULLIF(p_role, ''), 'caller');
  v_daily INT := COALESCE(p_daily_target, 50);
  v_weekly INT := COALESCE(p_weekly_target, 250);
BEGIN
  INSERT INTO users (full_name, email, mobile_number, password_hash, role, daily_target, weekly_target, is_active)
  VALUES (p_full_name, p_email, p_mobile_number, p_password_hash, v_role, v_daily, v_weekly, TRUE)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id;
END;
$$ LANGUAGE plpgsql;

-- 7. Stored Procedure: sp_admin_update_user
CREATE OR REPLACE FUNCTION sp_admin_update_user(
  p_user_id INT,
  p_role VARCHAR,
  p_is_active BOOLEAN,
  p_daily_target INT,
  p_weekly_target INT,
  p_full_name VARCHAR,
  p_mobile_number VARCHAR
)
RETURNS TABLE (
  id INT,
  full_name VARCHAR,
  email VARCHAR,
  mobile_number VARCHAR,
  role VARCHAR,
  is_active BOOLEAN,
  daily_target INT,
  weekly_target INT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  UPDATE users u
  SET
    role = COALESCE(NULLIF(p_role, ''), u.role),
    is_active = COALESCE(p_is_active, u.is_active),
    daily_target = COALESCE(p_daily_target, u.daily_target),
    weekly_target = COALESCE(p_weekly_target, u.weekly_target),
    full_name = COALESCE(NULLIF(p_full_name, ''), u.full_name),
    mobile_number = COALESCE(NULLIF(p_mobile_number, ''), u.mobile_number)
  WHERE u.id = p_user_id;

  RETURN QUERY
  SELECT u.id, u.full_name, u.email, u.mobile_number, u.role, u.is_active, u.daily_target, u.weekly_target, u.created_at
  FROM users u
  WHERE u.id = p_user_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

