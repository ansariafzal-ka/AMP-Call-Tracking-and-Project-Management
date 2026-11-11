-- 013_bulk_contacts_upload.sql
-- Function to bulk insert contacts from a JSONB array
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
    RETURNING id, assigned_user_id
  )
  SELECT
    COALESCE(COUNT(*)::INT, 0),
    COALESCE(COUNT(assigned_user_id)::INT, 0),
    COALESCE(COUNT(*) FILTER (WHERE assigned_user_id IS NULL)::INT, 0)
  INTO v_imported, v_assigned, v_unassigned
  FROM inserted_rows;

  RETURN QUERY SELECT v_imported, v_assigned, v_unassigned;
END;
$$ LANGUAGE plpgsql;

