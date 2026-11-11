import { Router } from 'express';
import {
  getAdminUsers,
  createAdminUser,
  updateAdminUser,
  deleteAdminUser,
} from '../controllers/adminUserController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// All admin user routes require valid token + admin role
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', getAdminUsers);
router.post('/', createAdminUser);
router.patch('/:id', updateAdminUser);
router.delete('/:id', deleteAdminUser);

export default router;

