import { Router } from 'express';
import { toggleFavorite, getFavorites, clearFavorites } from '../controllers/favorites.js';

const router = Router();

router.patch('/:id', requireAuthorizedUser, toggleFavorite);
router.get('/', getFavorites);
router.delete('/', clearFavorites);

export default router;
