import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export const socketAuth = (socket, next) => {
  console.log(123121)
  const token = socket.handshake.auth?.token;

  if (!token) {
    return next(new Error('Отсутствует токен'));
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    socket.userId = decoded.id;
    next();
  } catch (err) {
    console.error('Ошибка в socketAuth:', err);
    return next(new Error('Неверный токен'));
  }
};
