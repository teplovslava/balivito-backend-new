import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import User from "../models/User.js";

const JWT_SECRET = process.env.JWT_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export const userIdMiddleware = async (req, res, next) => {
  const token = req.cookies.token;
  const refreshToken = req.cookies.refreshToken;

  // 👉 1. Проверка access-токена
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      req.userId = decoded.id;
      return next();
    } catch (err) {
      // токен протух — пробуем refresh
    }
  }

  // 👉 2. Проверка refresh-токена
  if (refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, REFRESH_SECRET);

      // генерируем новый access
      const newAccessToken = jwt.sign({ id: decoded.id }, JWT_SECRET, {
        expiresIn: "15m",
      });

      res.cookie("token", newAccessToken, {
        httpOnly: true,
        sameSite: "Lax",
        maxAge: 1000 * 60 * 15,
      });

      req.userId = decoded.id;
      return next();
    } catch (err) {
      // ❌ refresh протух — НИКАКОГО создания гостя
      return res
        .status(401)
        .json({ message: "Сессия истекла. Пожалуйста, залогиньтесь заново." });
    }
  }

  // 👉 3. Нет токенов вообще — создаём нового гостя
  try {
    const newGuest = new User({
      isGuest: true,
      name: `Guest_${uuidv4().slice(0, 6)}`,
      email: `guest_${uuidv4()}@example.com`,
      password: uuidv4(),
    });

    await newGuest.save();

    const guestAccessToken = jwt.sign({ id: newGuest._id }, JWT_SECRET, {
      expiresIn: "15m",
    });
    const guestRefreshToken = jwt.sign({ id: newGuest._id }, REFRESH_SECRET, {
      expiresIn: "30d",
    });

    res.cookie("token", guestAccessToken, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 1000 * 60 * 15,
    });

    res.cookie("refreshToken", guestRefreshToken, {
      httpOnly: true,
      sameSite: "Lax",
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    req.userId = newGuest._id.toString();
    return next();
  } catch (guestErr) {
    console.error("Ошибка при создании гостя:", guestErr);
    return res
      .status(500)
      .json({ message: "Ошибка при создании гостевого пользователя" });
  }
};
