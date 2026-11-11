-- 023_fix_admin_update_contact_ambiguity.sql
-- Fix column reference "project_id" is ambiguous in sp_admin_update_contact

DROP FUNCTION IF EXISTS sp_admin_update_contact(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INT, INT);

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

  -- Auto-enroll into project_users if both project and user are set
  IF p_project_id IS NOT NULL AND p_assigned_user_id IS NOT NULL THEN
    INSERT INTO project_users (project_id, user_id)
    VALUES (p_project_id, p_assigned_user_id)
    ON CONFLICT (project_id, user_id) DO NOTHING;
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

