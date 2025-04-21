// controllers/feedbackController.js
import User from '../models/User.js';
import mongoose from 'mongoose';

export const setFeedback = async (req, res) => {
  try {
    const authorId = req.userId;
    const targetId = req.params.id;
    const { text, rating } = req.body;

    if (!mongoose.Types.ObjectId.isValid(targetId)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    if (authorId === targetId) {
      return res.status(400).json({ message: 'Нельзя оставить отзыв самому себе' });
    }

    const targetUser = await User.findById(targetId);
    const authorUser = await User.findById(authorId);

    if (!targetUser || !authorUser) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const alreadyLeft = targetUser.feedbacks.some(fb => fb.author._id.toString() === authorId);
    if (alreadyLeft) {
      return res.status(400).json({ message: 'Вы уже оставили отзыв этому пользователю' });
    }

    targetUser.feedbacks.push({
      author: {
        _id: authorUser._id,
        name: authorUser.name,
      },
      text,
      rating,
      createdAt: new Date(),
    });

    // Пересчитываем среднюю оценку
    const avgRating = targetUser.feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) / targetUser.feedbacks.length;
    targetUser.rating = Number(avgRating.toFixed(1));

    await targetUser.save();

    res.status(201).json({ message: 'Отзыв добавлен' });
  } catch (err) {
    console.error('Ошибка добавления отзыва:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getFeedback = async (req, res) => {
  try {
    const userId = req.params.id;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(userId).select('feedbacks');

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    res.json(user.feedbacks.slice().reverse());
  } catch (err) {
    console.error('Ошибка получения отзывов:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const deleteFeedback = async (req, res) => {
  try {
    const userId = req.userId;
    const targetId = req.params.id;
    const feedbackId = req.params.feedbackId;

    const user = await User.findById(targetId);

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const feedback = user.feedbacks.id(feedbackId);
    if (!feedback) {
      return res.status(404).json({ message: 'Отзыв не найден' });
    }

    if (feedback.author._id.toString() !== userId) {
      return res.status(403).json({ message: 'Вы не можете удалить этот отзыв' });
    }

    feedback.remove();

    const feedbacks = user.feedbacks;
    const avgRating = feedbacks.length
      ? feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) / feedbacks.length
      : 0;
    user.rating = Number(avgRating.toFixed(1));

    await user.save();
    res.json({ message: 'Отзыв удалён' });
  } catch (err) {
    console.error('Ошибка удаления отзыва:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
