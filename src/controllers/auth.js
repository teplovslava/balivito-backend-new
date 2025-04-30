import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { sendVerificationEmail } from '../utils/sendVerificationMail.js';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

const createTokens = (userId) => {
  const accessToken = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '15m' });
  const refreshToken = jwt.sign({ id: userId }, JWT_REFRESH_SECRET, { expiresIn: '30d' });

  return { accessToken, refreshToken };
};

const setTokenCookies = (res, accessToken, refreshToken) => {
  res.cookie('token', accessToken, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 1000 * 60 * 15,
  });

  res.cookie('refreshToken', refreshToken, {
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
};

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;
    let userWasGuest = false;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Пользователь с таким email уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(32).toString('hex');

    const guestUser = await User.findById(req.userId);
    let finalUser;

    if (guestUser && guestUser.isGuest) {
      userWasGuest = true;
      guestUser.email = email;
      guestUser.name = name;
      guestUser.password = hashedPassword;
      guestUser.verificationToken = verificationToken;
      guestUser.isVerified = false;
      guestUser.isGuest = false;

      await guestUser.save();
      finalUser = guestUser;
    } else {
      const newUser = new User({
        email,
        name,
        password: hashedPassword,
        verificationToken,
        isVerified: false,
      });

      await newUser.save();
      finalUser = newUser;
    }

    try {
      await sendVerificationEmail(email, verificationToken);

      const { accessToken, refreshToken } = createTokens(finalUser._id);
      setTokenCookies(res, accessToken, refreshToken);

      res.status(201).json({ message: 'Пользователь зарегистрирован. Проверьте почту.' });
    } catch (emailErr) {
      console.error('Ошибка отправки письма:', emailErr);

      if (!userWasGuest) await User.deleteOne({ email });
      res.status(500).json({ message: 'Ошибка отправки письма. Попробуйте позже.' });
    }
  } catch (error) {
    console.error('Ошибка при регистрации:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ message: 'Неверный email или пароль' });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: 'Неверный email или пароль' });

    if (!user.isVerified) {
      const verificationToken = randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;
      await user.save();
      await sendVerificationEmail(email, verificationToken);
      return res.status(401).json({ message: 'Подтвердите почту. Ссылка отправлена повторно.' });
    }

    const { accessToken, refreshToken } = createTokens(user._id);
    setTokenCookies(res, accessToken, refreshToken);

    const { password: _, ...userData } = user.toObject();
    res.status(200).json({ user: userData });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const logout = (req, res) => {
  res.clearCookie('token');
  res.clearCookie('refreshToken');
  res.status(200).json({ message: 'Вы вышли из аккаунта' });
};

export const verifyEmail = async (req, res) => {
  try {
    const { email, token } = req.query;
    const user = await User.findOne({ email });

    if (!user) {
      return res.render('verify', {
        title: 'Упс...',
        color: 'red',
        message: 'Пользователь не найден.'
      });
    }

    if (user.isVerified) {
      return res.render('verify', {
        title: '✅ Успех!',
        color: '#27ae60',
        message: 'Ваша почта уже подтверждена.'
      });
    }

    const cooldown = 60 * 1000;
    const maxAttempts = 10;

    if (user.lastVerificationAttempt && Date.now() - user.lastVerificationAttempt.getTime() < cooldown) {
      return res.render('verify', {
        title: 'Упс...',
        color: 'red',
        message: 'Слишком много попыток. Подождите минуту.'
      });
    }

    user.lastVerificationAttempt = new Date();
    user.verificationAttempts = (user.verificationAttempts || 0) + 1;

    if (user.verificationAttempts > maxAttempts) {
      user.verificationToken = undefined;
      await user.save();
      return res.render('verify', {
        title: 'Упс...',
        color: 'red',
        message: 'Слишком много попыток. Запросите код повторно.'
      });
    }

    if (user.verificationToken === token) {
      user.isVerified = true;
      user.verificationToken = undefined;
      user.verificationAttempts = 0;
      user.lastVerificationAttempt = null;
      await user.save();

      return res.render('verify', {
        title: '✅ Успех!',
        color: '#27ae60',
        message: 'Почта успешно подтверждена!'
      });
    }

    await user.save();
    return res.status(400).json({ message: 'Неверный код подтверждения' });
  } catch (err) {
    console.error('Ошибка верификации:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const resendVerification = async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });

    if (!user) return res.status(404).json({ message: 'Пользователь не найден' });
    if (user.isVerified) return res.status(400).json({ message: 'Почта уже подтверждена' });

    const newToken = randomBytes(32).toString('hex');
    user.verificationToken = newToken;
    await user.save();

    await sendVerificationEmail(user.email, newToken);
    res.json({ message: 'Письмо отправлено повторно' });
  } catch (err) {
    console.error('Ошибка отправки письма:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};


export const refreshSession = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if (!refreshToken) return res.status(401).json({ message: 'Нет refresh токена' });

    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

    const newAccessToken = jwt.sign({ id: decoded.id }, process.env.JWT_SECRET, { expiresIn: '15m' });
    const newRefreshToken = jwt.sign({ id: decoded.id }, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' });

    res.cookie('token', newAccessToken, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 1000 * 60 * 15,
    });

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      sameSite: 'Lax',
      maxAge: 1000 * 60 * 60 * 24 * 30,
    });

    res.status(200).json({ message: 'Токены обновлены' });
  } catch (err) {
    console.error('Ошибка при refresh:', err);
    res.status(401).json({ message: 'Невалидный refresh токен' });
  }
};
