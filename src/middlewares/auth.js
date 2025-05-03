import User from '../models/User.js';

export const requireAuthorizedUser = async (req, res, next) => {
  if (!req.userId) {
    return res.status(401).json({ message: 'Пользователь не авторизован' });
  }

  try {
    const user = await User.findById(req.userId);
    if (!user || user.isGuest) {
      return res.status(403).json({ message: 'Только для зарегистрированных пользователей' });
    }

    next();
  } catch (err) {
    console.error('Ошибка проверки пользователя:', err);
    return res.status(500).json({ message: 'Ошибка сервера' });
  }
};

