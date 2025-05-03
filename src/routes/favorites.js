import { Router } from 'express';
import { toggleFavorite, getFavorites, clearFavorites } from '../controllers/favorites.js';
import { requireAuthorizedUser } from '../middlewares/auth.js';

const router = Router();

router.patch('/:id', requireAuthorizedUser, toggleFavorite);
router.get('/', getFavorites);
router.delete('/', clearFavorites);

export default router;
