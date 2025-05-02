import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET;

export const socketAuth = (socket, next) => {
  const rawCookie = socket.handshake.headers?.cookie;

  console.log(socket.handshake.headers)
  const parsedCookies = cookie.parse(rawCookie || '');
  const token = parsedCookies.token;

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
