import jwt from 'jsonwebtoken';

export const userIdMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  const guestHeader = req.headers['X-Guest-ID'];

  console.log(req.headers)

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    if (guestHeader) {
      req.userId = guestHeader;
    } else {
      req.userId = req?.cookies?.guestId;
      console.log(req.userId)
    }
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.id;
    next();
  } catch (error) {
    console.error('Ошибка проверки токена:', error);
    res.status(401).json({ message: 'Недействительный токен' });
  }
};

