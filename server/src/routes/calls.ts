import { Router } from 'express';
import { createCall, getCalls, updateCall } from '../controllers/callController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/', authenticateToken, createCall);
router.get('/', authenticateToken, getCalls);
router.patch('/:id', authenticateToken, updateCall);

export default router;
