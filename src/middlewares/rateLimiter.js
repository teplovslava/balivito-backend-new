import rateLimit from 'express-rate-limit';

export const verifyRateLimiter = rateLimit({
  windowMs: 60 * 10 * 1000, // 1 час
  max: 10, // максимум 10 запросов за 1 час
  message: 'Слишком много попыток. Попробуйте позже.',
});

export const guestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 час
  max: 3, // максимум 10 запросов в час с одного IP
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 429,
    message: 'Слишком много запросов. Попробуйте позже.',
  },
});