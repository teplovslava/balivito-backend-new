import { body } from 'express-validator';

export const registerValidation = [
  body('email')
    .isEmail()
    .withMessage('Некорректный email'),
  body('password')
    .isLength({ min: 6 })
    .withMessage('Пароль должен быть не менее 6 символов'),
  body('name')
    .notEmpty()
    .withMessage('Имя обязательно'),
];

export const loginValidation = [
    body('email')
      .isEmail()
      .withMessage('Введите корректный email'),
    body('password')
      .notEmpty()
      .withMessage('Введите пароль'),
  ];