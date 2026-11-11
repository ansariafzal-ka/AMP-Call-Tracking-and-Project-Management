import { Router } from 'express';
import { getAdminCalls } from '../controllers/adminCallController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', getAdminCalls);

export default router;
