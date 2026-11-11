import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as adminCallModel from '../models/adminCallModel';

export async function getAdminCalls(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status : undefined;
    const outcome = typeof req.query.outcome === 'string' ? req.query.outcome : undefined;
    const startDate = typeof req.query.startDate === 'string' ? req.query.startDate : undefined;
    const endDate = typeof req.query.endDate === 'string' ? req.query.endDate : undefined;

    let userId: number | undefined = undefined;
    if (req.query.userId && req.query.userId !== 'all') {
      const parsedUserId = parseInt(req.query.userId as string, 10);
      if (!isNaN(parsedUserId)) userId = parsedUserId;
    }

    let projectId: number | undefined = undefined;
    if (req.query.projectId && req.query.projectId !== 'all') {
      const parsedProjectId = parseInt(req.query.projectId as string, 10);
      if (!isNaN(parsedProjectId)) projectId = parsedProjectId;
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(10000, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const {
      calls,
      total,
      totalDurationSeconds,
      connectedCallsCount,
    } = await adminCallModel.getAdminCalls(
      {
        search,
        userId,
        projectId,
        status,
        outcome,
        startDate,
        endDate,
      },
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        summary: {
          totalCalls: total,
          connectedCalls: connectedCallsCount,
          connectedRate: total > 0 ? Math.round((connectedCallsCount / total) * 100) : 0,
          totalDurationSeconds,
        },
        calls,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin calls:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch team call logs',
      error: err.message,
    });
  }
}

