import { Request, Response } from 'express';
import { hashPassword, comparePassword } from '../utils/passwords';
import { generateToken } from '../utils/jwt';
import { AuthenticatedRequest } from '../types/auth';
import * as userModel from '../models/userModel';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_REGEX = /^[0-9+\s-]{8,20}$/;

export async function register(req: Request, res: Response) {
  try {
    const { fullName, email, mobileNumber, password, confirmPassword } = req.body;

    if (!fullName || !email || !mobileNumber || !password || !confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'All fields are required (Full Name, Email, Mobile, Password, Confirm Password)',
      });
    }

    const cleanFullName = String(fullName).trim();
    const cleanEmail = String(email).trim().toLowerCase();
    const cleanMobile = String(mobileNumber).trim();

    if (cleanFullName.length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Full Name must be at least 2 characters',
      });
    }

    if (!EMAIL_REGEX.test(cleanEmail)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid email address',
      });
    }

    if (!MOBILE_REGEX.test(cleanMobile)) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide a valid mobile number (min 8 digits)',
      });
    }

    if (String(password).length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long',
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Password and Confirm Password do not match',
      });
    }

    // Check if user already exists
    const existing = await userModel.findByEmailOrMobile(cleanEmail, cleanMobile);
    if (existing) {
      if (existing.email === cleanEmail) {
        return res.status(409).json({
          status: 'error',
          message: 'An account with this email already exists',
        });
      }
      return res.status(409).json({
        status: 'error',
        message: 'An account with this mobile number already exists',
      });
    }

    // Hash password & insert
    const passwordHash = await hashPassword(password);
    const newUserId = await userModel.createUser({
      fullName: cleanFullName,
      email: cleanEmail,
      mobileNumber: cleanMobile,
      passwordHash,
    });

    const token = generateToken({
      id: newUserId,
      email: cleanEmail,
      fullName: cleanFullName,
    });

    return res.status(201).json({
      status: 'ok',
      message: 'Registration successful',
      token,
      user: {
        id: newUserId,
        fullName: cleanFullName,
        email: cleanEmail,
        mobileNumber: cleanMobile,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An unexpected server error occurred during registration',
    });
  }
}

export async function login(req: Request, res: Response) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Email and password are required',
      });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const user = await userModel.findByEmail(cleanEmail);

    if (!user) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    if (!user.is_active) {
      return res.status(403).json({
        status: 'error',
        message: 'Your account has been deactivated. Please contact support.',
      });
    }

    const isMatch = await comparePassword(String(password), user.password_hash);
    if (!isMatch) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid email or password',
      });
    }

    const token = generateToken({
      id: user.id,
      email: user.email,
      fullName: user.full_name,
    });

    return res.status(200).json({
      status: 'ok',
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        fullName: user.full_name,
        email: user.email,
        mobileNumber: user.mobile_number,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'An unexpected server error occurred during login',
    });
  }
}

export async function getMe(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ status: 'error', message: 'Unauthorized' });
    }

    const user = await userModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User profile not found',
      });
    }

    return res.status(200).json({
      status: 'ok',
      user: {
        id: user.id,
        name: user.full_name,
        fullName: user.full_name,
        email: user.email,
        mobileNumber: user.mobile_number,
        createdAt: user.created_at,
      },
    });
  } catch (error) {
    console.error('Fetch user error:', error);
    return res.status(500).json({
      status: 'error',
      message: 'Failed to retrieve user profile',
    });
  }
}

export async function changePassword(req: AuthenticatedRequest, res: Response) {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { current_password, new_password } = req.body;

    if (!current_password || !new_password) {
      return res.status(400).json({ error: 'Both current_password and new_password are required' });
    }

    const user = await userModel.findWithPasswordById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current_password against stored hash with bcrypt compare
    const isMatch = await comparePassword(String(current_password), user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const cleanNewPassword = String(new_password);

    // new_password must be at least 8 characters
    if (cleanNewPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters long' });
    }

    // new_password must be different from current one
    const isSameAsCurrent = await comparePassword(cleanNewPassword, user.password_hash);
    if (isSameAsCurrent || cleanNewPassword === String(current_password)) {
      return res.status(400).json({ error: 'New password must be different from current password' });
    }

    // Hash new_password and save
    const newHash = await hashPassword(cleanNewPassword);
    await userModel.updatePassword(userId, newHash);

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Change password error:', error);
    return res.status(500).json({ error: 'Failed to update password' });
  }
}