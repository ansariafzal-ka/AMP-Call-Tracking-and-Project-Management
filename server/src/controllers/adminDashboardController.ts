import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as adminDashboardModel from '../models/adminDashboardModel';

export async function getAdminDashboard(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;
    const userId = req.query.userId ? parseInt(req.query.userId as string, 10) : undefined;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const [summary, leaderboard] = await Promise.all([
      adminDashboardModel.getAdminDashboardSummary(startDate, endDate, userId),
      adminDashboardModel.getAdminCallerLeaderboard(startDate, endDate, limit, offset),
    ]);

    res.status(200).json({
      success: true,
      data: {
        summary,
        leaderboard,
        dateRange: {
          startDate: startDate || 'Today (00:00)',
          endDate: endDate || 'Now',
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin dashboard analytics:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch admin dashboard analytics',
      error: err.message,
    });
  }
}

