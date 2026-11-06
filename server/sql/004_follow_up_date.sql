-- Migration: Add follow_up_date to calls and update stored procedures
ALTER TABLE calls ADD COLUMN IF NOT EXISTS follow_up_date DATETIME NULL AFTER outcome;

DROP PROCEDURE IF EXISTS sp_call_create;
DELIMITER //
CREATE PROCEDURE sp_call_create(
  IN p_user_id INT,
  IN p_contact_number VARCHAR(20),
  IN p_duration_seconds INT,
  IN p_status VARCHAR(20),
  IN p_purpose VARCHAR(255),
  IN p_outcome VARCHAR(50),
  IN p_called_at DATETIME,
  IN p_follow_up_date DATETIME
)
BEGIN
  INSERT IGNORE INTO calls (
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
  );

  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, follow_up_date, called_at, created_at
  FROM calls
  WHERE user_id = p_user_id AND called_at = p_called_at AND contact_number = p_contact_number
  LIMIT 1;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_find_by_id;
DELIMITER //
CREATE PROCEDURE sp_call_find_by_id(
  IN p_call_id INT,
  IN p_user_id INT
)
BEGIN
  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, follow_up_date, called_at, created_at
  FROM calls
  WHERE id = p_call_id AND user_id = p_user_id
  LIMIT 1;
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
  SELECT COUNT(*) AS filtered_total
  FROM calls
  WHERE user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR contact_number LIKE CONCAT('%', p_search, '%')
      OR purpose LIKE CONCAT('%', p_search, '%')
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR status = p_status
    );

  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, follow_up_date, called_at, created_at
  FROM calls
  WHERE user_id = p_user_id
    AND (
      p_search IS NULL OR p_search = ''
      OR contact_number LIKE CONCAT('%', p_search, '%')
      OR purpose LIKE CONCAT('%', p_search, '%')
    )
    AND (
      p_outcome IS NULL OR p_outcome = ''
      OR outcome = p_outcome
    )
    AND (
      p_status IS NULL OR p_status = ''
      OR status = p_status
    )
  ORDER BY called_at DESC
  LIMIT p_limit OFFSET p_offset;
END //
DELIMITER ;

DROP PROCEDURE IF EXISTS sp_call_update;
DELIMITER //
CREATE PROCEDURE sp_call_update(
  IN p_call_id INT,
  IN p_user_id INT,
  IN p_purpose VARCHAR(255),
  IN p_outcome VARCHAR(50),
  IN p_follow_up_date DATETIME,
  IN p_has_purpose BOOLEAN,
  IN p_has_outcome BOOLEAN,
  IN p_has_follow_up_date BOOLEAN
)
BEGIN
  UPDATE calls
  SET
    purpose = IF(p_has_purpose, p_purpose, purpose),
    outcome = IF(p_has_outcome, p_outcome, outcome),
    follow_up_date = IF(p_has_follow_up_date, p_follow_up_date, follow_up_date)
  WHERE id = p_call_id AND user_id = p_user_id;

  SELECT id, user_id, contact_number, duration_seconds, status, purpose, outcome, follow_up_date, called_at, created_at
  FROM calls
  WHERE id = p_call_id AND user_id = p_user_id
  LIMIT 1;
END //
DELIMITER ;

