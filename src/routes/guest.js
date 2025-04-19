import { Router } from 'express';
import { assignGuestId } from '../controllers/guest.js';
import { guestLimiter } from '../middlewares/rateLimiter.js';

const router = Router();

router.get('/',guestLimiter, assignGuestId);

export default router;