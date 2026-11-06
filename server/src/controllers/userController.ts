import { Response } from 'express';
import { AuthenticatedRequest } from '../middleware/auth';
import * as userModel from '../models/userModel';

export async function getUserStats(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const stats = await userModel.getUserStats(userId);

    res.status(200).json({
      success: true,
      data: stats,
    });
  } catch (err: any) {
    console.error('Error fetching user stats:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch user stats',
      error: err.message,
    });
  }
}

export async function updateProfile(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Unauthorized' });
      return;
    }

    const { fullName, mobileNumber } = req.body;
    if (!fullName && !mobileNumber) {
      res.status(400).json({
        success: false,
        message: 'At least one field (fullName or mobileNumber) must be provided',
      });
      return;
    }

    // Optional: check if mobile number is taken by another user
    if (mobileNumber) {
      const existing = await userModel.findByEmailOrMobile('', mobileNumber.trim());
      if (existing && existing.id !== userId) {
        res.status(409).json({
          success: false,
          message: 'Mobile number already registered to another account',
        });
        return;
      }
    }

    const updatedUser = await userModel.updateProfile(
      userId,
      fullName ? fullName.trim() : undefined,
      mobileNumber ? mobileNumber.trim() : undefined
    );

    if (!updatedUser) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }

    res.status(200).json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        id: updatedUser.id,
        fullName: updatedUser.full_name,
        email: updatedUser.email,
        mobileNumber: updatedUser.mobile_number,
      },
    });
  } catch (err: any) {
    console.error('Error updating profile:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to update profile',
      error: err.message,
    });
  }
}
