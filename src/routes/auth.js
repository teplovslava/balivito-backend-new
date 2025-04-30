import { Router } from 'express';
import { login, refreshSession, register, resendVerification, verifyEmail } from '../controllers/auth.js';
import { loginValidation, registerValidation } from '../validators/auth.js';
import { validate } from '../middlewares/validate.js';
import { verifyRateLimiter } from '../middlewares/rateLimiter.js';
import { userId } from '../middlewares/userId.js';

const router = Router();

router.post('/register', userId, registerValidation, validate, register);
router.post('/login', loginValidation, validate, login);
router.get('/verify', verifyRateLimiter, verifyEmail);
router.post('/resend-verification', verifyRateLimiter, resendVerification);
router.post('/refresh', userId, refreshSession)

export default router;