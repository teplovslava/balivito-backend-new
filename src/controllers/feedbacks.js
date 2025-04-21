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

    const newFeedback = {
      author: {
        _id: authorUser._id,
        name: authorUser.name,
      },
      text,
      rating,
      createdAt: new Date(),
    };

    targetUser.feedbacks.push(newFeedback);

    // Пересчитываем среднюю оценку
    const avgRating = targetUser.feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) / targetUser.feedbacks.length;
    targetUser.rating = Number(avgRating.toFixed(1));

    await targetUser.save();

    res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });
  } catch (err) {
    console.error('Ошибка добавления отзыва:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};

export const getFeedback = async (req, res) => {
  try {
    const userId = req.params.id;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Некорректный ID пользователя' });
    }

    const user = await User.findById(userId).select('feedbacks rating');

    if (!user) {
      return res.status(404).json({ message: 'Пользователь не найден' });
    }

    const allFeedbacks = user.feedbacks.slice().reverse();
    const paginated = allFeedbacks.slice((page - 1) * limit, page * limit);

    res.json({
      items: paginated,
      rating: user.rating,
      pagination: {
        total: allFeedbacks.length,
        page: Number(page),
        limit: Number(limit),
        totalPages: Math.ceil(allFeedbacks.length / limit),
      },
    });
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

    // Пересчёт рейтинга
    const feedbacks = user.feedbacks;
    const avgRating = feedbacks.length
      ? feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) / feedbacks.length
      : 0;
    user.rating = Number(avgRating.toFixed(1));

    await user.save();
    res.json({ message: 'Отзыв удалён', rating: user.rating });
  } catch (err) {
    console.error('Ошибка удаления отзыва:', err);
    res.status(500).json({ message: 'Ошибка сервера' });
  }
};
