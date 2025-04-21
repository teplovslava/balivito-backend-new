import { Router } from 'express';
import { authMiddleware } from '../middlewares/auth.js';
import { userIdMiddleware } from '../middlewares/userId.js';
import {
  getFeedback,
  setFeedback,
  deleteFeedback,
} from '../controllers/feedbacks.js';

const router = Router();

// Оставить отзыв
router.post('/:id', authMiddleware, setFeedback);

// Получить отзывы пользователя
router.get('/:id', userIdMiddleware, getFeedback);

// Удалить отзыв
router.delete('/:id/:feedbackId', authMiddleware, deleteFeedback);

export default router;
