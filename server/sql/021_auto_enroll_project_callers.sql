-- 021_auto_enroll_project_callers.sql
-- Automatically enroll coordinators/callers into project_users whenever contacts are assigned to a project and user

DROP FUNCTION IF EXISTS sp_admin_bulk_import_contacts(JSONB);
CREATE OR REPLACE FUNCTION sp_admin_bulk_import_contacts(p_contacts JSONB)
RETURNS TABLE (
  imported_count INT,
  assigned_count INT,
  unassigned_count INT
) AS $$
DECLARE
  v_imported INT := 0;
  v_assigned INT := 0;
  v_unassigned INT := 0;
BEGIN
  WITH inserted_rows AS (
    INSERT INTO contacts (
      name,
      mobile_number,
      alternate_number,
      email,
      city,
      category,
      notes,
      assigned_user_id,
      project_id
    )
    SELECT
      COALESCE(NULLIF(TRIM(c->>'name'), ''), 'Unknown Contact'),
      TRIM(c->>'mobile_number'),
      NULLIF(TRIM(c->>'alternate_number'), ''),
      NULLIF(TRIM(c->>'email'), ''),
      NULLIF(TRIM(c->>'city'), ''),
      COALESCE(NULLIF(TRIM(c->>'category'), ''), 'Donor'),
      NULLIF(TRIM(c->>'notes'), ''),
      CASE 
        WHEN c->>'assigned_user_id' IS NOT NULL AND (c->>'assigned_user_id')::INT > 0 
        THEN (c->>'assigned_user_id')::INT 
        ELSE NULL 
      END,
      CASE 
        WHEN c->>'project_id' IS NOT NULL AND (c->>'project_id')::INT > 0 
        THEN (c->>'project_id')::INT 
        ELSE NULL 
      END
    FROM jsonb_array_elements(p_contacts) AS c
    WHERE TRIM(c->>'mobile_number') IS NOT NULL AND TRIM(c->>'mobile_number') <> ''
    RETURNING id, assigned_user_id, project_id
  )
  SELECT
    COALESCE(COUNT(*)::INT, 0),
    COALESCE(COUNT(assigned_user_id)::INT, 0),
    COALESCE(COUNT(*) FILTER (WHERE assigned_user_id IS NULL)::INT, 0)
  INTO v_imported, v_assigned, v_unassigned
  FROM inserted_rows;

  -- Auto-enroll any assigned user into the project's team roster
  INSERT INTO project_users (project_id, user_id)
  SELECT DISTINCT project_id, assigned_user_id
  FROM contacts
  WHERE project_id IS NOT NULL AND assigned_user_id IS NOT NULL
  ON CONFLICT (project_id, user_id) DO NOTHING;

  RETURN QUERY SELECT v_imported, v_assigned, v_unassigned;
END;
$$ LANGUAGE plpgsql;


-- 2. sp_admin_assign_contacts: Auto-enroll in project_users when assigned
DROP FUNCTION IF EXISTS sp_admin_assign_contacts(INT[], INT, BOOLEAN);
CREATE OR REPLACE FUNCTION sp_admin_assign_contacts(
  p_contact_ids INT[],
  p_target_user_id INT,
  p_reassign_follow_ups BOOLEAN
)
RETURNS TABLE (assigned_count INT) AS $$
DECLARE
  v_count INT;
BEGIN
  -- Update assigned_user_id on contacts
  UPDATE contacts
  SET assigned_user_id = p_target_user_id
  WHERE id = ANY(p_contact_ids);

  GET DIAGNOSTICS v_count = ROW_COUNT;

  -- Auto-enroll target user into any project linked to these contacts
  IF p_target_user_id IS NOT NULL THEN
    INSERT INTO project_users (project_id, user_id)
    SELECT DISTINCT project_id, p_target_user_id
    FROM contacts
    WHERE id = ANY(p_contact_ids) AND project_id IS NOT NULL
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  -- If reassigning follow-ups, also update pending follow-ups to the new caller
  IF p_reassign_follow_ups IS TRUE THEN
    UPDATE follow_ups
    SET user_id = p_target_user_id
    WHERE contact_id = ANY(p_contact_ids)
      AND status = 'pending';
  END IF;

  RETURN QUERY SELECT v_count;
END;
$$ LANGUAGE plpgsql;


-- 3. sp_admin_update_contact: Auto-enroll when editing contact project & user
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


-- 4. Retroactive enrollment for existing contacts
INSERT INTO project_users (project_id, user_id)
SELECT DISTINCT project_id, assigned_user_id
FROM contacts
WHERE project_id IS NOT NULL AND assigned_user_id IS NOT NULL
ON CONFLICT (project_id, user_id) DO NOTHING;
