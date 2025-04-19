import { body } from 'express-validator';

export const createAdValidation = [
  body('title').isLength({ min: 3 }).withMessage('Заголовок обязателен'),
  body('category').notEmpty().isMongoId().withMessage('category is required'),
  body('location').notEmpty().isMongoId().withMessage('location is required'),
];
