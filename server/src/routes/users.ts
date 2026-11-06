import { Router } from 'express';
import { getUserStats, updateProfile } from '../controllers/userController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All user routes require authentication
router.use(authenticateToken);

router.get('/stats', getUserStats);
router.patch('/profile', updateProfile);

export default router;

