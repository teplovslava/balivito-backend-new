import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { toggleFavorite, getFavorites, clearFavorites } from '../controllers/favorites.js';
import { userIdMiddleware } from '../middlewares/userId.js';

const router = Router();

router.patch('/:id', authMiddleware, toggleFavorite);
router.get('/', userIdMiddleware, getFavorites);
router.delete('/', userIdMiddleware, clearFavorites);

export default router;
