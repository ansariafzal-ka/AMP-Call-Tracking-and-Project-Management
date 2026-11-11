-- 034_multi_project_contact_association.sql
-- Enables many-to-many relationship between contacts and projects via contact_projects

CREATE TABLE IF NOT EXISTS contact_projects (
  contact_id INT NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (contact_id, project_id)
);

CREATE INDEX IF NOT EXISTS idx_contact_projects_contact ON contact_projects(contact_id);
CREATE INDEX IF NOT EXISTS idx_contact_projects_project ON contact_projects(project_id);

-- Migrate existing contacts.project_id
INSERT INTO contact_projects (contact_id, project_id)
SELECT id, project_id FROM contacts WHERE project_id IS NOT NULL
ON CONFLICT (contact_id, project_id) DO NOTHING;

-- 1. Update sp_admin_get_projects to accurately count contacts across contact_projects
CREATE OR REPLACE FUNCTION sp_admin_get_projects(
  p_search VARCHAR,
  p_status VARCHAR,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR,
  created_at TIMESTAMPTZ,
  total_contacts BIGINT,
  total_callers BIGINT,
  total_calls_made BIGINT,
  connected_calls BIGINT,
  contacts_reached BIGINT,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  SELECT COUNT(*) INTO v_filtered_total
  FROM projects pr
  WHERE (
      p_search IS NULL OR p_search = ''
      OR pr.name ILIKE '%' || p_search || '%'
      OR pr.description ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR pr.status = p_status
    );

  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.description,
    pr.start_date,
    pr.end_date,
    pr.status,
    pr.created_at,
    COALESCE(ct_counts.cnt, 0)::BIGINT AS total_contacts,
    COALESCE(usr_counts.cnt, 0)::BIGINT AS total_callers,
    COALESCE(call_counts.total_cnt, 0)::BIGINT AS total_calls_made,
    COALESCE(call_counts.conn_cnt, 0)::BIGINT AS connected_calls,
    COALESCE(ct_counts.reached_cnt, 0)::BIGINT AS contacts_reached,
    v_filtered_total AS filtered_total
  FROM projects pr
  LEFT JOIN (
    SELECT
      cp_agg.project_id,
      COUNT(DISTINCT cp_agg.contact_id) AS cnt,
      COUNT(DISTINCT c.contact_id) AS reached_cnt
    FROM (
      SELECT cp.contact_id, cp.project_id FROM contact_projects cp
      UNION
      SELECT ct.id AS contact_id, ct.project_id FROM contacts ct WHERE ct.project_id IS NOT NULL
    ) cp_agg
    LEFT JOIN calls c ON c.contact_id = cp_agg.contact_id AND c.project_id = cp_agg.project_id
    GROUP BY cp_agg.project_id
  ) ct_counts ON ct_counts.project_id = pr.id
  LEFT JOIN (
    SELECT pu.project_id, COUNT(pu.user_id) AS cnt
    FROM project_users pu
    GROUP BY pu.project_id
  ) usr_counts ON usr_counts.project_id = pr.id
  LEFT JOIN (
    SELECT
      c.project_id,
      COUNT(c.id) AS total_cnt,
      COUNT(c.id) FILTER (WHERE c.status = 'answered') AS conn_cnt
    FROM calls c
    WHERE c.project_id IS NOT NULL
    GROUP BY c.project_id
  ) call_counts ON call_counts.project_id = pr.id
  WHERE (
      p_search IS NULL OR p_search = ''
      OR pr.name ILIKE '%' || p_search || '%'
      OR pr.description ILIKE '%' || p_search || '%'
    )
    AND (
      p_status IS NULL OR p_status = '' OR p_status = 'all'
      OR pr.status = p_status
    )
  ORDER BY pr.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. Update sp_admin_get_contacts to return projects JSON & project_names
DROP FUNCTION IF EXISTS sp_admin_get_contacts(VARCHAR, VARCHAR, VARCHAR, INT, BOOLEAN, INT, INT, INT);

CREATE OR REPLACE FUNCTION sp_admin_get_contacts(
  p_search VARCHAR,
  p_category VARCHAR,
  p_city VARCHAR,
  p_assigned_user_id INT,
  p_unassigned_only BOOLEAN,
  p_project_id INT,
  p_limit INT,
  p_offset INT
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  alternate_number VARCHAR,
  email VARCHAR,
  city VARCHAR,
  state VARCHAR,
  pin_code VARCHAR,
  category VARCHAR,
  notes TEXT,
  created_at TIMESTAMPTZ,
  assigned_user_id INT,
  assigned_user_name VARCHAR,
  assigned_user_email VARCHAR,
  project_id INT,
  project_name VARCHAR,
  project_ids INT[],
  project_names TEXT,
  projects JSON,
  total_calls BIGINT,
  last_called_at TIMESTAMPTZ,
  last_call_status VARCHAR,
  last_call_outcome VARCHAR,
  filtered_total BIGINT
) AS $$
DECLARE
  v_filtered_total BIGINT;
BEGIN
  -- Count total matching contacts
  SELECT COUNT(*) INTO v_filtered_total
  FROM contacts ct
  WHERE (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
    AND (
      p_city IS NULL OR p_city = ''
      OR ct.city ILIKE p_city
    )
    AND (
      (p_unassigned_only IS TRUE AND ct.assigned_user_id IS NULL)
      OR (p_unassigned_only IS NOT TRUE AND (p_assigned_user_id IS NULL OR ct.assigned_user_id = p_assigned_user_id))
    )
    AND (
      p_project_id IS NULL
      OR ct.project_id = p_project_id
      OR EXISTS (SELECT 1 FROM contact_projects cp WHERE cp.contact_id = ct.id AND cp.project_id = p_project_id)
    );

  RETURN QUERY
  SELECT
    ct.id,
    ct.name,
    ct.mobile_number,
    ct.alternate_number,
    ct.email,
    ct.city,
    ct.state,
    ct.pin_code,
    ct.category,
    ct.notes,
    ct.created_at,
    ct.assigned_user_id,
    u.full_name AS assigned_user_name,
    u.email AS assigned_user_email,
    ct.project_id,
    p.name AS project_name,
    COALESCE(pr_agg.project_ids, ARRAY[]::INT[]) AS project_ids,
    COALESCE(pr_agg.project_names, '')::TEXT AS project_names,
    COALESCE(pr_agg.projects_json, '[]'::JSON) AS projects,
    COALESCE(cs.total_calls, 0)::BIGINT AS total_calls,
    cs.last_called_at,
    cs.last_call_status::VARCHAR AS last_call_status,
    cs.last_call_outcome::VARCHAR AS last_call_outcome,
    v_filtered_total AS filtered_total
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT
      ARRAY_AGG(p2.id ORDER BY p2.name) AS project_ids,
      STRING_AGG(p2.name, ', ' ORDER BY p2.name) AS project_names,
      JSON_AGG(JSON_BUILD_OBJECT('id', p2.id, 'name', p2.name) ORDER BY p2.name) AS projects_json
    FROM (
      SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = ct.id
      UNION
      SELECT ct.project_id WHERE ct.project_id IS NOT NULL
    ) cp_all
    JOIN projects p2 ON p2.id = cp_all.project_id
  ) pr_agg ON TRUE
  LEFT JOIN LATERAL (
    SELECT
      COUNT(c.id) AS total_calls,
      MAX(c.called_at) AS last_called_at,
      (SELECT c2.status FROM calls c2 WHERE (c2.contact_id = ct.id OR c2.contact_number = ct.mobile_number) ORDER BY c2.called_at DESC LIMIT 1) AS last_call_status,
      (SELECT c3.outcome FROM calls c3 WHERE (c3.contact_id = ct.id OR c3.contact_number = ct.mobile_number) ORDER BY c3.called_at DESC LIMIT 1) AS last_call_outcome
    FROM calls c
    WHERE c.contact_id = ct.id OR c.contact_number = ct.mobile_number
  ) cs ON TRUE
  WHERE (
      p_search IS NULL OR p_search = ''
      OR ct.name ILIKE '%' || p_search || '%'
      OR ct.mobile_number ILIKE '%' || p_search || '%'
      OR ct.city ILIKE '%' || p_search || '%'
      OR ct.state ILIKE '%' || p_search || '%'
      OR ct.pin_code ILIKE '%' || p_search || '%'
      OR ct.notes ILIKE '%' || p_search || '%'
    )
    AND (
      p_category IS NULL OR p_category = '' OR p_category = 'all'
      OR ct.category ILIKE p_category
    )
    AND (
      p_city IS NULL OR p_city = ''
      OR ct.city ILIKE p_city
    )
    AND (
      (p_unassigned_only IS TRUE AND ct.assigned_user_id IS NULL)
      OR (p_unassigned_only IS NOT TRUE AND (p_assigned_user_id IS NULL OR ct.assigned_user_id = p_assigned_user_id))
    )
    AND (
      p_project_id IS NULL
      OR ct.project_id = p_project_id
      OR EXISTS (SELECT 1 FROM contact_projects cp WHERE cp.contact_id = ct.id AND cp.project_id = p_project_id)
    )
  ORDER BY ct.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 3. Update sp_admin_update_contact to support multi-project syncing
DROP FUNCTION IF EXISTS sp_admin_update_contact(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INT, INT);
DROP FUNCTION IF EXISTS sp_admin_update_contact(INT, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, VARCHAR, TEXT, INT, INT, INT[]);

CREATE OR REPLACE FUNCTION sp_admin_update_contact(
  p_contact_id INT,
  p_name VARCHAR,
  p_mobile_number VARCHAR,
  p_alternate_number VARCHAR,
  p_email VARCHAR,
  p_city VARCHAR,
  p_state VARCHAR,
  p_pin_code VARCHAR,
  p_category VARCHAR,
  p_notes TEXT,
  p_project_id INT,
  p_assigned_user_id INT,
  p_project_ids INT[] DEFAULT NULL
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  mobile_number VARCHAR,
  alternate_number VARCHAR,
  email VARCHAR,
  city VARCHAR,
  state VARCHAR,
  pin_code VARCHAR,
  category VARCHAR,
  notes TEXT,
  project_id INT,
  project_name VARCHAR,
  project_ids INT[],
  project_names TEXT,
  projects JSON,
  assigned_user_id INT,
  assigned_to_name VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
#variable_conflict use_column
DECLARE
  v_effective_proj_id INT;
  v_pid INT;
BEGIN
  -- Determine primary project_id: either explicitly provided or first in project_ids
  IF p_project_ids IS NOT NULL AND array_length(p_project_ids, 1) > 0 THEN
    v_effective_proj_id := p_project_ids[1];
  ELSE
    v_effective_proj_id := p_project_id;
  END IF;

  UPDATE contacts
  SET
    name = COALESCE(NULLIF(TRIM(p_name), ''), contacts.name),
    mobile_number = COALESCE(NULLIF(TRIM(p_mobile_number), ''), contacts.mobile_number),
    alternate_number = NULLIF(TRIM(p_alternate_number), ''),
    email = NULLIF(TRIM(p_email), ''),
    city = NULLIF(TRIM(p_city), ''),
    state = NULLIF(TRIM(p_state), ''),
    pin_code = NULLIF(TRIM(p_pin_code), ''),
    category = COALESCE(NULLIF(TRIM(p_category), ''), contacts.category),
    notes = p_notes,
    project_id = v_effective_proj_id,
    assigned_user_id = p_assigned_user_id
  WHERE contacts.id = p_contact_id;

  -- Sync contact_projects if p_project_ids is supplied
  IF p_project_ids IS NOT NULL THEN
    DELETE FROM contact_projects cp
    WHERE cp.contact_id = p_contact_id
      AND NOT (cp.project_id = ANY(p_project_ids));

    FOREACH v_pid IN ARRAY p_project_ids
    LOOP
      INSERT INTO contact_projects (contact_id, project_id)
      VALUES (p_contact_id, v_pid)
      ON CONFLICT (contact_id, project_id) DO NOTHING;

      -- Auto-enroll assigned coordinator into each associated project
      IF p_assigned_user_id IS NOT NULL THEN
        INSERT INTO project_users (project_id, user_id)
        VALUES (v_pid, p_assigned_user_id)
        ON CONFLICT (project_id, user_id) DO NOTHING;
      END IF;
    END LOOP;
  ELSIF v_effective_proj_id IS NOT NULL THEN
    INSERT INTO contact_projects (contact_id, project_id)
    VALUES (p_contact_id, v_effective_proj_id)
    ON CONFLICT (contact_id, project_id) DO NOTHING;

    IF p_assigned_user_id IS NOT NULL THEN
      INSERT INTO project_users (project_id, user_id)
      VALUES (v_effective_proj_id, p_assigned_user_id)
      ON CONFLICT (project_id, user_id) DO NOTHING;
    END IF;
  END IF;

  -- Retroactively link any past calls made to this contact's phone numbers
  IF v_effective_proj_id IS NOT NULL THEN
    UPDATE calls
    SET
      project_id = v_effective_proj_id,
      contact_id = p_contact_id
    WHERE (
      contact_id = p_contact_id
      OR contact_number = p_mobile_number
      OR (p_alternate_number IS NOT NULL AND contact_number = p_alternate_number)
    )
    AND (calls.project_id IS NULL OR calls.contact_id IS NULL);
  END IF;

  RETURN QUERY
  SELECT
    ct.id,
    ct.name,
    ct.mobile_number,
    ct.alternate_number,
    ct.email,
    ct.city,
    ct.state,
    ct.pin_code,
    ct.category,
    ct.notes,
    ct.project_id,
    p.name AS project_name,
    COALESCE(pr_agg.project_ids, ARRAY[]::INT[]) AS project_ids,
    COALESCE(pr_agg.project_names, '')::TEXT AS project_names,
    COALESCE(pr_agg.projects_json, '[]'::JSON) AS projects,
    ct.assigned_user_id,
    u.full_name AS assigned_to_name,
    ct.created_at
  FROM contacts ct
  LEFT JOIN users u ON u.id = ct.assigned_user_id
  LEFT JOIN projects p ON p.id = ct.project_id
  LEFT JOIN LATERAL (
    SELECT
      ARRAY_AGG(p2.id ORDER BY p2.name) AS project_ids,
      STRING_AGG(p2.name, ', ' ORDER BY p2.name) AS project_names,
      JSON_AGG(JSON_BUILD_OBJECT('id', p2.id, 'name', p2.name) ORDER BY p2.name) AS projects_json
    FROM (
      SELECT cp.project_id FROM contact_projects cp WHERE cp.contact_id = ct.id
      UNION
      SELECT ct.project_id WHERE ct.project_id IS NOT NULL
    ) cp_all
    JOIN projects p2 ON p2.id = cp_all.project_id
  ) pr_agg ON TRUE
  WHERE ct.id = p_contact_id;
END;
$$ LANGUAGE plpgsql;

