import { Router } from 'express';
import {
  getProjects,
  createProject,
  getProjectById,
  updateProject,
  assignProjectMembers,
} from '../controllers/adminProjectController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// All admin project routes require authentication + admin role
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/', getProjects);
router.post('/', createProject);
router.get('/:id', getProjectById);
router.patch('/:id', updateProject);
router.post('/:id/assign', assignProjectMembers);

export default router;

