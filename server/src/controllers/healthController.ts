import { Request, Response } from 'express';
import { pool } from '../config/db';

export async function checkHealth(_req: Request, res: Response) {
  try {
    await pool.query('SELECT 1');
    return res.status(200).json({ status: 'ok', db: 'connected' });
  } catch (error) {
    return res.status(500).json({ status: 'error', db: 'disconnected' });
  }
}
