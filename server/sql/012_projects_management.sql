-- ============================================================
-- Migration 012: Projects & Campaigns Management
-- Database: PostgreSQL (call_tracker)
-- ============================================================

-- 1. Projects Table
CREATE TABLE IF NOT EXISTS projects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active', -- 'active', 'paused', 'completed'
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);

-- 2. Project Users (Many-to-Many: Which callers are assigned to which project)
CREATE TABLE IF NOT EXISTS project_users (
  project_id INT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (project_id, user_id)
);

-- 3. Link Contacts & Calls to Projects
DO $$ 
BEGIN 
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'project_id'
  ) THEN 
    ALTER TABLE contacts ADD COLUMN project_id INT REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_contacts_project ON contacts(project_id);
  END IF; 

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'project_id'
  ) THEN 
    ALTER TABLE calls ADD COLUMN project_id INT REFERENCES projects(id) ON DELETE SET NULL;
    CREATE INDEX idx_calls_project ON calls(project_id);
  END IF; 
END $$;

-- 4. Stored Procedure: sp_admin_get_projects (List projects with summary metrics)
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
  -- Count total matching projects
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
      ct.project_id,
      COUNT(DISTINCT ct.id) AS cnt,
      COUNT(DISTINCT c.contact_id) AS reached_cnt
    FROM contacts ct
    LEFT JOIN calls c ON c.contact_id = ct.id AND c.project_id = ct.project_id
    WHERE ct.project_id IS NOT NULL
    GROUP BY ct.project_id
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
  ORDER BY pr.id ASC
  LIMIT p_limit OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 5. Stored Procedure: sp_admin_create_project
CREATE OR REPLACE FUNCTION sp_admin_create_project(
  p_name VARCHAR,
  p_description TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_status VARCHAR
)
RETURNS TABLE (insert_id INT) AS $$
DECLARE
  v_new_id INT;
  v_status VARCHAR := COALESCE(NULLIF(p_status, ''), 'active');
BEGIN
  INSERT INTO projects (name, description, start_date, end_date, status)
  VALUES (p_name, p_description, p_start_date, p_end_date, v_status)
  RETURNING id INTO v_new_id;

  RETURN QUERY SELECT v_new_id;
END;
$$ LANGUAGE plpgsql;

-- 6. Stored Procedure: sp_admin_update_project
CREATE OR REPLACE FUNCTION sp_admin_update_project(
  p_project_id INT,
  p_name VARCHAR,
  p_description TEXT,
  p_start_date DATE,
  p_end_date DATE,
  p_status VARCHAR
)
RETURNS TABLE (
  id INT,
  name VARCHAR,
  description TEXT,
  start_date DATE,
  end_date DATE,
  status VARCHAR,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  UPDATE projects p
  SET
    name = COALESCE(NULLIF(p_name, ''), p.name),
    description = COALESCE(p_description, p.description),
    start_date = COALESCE(p_start_date, p.start_date),
    end_date = COALESCE(p_end_date, p.end_date),
    status = COALESCE(NULLIF(p_status, ''), p.status)
  WHERE p.id = p_project_id;

  RETURN QUERY
  SELECT p.id, p.name, p.description, p.start_date, p.end_date, p.status, p.created_at
  FROM projects p
  WHERE p.id = p_project_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- 7. Stored Procedure: sp_admin_get_project_by_id
CREATE OR REPLACE FUNCTION sp_admin_get_project_by_id(p_project_id INT)
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
  contacts_reached BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    pr.id,
    pr.name,
    pr.description,
    pr.start_date,
    pr.end_date,
    pr.status,
    pr.created_at,
    (SELECT COUNT(ct.id)::BIGINT FROM contacts ct WHERE ct.project_id = pr.id) AS total_contacts,
    (SELECT COUNT(pu.user_id)::BIGINT FROM project_users pu WHERE pu.project_id = pr.id) AS total_callers,
    (SELECT COUNT(c.id)::BIGINT FROM calls c WHERE c.project_id = pr.id) AS total_calls_made,
    (SELECT COUNT(c.id)::BIGINT FROM calls c WHERE c.project_id = pr.id AND c.status = 'answered') AS connected_calls,
    (
      SELECT COUNT(DISTINCT c.contact_id)::BIGINT
      FROM calls c
      JOIN contacts ct ON ct.id = c.contact_id AND ct.project_id = pr.id
      WHERE c.project_id = pr.id
    ) AS contacts_reached
  FROM projects pr
  WHERE pr.id = p_project_id
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

