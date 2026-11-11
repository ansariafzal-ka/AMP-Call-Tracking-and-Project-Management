-- 015_admin_delete_user.sql
-- 1. Ensure contacts_assigned_user_id_fkey uses ON DELETE SET NULL so contacts are never lost
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_user_id_fkey;
ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_user_id_fkey 
  FOREIGN KEY (assigned_user_id) REFERENCES users(id) ON DELETE SET NULL;

-- 2. Stored procedure to safely delete user with optional contact and follow-up transfer
CREATE OR REPLACE FUNCTION sp_admin_delete_user(
  p_user_id INT,
  p_transfer_user_id INT DEFAULT NULL
)
RETURNS TABLE (
  deleted_user_id INT,
  transferred_contacts_count INT,
  transferred_followups_count INT
) AS $$
DECLARE
  v_contacts_count INT := 0;
  v_followups_count INT := 0;
BEGIN
  -- Verify target transfer user if provided
  IF p_transfer_user_id IS NOT NULL AND p_transfer_user_id > 0 THEN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_transfer_user_id AND is_active = TRUE) THEN
      RAISE EXCEPTION 'Transfer user does not exist or is deactivated';
    END IF;

    -- Transfer contacts
    UPDATE contacts
    SET assigned_user_id = p_transfer_user_id
    WHERE assigned_user_id = p_user_id;
    GET DIAGNOSTICS v_contacts_count = ROW_COUNT;

    -- Transfer pending follow-ups
    UPDATE follow_ups
    SET user_id = p_transfer_user_id
    WHERE user_id = p_user_id AND status = 'pending';
    GET DIAGNOSTICS v_followups_count = ROW_COUNT;
  ELSE
    -- Unassign contacts to pool
    UPDATE contacts
    SET assigned_user_id = NULL
    WHERE assigned_user_id = p_user_id;
    GET DIAGNOSTICS v_contacts_count = ROW_COUNT;

    -- Cancel pending follow-ups
    UPDATE follow_ups
    SET status = 'cancelled'
    WHERE user_id = p_user_id AND status = 'pending';
    GET DIAGNOSTICS v_followups_count = ROW_COUNT;
  END IF;

  -- Delete from project_users
  DELETE FROM project_users WHERE user_id = p_user_id;

  -- Delete user record
  DELETE FROM users WHERE id = p_user_id;

  RETURN QUERY SELECT p_user_id, v_contacts_count, v_followups_count;
END;
$$ LANGUAGE plpgsql;

