// controllers/feedbackController.js
import mongoose from "mongoose";
import User from "../models/User.js";
import Ad from "../models/Ad.js";
import { getSystemChatForUser } from "../utils/getSystemChat.js";
import Message from "../models/Message.js";
import { getSystemUserId } from "../utils/getSystemUserId.js";

export const setFeedback = async (req, res) => {
  const SYSTEM_USER_ID = getSystemUserId();
  try {
    const authorId = req.userId;
    const targetId = req.params.id;
    const { text, rating, adId } = req.body;

    if (!mongoose.Types.ObjectId.isValid(targetId) || !mongoose.Types.ObjectId.isValid(adId)) {
      return res.status(400).json({ message: "Некорректный ID пользователя или объявления" });
    }

    if (authorId === targetId) {
      return res.status(400).json({ message: "Нельзя оставить отзыв самому себе" });
    }

    const targetUser = await User.findById(targetId);
    const authorUser = await User.findById(authorId);
    const ad = await Ad.findById(adId).select("title photos");

    if (!targetUser || !authorUser || !ad) {
      return res.status(404).json({ message: "Пользователь или объявление не найдены" });
    }

    const newFeedback = {
      author: {
        _id: authorUser._id,
        name: authorUser.name,
      },
      text,
      rating,
      ad: adId,
      createdAt: new Date(),
    };

    targetUser.feedbacks.push(newFeedback);

    const avgRating =
      targetUser.feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) /
      targetUser.feedbacks.length;
    targetUser.rating = Number(avgRating.toFixed(1));

    await targetUser.save();

    // ⛔ не уведомляем, если отзыв адресован системному пользователю
    if (targetId === SYSTEM_USER_ID) {
      return res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });
    }

    // ✅ проверка — оставлял ли уже продавец отзыв покупателю по этому объявлению
    const sellerHasAlreadyLeftFeedback = authorUser.feedbacks?.some(
      (fb) =>
        fb.author._id.toString() === targetId &&
        fb.ad?.toString() === adId
    );

    if (sellerHasAlreadyLeftFeedback) {
      return res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });
    }

    const systemChat = await getSystemChatForUser(targetId);

    const alreadySent = await Message.findOne({
      chatId: systemChat._id,
      "action.meta.toUser._id": authorUser._id,
      "action.meta.ad._id": ad._id,
      "action.type": "leave_feedback",
    });

    if (!alreadySent) {
      await Message.create({
        chatId: systemChat._id,
        sender: SYSTEM_USER_ID,
        text: `${targetUser.name} оставил отзыв о Вас`,
        action: {
          type: "leave_feedback",
          label: "Оставить отзыв",
          meta: {
            toUser: {
              _id: authorUser._id,
              name: authorUser.name,
            },
            ad: {
              _id: ad._id,
              title: ad.title,
              photo: ad.photos?.[0] || null,
            },
          },
        },
      });
    }

    res.status(201).json({ feedback: newFeedback, rating: targetUser.rating });
  } catch (err) {
    console.error("Ошибка добавления отзыва:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const getFeedback = async (req, res) => {
  try {
    const userId = req.params.id;
    const { page = 1, limit = 10 } = req.query;

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: "Некорректный ID пользователя" });
    }

    const user = await User.findById(userId).select("feedbacks rating");

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
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
    console.error("Ошибка получения отзывов:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};

export const deleteFeedback = async (req, res) => {
  try {
    const userId = req.userId;
    const targetId = req.params.id;
    const feedbackId = req.params.feedbackId;

    const user = await User.findById(targetId);

    if (!user) {
      return res.status(404).json({ message: "Пользователь не найден" });
    }

    const feedback = user.feedbacks.id(feedbackId);
    if (!feedback) {
      return res.status(404).json({ message: "Отзыв не найден" });
    }

    if (feedback.author._id.toString() !== userId) {
      return res
        .status(403)
        .json({ message: "Вы не можете удалить этот отзыв" });
    }

    feedback.remove();

    // Пересчёт рейтинга
    const feedbacks = user.feedbacks;
    const avgRating = feedbacks.length
      ? feedbacks.reduce((acc, curr) => acc + Number(curr.rating), 0) /
        feedbacks.length
      : 0;
    user.rating = Number(avgRating.toFixed(1));

    await user.save();
    res.json({ message: "Отзыв удалён", rating: user.rating });
  } catch (err) {
    console.error("Ошибка удаления отзыва:", err);
    res.status(500).json({ message: "Ошибка сервера" });
  }
};
