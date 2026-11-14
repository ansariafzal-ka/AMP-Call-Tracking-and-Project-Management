import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

export const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'call_tracker',
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function initDb(): Promise<void> {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS contact_batches (
        id SERIAL PRIMARY KEY,
        file_name VARCHAR(255) NOT NULL,
        uploaded_by INT REFERENCES users(id) ON DELETE SET NULL,
        uploaded_by_name VARCHAR(255),
        uploaded_at TIMESTAMPTZ DEFAULT NOW(),
        total_rows INT DEFAULT 0,
        imported_count INT DEFAULT 0,
        merged_count INT DEFAULT 0,
        project_id INT REFERENCES projects(id) ON DELETE SET NULL,
        project_name VARCHAR(255),
        notes TEXT
      );

      ALTER TABLE contacts ADD COLUMN IF NOT EXISTS batch_id INT REFERENCES contact_batches(id) ON DELETE SET NULL;
      CREATE INDEX IF NOT EXISTS idx_contacts_batch_id ON contacts(batch_id);
    `);
    console.log('[DB] Database schema verified (contact_batches initialized).');
  } catch (err) {
    console.error('[DB] Error initializing database tables:', err);
  }
}
