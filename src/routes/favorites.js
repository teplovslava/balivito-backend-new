import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { toggleFavorite, getFavorites } from '../controllers/favorites.js';
import { userIdMiddleware } from '../middlewares/userId.js';

const router = Router();

router.patch('/:id', authMiddleware, toggleFavorite);
router.get('/', userIdMiddleware, getFavorites);

export default router;
