import { Router } from 'express';
import { getAssignedContacts, getContactDetails } from '../controllers/contactController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All contact routes require caller authentication
router.use(authenticateToken);

router.get('/', getAssignedContacts);
router.get('/:id', getContactDetails);

export default router;

