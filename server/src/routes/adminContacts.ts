import { Router } from 'express';
import {
  getAdminContacts,
  assignContacts,
} from '../controllers/adminContactController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// All admin contact routes require valid token + admin role
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', getAdminContacts);
router.post('/assign', assignContacts);

export default router;

