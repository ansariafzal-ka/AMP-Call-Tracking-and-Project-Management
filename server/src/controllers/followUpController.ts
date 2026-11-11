import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as followUpModel from '../models/followUpModel';

export async function getFollowUps(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const filter = typeof req.query.status === 'string' ? req.query.status.toLowerCase() : 'all';
    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(5000, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { followUps, counts, total } = await followUpModel.getCategorizedFollowUps(
      userId,
      filter,
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        summary: counts,
        followUps,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching follow-ups:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch follow-ups',
      error: err.message,
    });
  }
}

export async function createFollowUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { contactId, callId, dueAt, notes } = req.body;
    if (!contactId || !dueAt) {
      res.status(400).json({
        success: false,
        message: 'contactId and dueAt are required',
      });
      return;
    }

    const newId = await followUpModel.createFollowUp(userId, {
      contactId: parseInt(contactId, 10),
      callId: callId ? parseInt(callId, 10) : undefined,
      dueAt,
      notes,
    });

    res.status(201).json({
      success: true,
      message: 'Follow-up scheduled successfully',
      data: { id: newId },
    });
  } catch (err: any) {
    console.error('Error creating follow-up:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to schedule follow-up',
      error: err.message,
    });
  }
}

export async function completeFollowUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const followUpId = parseInt(idParam, 10);
    if (!followUpId || isNaN(followUpId)) {
      res.status(400).json({ success: false, message: 'Invalid follow-up ID' });
      return;
    }

    const { notes } = req.body || {};
    const success = await followUpModel.completeFollowUp(followUpId, userId, notes);

    if (!success) {
      res.status(404).json({
        success: false,
        message: 'Follow-up not found or already completed',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Follow-up marked as completed',
    });
  } catch (err: any) {
    console.error('Error completing follow-up:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to complete follow-up',
      error: err.message,
    });
  }
}

export async function rescheduleFollowUp(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const followUpId = parseInt(idParam, 10);
    if (!followUpId || isNaN(followUpId)) {
      res.status(400).json({ success: false, message: 'Invalid follow-up ID' });
      return;
    }

    const { newDueAt, notes } = req.body;
    if (!newDueAt) {
      res.status(400).json({
        success: false,
        message: 'newDueAt is required',
      });
      return;
    }

    const success = await followUpModel.rescheduleFollowUp(
      followUpId,
      userId,
      newDueAt,
      notes
    );

    if (!success) {
      res.status(404).json({
        success: false,
        message: 'Follow-up not found or not assigned to you',
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Follow-up rescheduled successfully',
    });
  } catch (err: any) {
    console.error('Error rescheduling follow-up:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to reschedule follow-up',
      error: err.message,
    });
  }
}

