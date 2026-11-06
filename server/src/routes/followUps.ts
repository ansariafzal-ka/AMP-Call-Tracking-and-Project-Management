import { Router } from 'express';
import {
  getFollowUps,
  createFollowUp,
  completeFollowUp,
  rescheduleFollowUp,
} from '../controllers/followUpController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

// All follow-up routes require authentication
router.use(authenticateToken);

router.get('/', getFollowUps);
router.post('/', createFollowUp);
router.patch('/:id/complete', completeFollowUp);
router.patch('/:id/reschedule', rescheduleFollowUp);

export default router;

