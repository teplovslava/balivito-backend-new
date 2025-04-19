import { Router } from 'express';
import { assignGuestId } from '../controllers/guest.js';

const router = Router();

router.get('/', assignGuestId);

export default router;