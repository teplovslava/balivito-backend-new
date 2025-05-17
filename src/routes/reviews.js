import { Router } from 'express';
import { requireAuthorizedUser } from '../middlewares/auth.js';

import {
  addReview,            // POST   – добавить отзыв
  replyToReview,        // POST   – ответить на отзыв (опц.)
  listReviews,          // GET    – список отзывов пользователя
  deleteReview,         // DELETE – удалить свой отзыв
} from '../controllers/reviewController.js';

const router = Router();

/* ────────────────────────────────────────────────
   POST    /reviews/:targetId                       – авторизованный пользователь оставляет отзыв
   GET     /reviews/:targetId                       – любой смотрит отзывы о пользователе
   POST    /reviews/:targetId/:reviewId/reply       – авторизованный/адресат отвечает на отзыв
   DELETE  /reviews/:targetId/:reviewId             – авторизованный пользователь удаляет СВОЙ отзыв
 ────────────────────────────────────────────────*/

router.post('/:targetId', requireAuthorizedUser, addReview);

router.get('/:targetId', listReviews);

// ответ на отзыв (если нужно)
router.post(
  '/:targetId/:reviewId/reply',
  requireAuthorizedUser,
  replyToReview
);

// удалить собственный отзыв
router.delete(
  '/:targetId/:reviewId',
  requireAuthorizedUser,
  deleteReview
);

export default router;
