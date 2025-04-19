import User from '../models/User.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { sendVerificationEmail } from '../utils/sendVerificationMail.js';

export const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(409).json({ message: 'Пользователь уже существует' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const verificationToken = randomBytes(32).toString('hex');

    const newUser = new User({
      email,
      name,
      password: hashedPassword,
      verificationToken,
      isVerified: false,
    });

    await newUser.save();

    try {
      const result = await sendVerificationEmail(email, verificationToken);
      console.log(result)
      res.status(201).json({ message: 'Пользователь зарегистрирован. Проверьте почту для подтверждения.' });
    } catch (emailErr) {
      await User.deleteOne({ email });
      console.error('Ошибка отправки письма:', emailErr);
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
    if (!user) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Неверный email или пароль' });
    }

    if(!user.isVerified) {
      const verificationToken = randomBytes(32).toString('hex');
      user.verificationToken = verificationToken;
      await user.save();
      await sendVerificationEmail(email, verificationToken);
      return res.status(401).json({ message: 'Пользователь не верифицирован, отправили письмо на почту' });
    }

    const token = jwt.sign(
      { id: user._id },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '30d' }
    );

    const { password: _, ...userData } = user.toObject();

    res.status(200).json({ user: userData, token });
  } catch (error) {
    console.error('Ошибка при входе:', error);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const verifyEmail = async (req, res) => {
  try {
    const { email, token } = req.query;
    const user = await User.findOne({ email});

    if (!user) {
      return res.render('verify', {
        title: 'Упс...',
        color: 'red',
        message: 'Кажется, такого пользователя не существует!'
      });
      
    }

    if (user.isVerified) {
      return res.render('verify', {
        title: '✅ Успех!',
        color: '#27ae60',
        message: 'Ваша почта уже подтверждена!'
      });
    }

    const cooldown = 60 * 1000;
    const maxAttempts = 10;

    if (
      user.lastVerificationAttempt &&
      Date.now() - user.lastVerificationAttempt.getTime() < cooldown
    ) {
      return res.render('verify', {
        title: 'Упс...',
        color: 'red',
        message: 'Кажется слишком много попыток, попробуйте через 1 минуту!'
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
        message: 'Слишком много попыток. Запросите новый код.'
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
        message: 'Вы подтвердили почту. Спасибо!'
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

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    if (user.isVerified) {
      return res.status(400).json({ message: 'Почта уже подтверждена' });
    }
    
    const newToken = crypto.randomBytes(32).toString('hex');
    user.verificationToken = newToken;
    await user.save();

    await sendVerificationEmail(user.email, newToken);

    res.json({ message: 'Письмо с подтверждением отправлено повторно' });
  } catch (err) {
    console.error('Ошибка повторной отправки:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};