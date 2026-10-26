import { Router } from 'express';
import { register, login, getMe, changePassword } from '../controllers/authController';
import { authenticateToken } from '../middleware/auth';

const router = Router();

router.post('/register', register);
router.post('/login', login);
router.get('/me', authenticateToken, getMe);
router.patch('/change-password', authenticateToken, changePassword);

export default router;
