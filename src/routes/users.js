import { Router } from 'express';
import { getAllUsers, createUser } from '../controllers/user.js';

const router = Router();

router.get('/', getAllUsers);
router.post('/', createUser);

export default router;
