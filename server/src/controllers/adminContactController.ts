import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as adminContactModel from '../models/adminContactModel';
import * as userModel from '../models/userModel';

export async function getAdminContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const category = typeof req.query.category === 'string' ? req.query.category : undefined;
    const city = typeof req.query.city === 'string' ? req.query.city : undefined;

    let assignedUserId: number | undefined = undefined;
    let unassignedOnly: boolean | undefined = undefined;

    if (req.query.assignedUserId === 'unassigned') {
      unassignedOnly = true;
    } else if (req.query.assignedUserId) {
      const parsedId = parseInt(req.query.assignedUserId as string, 10);
      if (!isNaN(parsedId)) {
        assignedUserId = parsedId;
      }
    }

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { contacts, total } = await adminContactModel.getAdminContacts(
      {
        search,
        category,
        city,
        assignedUserId,
        unassignedOnly,
      },
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        contacts,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin contacts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch contacts',
      error: err.message,
    });
  }
}

export async function assignContacts(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { contactIds, targetUserId, reassignFollowUps } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.status(400).json({
        success: false,
        message: 'contactIds must be a non-empty array of numbers',
      });
      return;
    }

    if (!targetUserId || isNaN(parseInt(targetUserId, 10))) {
      res.status(400).json({
        success: false,
        message: 'Valid targetUserId is required',
      });
      return;
    }

    // Verify target user exists and is active
    const targetUser = await userModel.findById(parseInt(targetUserId, 10));
    if (!targetUser) {
      res.status(404).json({
        success: false,
        message: 'Target user does not exist',
      });
      return;
    }

    if (!targetUser.is_active) {
      res.status(400).json({
        success: false,
        message: 'Cannot assign contacts to a deactivated user',
      });
      return;
    }

    const count = await adminContactModel.assignContacts({
      contactIds: contactIds.map((id: any) => parseInt(id, 10)),
      targetUserId: parseInt(targetUserId, 10),
      reassignFollowUps: reassignFollowUps !== undefined ? Boolean(reassignFollowUps) : true,
    });

    res.status(200).json({
      success: true,
      message: `Successfully assigned ${count} contact(s) to ${targetUser.full_name}`,
      data: {
        assignedCount: count,
        targetUserId: targetUser.id,
        targetUserName: targetUser.full_name,
      },
    });
  } catch (err: any) {
    console.error('Error assigning contacts:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to assign contacts',
      error: err.message,
    });
  }
}

