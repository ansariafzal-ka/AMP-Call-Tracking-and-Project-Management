import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as adminUserModel from '../models/adminUserModel';
import * as userModel from '../models/userModel';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[0-9+\s-]{8,20}$/;

export async function getAdminUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const role = typeof req.query.role === 'string' ? req.query.role : undefined;
    const isActiveParam = req.query.status || req.query.isActive;
    let isActive: boolean | undefined = undefined;
    if (isActiveParam === 'true' || isActiveParam === 'active') isActive = true;
    else if (isActiveParam === 'false' || isActiveParam === 'inactive') isActive = false;

    const page = Math.max(1, parseInt(req.query.page as string, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string, 10) || 20));
    const offset = (page - 1) * limit;

    const { users, total } = await adminUserModel.getAdminUsers(
      { search, role, isActive },
      limit,
      offset
    );

    res.status(200).json({
      success: true,
      data: {
        users,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err: any) {
    console.error('Error fetching admin users:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch users',
      error: err.message,
    });
  }
}

export async function createAdminUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { fullName, email, mobileNumber, password, role, dailyTarget, weeklyTarget } = req.body;

    if (!fullName || !email || !mobileNumber || !password) {
      res.status(400).json({
        success: false,
        message: 'fullName, email, mobileNumber, and password are required',
      });
      return;
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMobile = String(mobileNumber).trim();

    if (!EMAIL_REGEX.test(cleanEmail)) {
      res.status(400).json({ success: false, message: 'Please provide a valid email address' });
      return;
    }

    if (!MOBILE_REGEX.test(cleanMobile)) {
      res.status(400).json({ success: false, message: 'Please provide a valid mobile number' });
      return;
    }

    if (String(password).length < 6) {
      res.status(400).json({ success: false, message: 'Password must be at least 6 characters long' });
      return;
    }

    // Check duplicate email or mobile
    const existing = await userModel.findByEmailOrMobile(cleanEmail, cleanMobile);
    if (existing) {
      res.status(409).json({
        success: false,
        message: 'A user with this email or mobile number already exists',
      });
      return;
    }

    const newId = await adminUserModel.createAdminUser({
      fullName,
      email: cleanEmail,
      mobileNumber: cleanMobile,
      password,
      role: role === 'admin' ? 'admin' : 'caller',
      dailyTarget: dailyTarget ? parseInt(dailyTarget, 10) : 50,
      weeklyTarget: weeklyTarget ? parseInt(weeklyTarget, 10) : 250,
    });

    res.status(201).json({
      success: true,
      message: 'User created successfully',
      data: {
        id: newId,
        fullName,
        email: cleanEmail,
        mobileNumber: cleanMobile,
        role: role === 'admin' ? 'admin' : 'caller',
      },
    });
  } catch (err: any) {
    console.error('Error creating user via admin:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to create user',
      error: err.message,
    });
  }
}

export async function updateAdminUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = parseInt(idParam, 10);
    if (!targetUserId || isNaN(targetUserId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    const { role, isActive, dailyTarget, weeklyTarget, fullName, mobileNumber } = req.body;

    const updated = await adminUserModel.updateAdminUser(targetUserId, {
      role: role ? (role === 'admin' ? 'admin' : 'caller') : undefined,
      isActive: isActive !== undefined ? Boolean(isActive) : undefined,
      dailyTarget: dailyTarget !== undefined ? parseInt(dailyTarget, 10) : undefined,
      weeklyTarget: weeklyTarget !== undefined ? parseInt(weeklyTarget, 10) : undefined,
      fullName,
      mobileNumber,
    });

    if (!updated) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'User updated successfully',
      data: updated,
    });
  } catch (err: any) {
    console.error('Error updating user via admin:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update user',
      error: err.message,
    });
  }
}

export async function deleteAdminUser(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const currentAdminId = req.user?.id;
    const idParam = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    const targetUserId = parseInt(idParam, 10);

    if (!targetUserId || isNaN(targetUserId)) {
      res.status(400).json({ success: false, message: 'Invalid user ID' });
      return;
    }

    if (currentAdminId && currentAdminId === targetUserId) {
      res.status(400).json({
        success: false,
        message: 'You cannot delete your own logged-in admin account',
      });
      return;
    }

    const { transferUserId } = req.body || {};
    const parsedTransferId = transferUserId ? parseInt(transferUserId, 10) : null;

    if (parsedTransferId && parsedTransferId === targetUserId) {
      res.status(400).json({
        success: false,
        message: 'Cannot transfer contacts to the user being deleted',
      });
      return;
    }

    const result = await adminUserModel.deleteAdminUser(targetUserId, parsedTransferId);
    if (!result) {
      res.status(404).json({ success: false, message: 'User not found or already deleted' });
      return;
    }

    res.status(200).json({
      success: true,
      message: `User deleted successfully. ${result.transferred_contacts_count} contact(s) ${parsedTransferId ? 'transferred' : 'unassigned'}.`,
      data: result,
    });
  } catch (err: any) {
    console.error('Error deleting user via admin:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to delete user',
      error: err.message,
    });
  }
}


