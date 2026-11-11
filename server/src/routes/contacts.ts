import { Router } from 'express';
import {
  getAssignedContacts,
  getContactDetails,
  lookupContact,
  createContact,
} from '../controllers/contactController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All contact routes require caller authentication
router.use(authenticateToken);

router.get('/lookup', lookupContact);
router.post('/', createContact);
router.get('/', getAssignedContacts);
router.get('/:id', getContactDetails);

export default router;

