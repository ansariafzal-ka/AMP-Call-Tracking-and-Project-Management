import { Router } from 'express';
import { getAdminDashboard } from '../controllers/adminDashboardController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// Admin Dashboard requires authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', getAdminDashboard);

export default router;

