import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { toggleFavorite, getFavorites } from '../controllers/favorites.js';

const router = Router();

router.patch('/:id', authMiddleware, toggleFavorite);
router.get('/', authMiddleware, getFavorites);

export default router;
