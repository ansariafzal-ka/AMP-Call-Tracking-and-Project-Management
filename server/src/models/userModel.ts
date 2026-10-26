import { ResultSetHeader } from 'mysql2/promise';
import { pool } from '../config/db';
import { UserRow, RegisterDTO } from '../types/user';

export async function findByEmail(email: string): Promise<UserRow | null> {
  const [users] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at FROM users WHERE email = ? LIMIT 1',
    [email]
  );
  return users[0] || null;
}

export async function findByEmailOrMobile(email: string, mobile: string): Promise<UserRow | null> {
  const [users] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at FROM users WHERE email = ? OR mobile_number = ? LIMIT 1',
    [email, mobile]
  );
  return users[0] || null;
}

export async function findById(id: number): Promise<UserRow | null> {
  const [users] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, mobile_number, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return users[0] || null;
}

export async function findWithPasswordById(id: number): Promise<UserRow | null> {
  const [users] = await pool.query<UserRow[]>(
    'SELECT id, full_name, email, mobile_number, password_hash, is_active, created_at FROM users WHERE id = ? LIMIT 1',
    [id]
  );
  return users[0] || null;
}

export async function createUser(data: RegisterDTO): Promise<number> {
  const [result] = await pool.query<ResultSetHeader>(
    'INSERT INTO users (full_name, email, mobile_number, password_hash) VALUES (?, ?, ?, ?)',
    [data.fullName, data.email, data.mobileNumber, data.passwordHash]
  );
  return result.insertId;
}

export async function updatePassword(id: number, passwordHash: string): Promise<boolean> {
  const [result] = await pool.query<ResultSetHeader>(
    'UPDATE users SET password_hash = ? WHERE id = ?',
    [passwordHash, id]
  );
  return result.affectedRows > 0;
}