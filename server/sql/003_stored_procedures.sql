-- ============================================================================
-- AMP Call Tracker - Stored Procedures
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. USER PROCEDURES
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_user_find_by_email;
DELIMITER //
CREATE PROCEDURE sp_user_find_by_email(IN p_email VARCHAR(255))
BEGIN
  SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at
  FROM users
  WHERE email = p_email
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_user_find_by_email_or_mobile;
DELIMITER //
CREATE PROCEDURE sp_user_find_by_email_or_mobile(
  IN p_email VARCHAR(255),
  IN p_mobile VARCHAR(20)
)
BEGIN
  SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at
  FROM users
  WHERE email = p_email OR mobile_number = p_mobile
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_user_find_by_id;
DELIMITER //
CREATE PROCEDURE sp_user_find_by_id(IN p_id INT)
BEGIN
  SELECT id, full_name, email, mobile_number, created_at
  FROM users
  WHERE id = p_id
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_user_find_with_password_by_id;
DELIMITER //
CREATE PROCEDURE sp_user_find_with_password_by_id(IN p_id INT)
BEGIN
  SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at
  FROM users
  WHERE id = p_id
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_user_create;
DELIMITER //
CREATE PROCEDURE sp_user_create(
  IN p_full_name VARCHAR(255),
  IN p_email VARCHAR(255),
  IN p_mobile_number VARCHAR(20),
  IN p_password_hash VARCHAR(255)
)
BEGIN
  INSERT INTO users (full_name, email, mobile_number, password_hash)
  VALUES (p_full_name, p_email, p_mobile_number, p_password_hash);

  SELECT LAST_INSERT_ID() AS insertId;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_user_update_password;
DELIMITER //
CREATE PROCEDURE sp_user_update_password(
  IN p_id INT,
  IN p_password_hash VARCHAR(255)
)
BEGIN
  UPDATE users
  SET password_hash = p_password_hash
  WHERE id = p_id;

  SELECT ROW_COUNT() AS affectedRows;
END //
DELIMITER ;

-- ----------------------------------------------------------------------------
-- 2. CALL PROCEDURES
-- ----------------------------------------------------------------------------

DROP PROCEDURE IF EXISTS sp_call_create;
DELIMITER //
CREATE PROCEDURE sp_call_create(
  IN p_user_id INT,
  IN p_contact_number VARCHAR(20),
  IN p_duration_seconds INT,
  IN p_status VARCHAR(20),
  IN p_purpose VARCHAR(255),
  IN p_outcome VARCHAR(50),
  IN p_called_at DATETIME
)
BEGIN
  INSERT IGNORE INTO calls (
    user_id,
    contact_number,
    duration_seconds,
    status,
    purpose,
    outcome,
    called_at
  ) VALUES (
    p_user_id,
    p_contact_number,
    p_duration_seconds,
    p_status,
    p_purpose,
    p_outcome,
    p_called_at
  );

  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
  FROM calls
  WHERE user_id = p_user_id AND called_at = p_called_at AND contact_number = p_contact_number
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_get_summary;
DELIMITER //
CREATE PROCEDURE sp_call_get_summary(IN p_user_id INT)
BEGIN
  SELECT
    COUNT(*) AS total_calls,
    COALESCE(SUM(duration_seconds), 0) AS total_duration_seconds
  FROM calls
  WHERE user_id = p_user_id;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_get_paginated;
DELIMITER //
CREATE PROCEDURE sp_call_get_paginated(
  IN p_user_id INT,
  IN p_search VARCHAR(255),
  IN p_outcome VARCHAR(50),
  IN p_status VARCHAR(20),
  IN p_limit INT,
  IN p_offset INT
)
BEGIN
  -- 1. Filtered total count
  SELECT COUNT(*) AS filtered_total
  FROM calls
  WHERE user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR contact_number LIKE CONCAT('%', p_search, '%')
      OR purpose LIKE CONCAT('%', p_search, '%')
    )
    AND (
      p_outcome IS NULL OR p_outcome = '' OR p_outcome = 'all'
      OR (p_outcome = 'not_set' AND outcome IS NULL)
      OR (p_outcome <> 'not_set' AND outcome = p_outcome)
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR status = p_status
    );

  -- 2. Paginated rows
  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
  FROM calls
  WHERE user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR contact_number LIKE CONCAT('%', p_search, '%')
      OR purpose LIKE CONCAT('%', p_search, '%')
    )
    AND (
      p_outcome IS NULL OR p_outcome = '' OR p_outcome = 'all'
      OR (p_outcome = 'not_set' AND outcome IS NULL)
      OR (p_outcome <> 'not_set' AND outcome = p_outcome)
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR status = p_status
    )
  ORDER BY called_at DESC
  LIMIT p_limit OFFSET p_offset;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_find_by_id;
DELIMITER //
CREATE PROCEDURE sp_call_find_by_id(
  IN p_call_id INT,
  IN p_user_id INT
)
BEGIN
  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
  FROM calls
  WHERE id = p_call_id AND user_id = p_user_id
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_update;
DELIMITER //
CREATE PROCEDURE sp_call_update(
  IN p_call_id INT,
  IN p_user_id INT,
  IN p_purpose VARCHAR(255),
  IN p_outcome VARCHAR(50),
  IN p_has_purpose BOOLEAN,
  IN p_has_outcome BOOLEAN
)
BEGIN
  IF p_has_purpose AND p_has_outcome THEN
    UPDATE calls
    SET purpose = p_purpose, outcome = p_outcome
    WHERE id = p_call_id AND user_id = p_user_id;
  ELSEIF p_has_purpose THEN
    UPDATE calls
    SET purpose = p_purpose
    WHERE id = p_call_id AND user_id = p_user_id;
  ELSEIF p_has_outcome THEN
    UPDATE calls
    SET outcome = p_outcome
    WHERE id = p_call_id AND user_id = p_user_id;
  END IF;

  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, called_at, created_at
  FROM calls
  WHERE id = p_call_id AND user_id = p_user_id
  LIMIT 1;
END //
DELIMITER ;
