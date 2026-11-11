-- ============================================================
-- Migration 027: Sync Calls Project ID on Contact Project Assignment
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Backfill existing calls whose project_id is NULL but contact belongs to a project
UPDATE calls c
SET project_id = ct.project_id
FROM contacts ct
WHERE c.contact_id = ct.id
  AND c.project_id IS NULL
  AND ct.project_id IS NOT NULL;

-- 2. Update sp_admin_update_contact to retroactively link calls when contact's project is assigned/changed
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
  project_name VARCHAR,
  assigned_user_id INT,
  assigned_to_name VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
BEGIN
  UPDATE contacts
  SET
    name = COALESCE(NULLIF(TRIM(p_name), ''), contacts.name),
    mobile_number = COALESCE(NULLIF(TRIM(p_mobile_number), ''), contacts.mobile_number),
    alternate_number = NULLIF(TRIM(p_alternate_number), ''),
    email = NULLIF(TRIM(p_email), ''),
    city = NULLIF(TRIM(p_city), ''),
    category = COALESCE(NULLIF(TRIM(p_category), ''), contacts.category),
    notes = p_notes,
    project_id = p_project_id,
    assigned_user_id = p_assigned_user_id
  WHERE contacts.id = p_contact_id;

  -- Auto-enroll coordinator into project_users if both project and user are set
  IF p_project_id IS NOT NULL AND p_assigned_user_id IS NOT NULL THEN
    INSERT INTO project_users (project_id, user_id)
    VALUES (p_project_id, p_assigned_user_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- Retroactively sync previous calls made to this contact that have NULL project_id
  IF p_project_id IS NOT NULL THEN
    UPDATE calls
    SET project_id = p_project_id
    WHERE contact_id = p_contact_id
      AND calls.project_id IS NULL;
  END IF;

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
    ct.project_id,
    p.name AS project_name,
    ct.assigned_user_id,
    u.full_name AS assigned_to_name,
    ct.created_at
  FROM contacts ct
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  WHERE ct.id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

