import { Router } from 'express';
import { requireAuthorizedUser } from '../middlewares/auth.js';

import {
  getFeedback,
  setFeedback,
  deleteFeedback,
} from '../controllers/feedbacks.js';

const router = Router();

// Оставить отзыв
router.post('/:id', requireAuthorizedUser, setFeedback);

// Получить отзывы пользователя
router.get('/:id', getFeedback);

// Удалить отзыв
router.delete('/:id/:feedbackId', requireAuthorizedUser, deleteFeedback);

export default router;
