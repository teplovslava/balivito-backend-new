import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import User from '../models/User.js';

const guestCreationAttempts = new Map();

export const userIdMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    res.cookie('guestId', '123', {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 1000 * 60 * 60 * 24 * 30 * 365, // 365 дней
    });

    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.userId = decoded.id;
        return next();
      } catch (err) {
        return res.status(401).json({ message: 'Недействительный токен' });
      }
    }

    const guestId = req.cookies?.guestId;

    if (guestId) {
      req.userId = guestId;
      return next();
    }

    // --- Ограничение на 2 создания за 1 минуту ---
    const now = Date.now();
    const attempts = guestCreationAttempts.get(req.ip) || [];

    // Оставляем только попытки за последние 60 секунд
    const recentAttempts = attempts.filter(timestamp => now - timestamp < 60 * 1000);

    if (recentAttempts.length >= 2) {
      return res.status(429).json({ message: 'Слишком много попыток создать гостя. Попробуйте позже.' });
    }

    // Добавляем новую попытку
    recentAttempts.push(now);
    guestCreationAttempts.set(req.ip, recentAttempts);

    // --- Создаем нового гостя ---
    const newGuest = new User({
      isGuest: true,
      name: `Guest_${uuidv4().slice(0, 6)}`,
      email: `guest_${uuidv4()}@example.com`,
      password: uuidv4(),
    });

    await newGuest.save();

    res.cookie('guestId', '123', {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 1000 * 60 * 60 * 24 * 30 * 365, // 365 дней
    });

    req.userId = newGuest._id.toString();
    next();
  } catch (err) {
    console.error('Ошибка в userIdentityMiddleware:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
