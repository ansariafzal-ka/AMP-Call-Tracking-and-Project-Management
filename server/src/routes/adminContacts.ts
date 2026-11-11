import { Router } from 'express';
import {
  getAdminContacts,
  assignContacts,
  bulkUploadContacts,
  updateContact,
  getExistingContactNumbers,
} from '../controllers/adminContactController';
import { authenticateToken } from '../middleware/auth';
import { requireAdmin } from '../middleware/adminAuth';

const router = Router();

// All admin contact routes require valid token + admin role
router.use(authenticateToken);
router.use(requireAdmin);

router.get('/existing-numbers', getExistingContactNumbers);
router.get('/', getAdminContacts);
router.post('/assign', assignContacts);
router.post('/bulk-upload', bulkUploadContacts);
router.put('/:id', updateContact);

export default router;

